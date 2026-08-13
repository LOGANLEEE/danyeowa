#!/usr/bin/env node
/**
 * Harvests flightradar24 schedule data with a real, locally-launched Chrome and writes it
 * into production D1's flight_schedules table.
 *
 * WHY a local fetcher: fr24's API answers from inside a loaded flightradar24.com page but
 * returns a Cloudflare 403 to a direct request, so a Worker fetch cannot reach it and real
 * Chrome can. See docs/DECISIONS.md and scripts/lib/fr24-api.mjs.
 *
 * It reads api.flightradar24.com/common/v1/flight/list.json rather than scraping the HTML
 * flight page. The JSON carries UTC epochs and per-airport timezone offsets, so leg order,
 * local clock times and the arrival day offset are arithmetic instead of inference - and a
 * challenge arrives as HTML where a real answer arrives as JSON, which is the difference
 * between "blocked" and "no such flight" that the scraper could never see.
 *
 * The Worker's own scrape-fr24.ts provider (worker/src/schedule-providers/scrape-fr24.ts)
 * stays in place as a fallback for the cache-miss path - it isn't touched by this script.
 *
 * It holds no database credentials: every write goes through the Worker's /api/ingest routes,
 * which validate against the same schema the app reads. Needs INGEST_TOKEN in the environment.
 *
 * Usage:
 *   node scripts/fetch-schedules.mjs --live-roster --limit 20    # the cron mode
 *   node scripts/fetch-schedules.mjs --flights EK247,EK49        # dry-run (default: prints
 *                                                                 # SQL, writes nothing)
 *   node scripts/fetch-schedules.mjs --range 0-999 --limit 50    # first 50 not-yet-done of
 *                                                                 # EK0..EK999
 *   node scripts/fetch-schedules.mjs --flights EK247 --apply     # actually writes to prod D1
 *   node scripts/fetch-schedules.mjs --range 0-999 --force       # ignore progress file, redo
 *
 * Flags:
 *   --live-roster           work from the flight numbers fr24 shows airborne, accumulated across
 *                           runs, instead of guessing at a numeric range
 *   --flights EK247,EK49   explicit comma-separated flight numbers
 *   --range 0-999           EK0..EK999 (numeric range, always EK-prefixed)
 *   --limit N               cap on how many not-yet-done flights this run attempts
 *   --delay MS               ms between flights (default 4000 - fr24 rate-limits bursts; the
 *                            POC saw a flight return 0 rows right after a successful one, then
 *                            work fine when retried alone)
 *   --apply                 write to production D1 (default: dry-run - print SQL only)
 *   --force                 ignore .fetch-progress.json, reprocess already-done flights
 *   --retry-missing         re-attempt flights fr24 returned empty for (see below)
 *
 * Progress records `done` (written to D1) and `missing` (fr24 returned no rows) separately.
 * Empty is not proof of nonexistence - EK245 came back empty here yet exists as UAE245
 * (OMDB-SBGL-SCEL) in vradarserver/standing-data - so `missing` is re-checkable with
 * --retry-missing without --force throwing away the flights that did resolve.
 *
 * Only --apply records progress as done: a dry-run writes nothing, so it must not claim to.
 *
 * Resumable: every completed flight number is appended to scripts/.fetch-progress.json
 * (gitignored) and skipped on a re-run unless --force - a large sweep can be interrupted and
 * picked back up.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normaliseFlightNo } from "../shared/src/flight.ts";
import os from "node:os";
import { deriveAirports, deriveLegSchedule } from "./lib/fr24-api.mjs";
import { borrowChromeProfile, fetchAirlineFlightNumbers } from "./lib/fr24-live.mjs";
import { postSchedules } from "./lib/ingest-client.mjs";
import { expandFlights, parseArgs } from "./lib/harvest-args.mjs";

export { expandFlights, parseArgs };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.join(__dirname, ".fetch-progress.json");
const PROFILE_SCRATCH = path.join(os.tmpdir(), "danyeowa-chrome-profile");

/** One row per IATA across a batch — the same airport shows up on every flight that touches it. */
function dedupeAirports(airports) {
  const byIata = new Map();
  for (const a of airports) if (!byIata.has(a.iata)) byIata.set(a.iata, a);
  return [...byIata.values()];
}
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
// ponytail: fixed context-refresh cadence, not measured against a real block threshold - lower
// it (or make it adaptive on a blocked/empty response) if a long sweep still gets rate-limited.
const CONTEXT_REFRESH_EVERY = 25;
// How many resolved flights to batch into one D1 write. Bounds how much a kill can lose, at the
// cost of one ingest call per batch. Kept low because long runs here get killed: three
// background sweeps died, one after only 12 flights, and at 20 that one banked nothing.
const FLUSH_EVERY = 5;

/**
 * Progress is {done, missing}. `missing` is separate because fr24 returning zero rows is NOT
 * proof a flight doesn't exist: EK245 came back empty here, yet vradarserver/standing-data has
 * it as UAE245 OMDB-SBGL-SCEL. Keeping those apart lets a later pass re-check them without
 * --force, which would also throw away the flights that did resolve.
 */
function loadProgress() {
  const empty = { done: new Set(), missing: new Set(), roster: new Set() };
  if (!existsSync(PROGRESS_FILE)) return empty;
  try {
    const raw = JSON.parse(readFileSync(PROGRESS_FILE, "utf8"));
    if (Array.isArray(raw)) return { ...empty, done: new Set(raw) }; // pre-split format
    return {
      done: new Set(raw.done ?? []),
      missing: new Set(raw.missing ?? []),
      // Flight numbers seen airborne, accumulated across runs. This is the sweep's work list.
      roster: new Set(raw.roster ?? []),
    };
  } catch {
    return empty;
  }
}

function saveProgress(progress) {
  writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({
      done: [...progress.done],
      missing: [...progress.missing],
      roster: [...progress.roster],
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The API is same-site-only in practice: a direct request from node gets a Cloudflare 403, while
 * the identical request issued from a loaded flightradar24.com page succeeds. So land on the site
 * once per context, then call the API from inside it.
 */
async function primePage(page) {
  await page.goto("https://www.flightradar24.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(5000);
}

/**
 * Blocked and absent are now distinguishable without guessing: a challenge comes back as HTML,
 * a real answer as JSON. The HTML scraper could only see "zero rows" and had to sniff the body
 * for challenge wording, which silently misclassified live flights as nonexistent.
 */
async function fetchFlight(page, flight) {
  return page.evaluate(async (no) => {
    try {
      const r = await fetch(
        `https://api.flightradar24.com/common/v1/flight/list.json?query=${no}&fetchBy=flight&page=1&limit=25`,
        { headers: { accept: "application/json" } }
      );
      const contentType = r.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        return { blocked: true, reason: `http ${r.status}, ${contentType.split(";")[0] || "no type"}`, items: [] };
      }
      const j = await r.json();
      return { blocked: false, items: j?.result?.response?.data || [] };
    } catch (e) {
      return { blocked: true, reason: String(e).slice(0, 60), items: [] };
    }
  }, flight);
}

/** Launch options that get past fr24's bot check. See scripts/lib/fr24-live.mjs. */
function contextOptions() {
  return {
    headless: true,
    channel: "chrome",
    userAgent: UA,
    locale: "en-GB",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  };
}

async function newPrimedContext() {
  const ctx = await chromium.launchPersistentContext(
    borrowChromeProfile(PROFILE_SCRATCH),
    contextOptions()
  );
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await primePage(page);
  return { ctx, page };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const progress = loadProgress();

  let ctx = null;
  let page = null;

  // The roster comes from the browser, so with --live-roster the browser has to start before
  // there is a queue to justify it.
  if (args.liveRoster) {
    ({ ctx, page } = await newPrimedContext());
    const live = await fetchAirlineFlightNumbers(page, "UAE");
    if (live.blocked) {
      console.log(`live roster: BLOCKED (http ${live.status}) - falling back to what is stored`);
    } else {
      const before = progress.roster.size;
      for (const no of live.numbers) progress.roster.add(normaliseFlightNo(no));
      saveProgress(progress);
      console.log(
        `live roster: ${live.numbers.length} airborne, ${progress.roster.size - before} new, ` +
          `${progress.roster.size} known total`
      );
    }
  }

  const candidates = args.liveRoster
    ? [...progress.roster]
    : [...new Set(expandFlights(args).map(normaliseFlightNo))];

  // --force re-does flights, it does NOT wipe the file. It used to start from empty sets and
  // save over the top, which silently threw away the whole resume bookmark: a --force run on two
  // flights erased a 36-flight sweep.
  const skip = args.force
    ? new Set()
    : args.retryMissing
      ? progress.done
      : new Set([...progress.done, ...progress.missing]);
  const queue = candidates.filter((f) => !skip.has(f)).slice(0, args.limit);

  if (!queue.length) {
    console.log("nothing to do (all flights already in progress file - use --force to redo)");
    if (ctx) await ctx.close();
    return;
  }
  console.log(
    `${queue.length} flight(s) to fetch, ${args.apply ? "WILL WRITE to prod D1" : "dry-run (pass --apply to write)"}`
  );

  if (!ctx) ({ ctx, page } = await newPrimedContext());

  const tally = { found: 0, notFound: 0, blocked: 0, written: 0 };
  const retried = new Map();
  // Flights whose SQL is built but not yet in D1. They are only marked done once written -
  // a kill mid-sweep used to leave 62 flights recorded as done with nothing written, because
  // progress was per-flight while the write was one batch at the very end.
  let unflushed = [];

  /**
   * A failed write must not end the sweep. One batch died on `Authentication error [code: 10000]`
   * from the D1 import endpoint, and the identical command against the identical file succeeded
   * moments later with the same OAuth token - so treat a write failure as transient: retry, and
   * if it still fails, keep the batch queued for the next flush rather than losing an hour of
   * fetching. Nothing is marked done until it is actually in D1.
   */
  /**
   * Ships a batch to the Worker, retrying transient failures.
   *
   * Nothing is marked done until the server has it: a kill mid-sweep used to leave 62 flights
   * recorded as done with nothing written, because progress was per-flight while the write was
   * one batch at the very end.
   */
  const flush = async () => {
    if (!args.apply || !unflushed.length) return;
    const payload = {
      airports: dedupeAirports(unflushed.flatMap((f) => f.airports)),
      flights: unflushed.map((f) => ({ flightNo: f.flight, legs: f.legs })),
    };
    console.log(
      `  posting ${payload.flights.length} flight(s), ${payload.airports.length} airport(s) to ingest`
    );
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await postSchedules(payload);
        tally.written += result.legs ?? 0;
        for (const f of unflushed) progress.done.add(f.flight);
        saveProgress(progress);
        unflushed = [];
        return;
      } catch (e) {
        console.log(`  ingest attempt ${attempt}/3 failed: ${String(e).slice(0, 120)}`);
        if (attempt < 3) await sleep(5000 * attempt);
      }
    }
    console.log(`  ingest FAILED - ${unflushed.length} flight(s) stay queued for the next flush`);
  };

  for (let i = 0; i < queue.length; i++) {
    const flight = queue[i];
    if (i > 0 && i % CONTEXT_REFRESH_EVERY === 0) {
      await ctx.close();
      ({ ctx, page } = await newPrimedContext());
    }

    const res = await fetchFlight(page, flight);

    if (res.blocked) {
      // A challenge is a burst signal, not a verdict on the flight. Retry once behind a fresh
      // context; a rerun of the whole sweep is a poor substitute when a run gets challenged.
      if ((retried.get(flight) ?? 0) < 1) {
        retried.set(flight, 1);
        console.log(`${flight}: BLOCKED (${res.reason}) - fresh context, retrying once`);
        await ctx.close();
        ({ ctx, page } = await newPrimedContext());
        await sleep(args.delay * 3);
        i--; // retry the same flight
        continue;
      }
      tally.blocked++;
      console.log(`${flight}: BLOCKED twice - backing off, not marked done`);
      await sleep(args.delay * 3);
      continue; // NOT added to `done` - retried on next run
    }

    if (!res.items.length) {
      // A JSON 200 carrying zero items is fr24 answering "no data for this flight", which is a
      // real answer - unlike the HTML page, where empty was indistinguishable from a soft block.
      tally.notFound++;
      console.log(`${flight}: not found (API returned 0 items)`);
      progress.missing.add(flight);
      saveProgress(progress);
      await sleep(args.delay);
      continue;
    }

    const legs = deriveLegSchedule(res.items);
    if (!legs.length) {
      tally.notFound++;
      console.log(`${flight}: ${res.items.length} item(s) but none with scheduled times`);
      progress.missing.add(flight);
      saveProgress(progress);
      await sleep(args.delay);
      continue;
    }
    tally.found++;
    // Airports first: a schedule row pointing at an unknown IATA makes the lookup 404 the flight.
    const airports = deriveAirports(res.items);
    console.log(
      `${flight}: found - ${legs.length} leg(s) from ${res.items.length} sampled flight(s)` +
        `, ${airports.length} airport(s)`
    );
    const flightLegs = [];
    for (const leg of legs) {
      flightLegs.push({
        legSeq: leg.legSeq,
        origin: leg.origin,
        dest: leg.dest,
        depLocal: leg.depLocal,
        arrLocal: leg.arrLocal,
        dayOffset: leg.dayOffset,
        daysOfWeek: leg.daysOfWeek,
      });
    }
    unflushed.push({ flight, legs: flightLegs, airports });
    if (unflushed.length >= FLUSH_EVERY) await flush();
    await sleep(args.delay);
  }

  await flush();
  await ctx.close();

  if (!args.apply) {
    console.log(`\n--- dry-run: ${unflushed.length} flight(s) would be posted to ingest ---`);
    for (const f of unflushed) {
      for (const leg of f.legs) {
        console.log(`  ${f.flight} leg ${leg.legSeq}  ${leg.origin}->${leg.dest}  ${leg.depLocal}-${leg.arrLocal}  +${leg.dayOffset}d  ${leg.daysOfWeek}`);
      }
    }
  }

  console.log(
    `\n--- tally: found=${tally.found} not-found=${tally.notFound} blocked=${tally.blocked} written=${tally.written}`
  );
}

// Only run the CLI when executed directly (`node scripts/fetch-schedules.mjs ...`) - importing
// this module for its exports (parseArgs/expandFlights) must not launch a browser as a side
// effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
