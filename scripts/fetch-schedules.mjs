#!/usr/bin/env node
/**
 * Harvests flightradar24 schedule data with a real, locally-launched Chrome and writes it
 * into production D1's flight_schedules table.
 *
 * WHY a local fetcher: the Worker's own fetch() to flightradar24 is fingerprint/egress-blocked
 * (a production lookup for EK247 recorded a miss), while the same page fetched by real Chrome
 * on this Mac yields every row. See docs/DECISIONS.md and scripts/lib/fr24-parse.mjs.
 *
 * The Worker's own scrape-fr24.ts provider (worker/src/schedule-providers/scrape-fr24.ts)
 * stays in place as a fallback for the cache-miss path - it isn't touched by this script.
 *
 * Usage:
 *   node scripts/fetch-schedules.mjs --flights EK247,EK49        # dry-run (default: prints
 *                                                                 # SQL, writes nothing)
 *   node scripts/fetch-schedules.mjs --range 0-999 --limit 50    # first 50 not-yet-done of
 *                                                                 # EK0..EK999
 *   node scripts/fetch-schedules.mjs --flights EK247 --apply     # actually writes to prod D1
 *   node scripts/fetch-schedules.mjs --range 0-999 --force       # ignore progress file, redo
 *
 * Flags:
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
import { execFileSync } from "node:child_process";
import { normaliseFlightNo } from "../shared/src/flight.ts";
import { deriveLegSchedule, looksBlocked, parseFr24Rows } from "./lib/fr24-parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.join(__dirname, ".fetch-progress.json");
const TMP_SQL_FILE = path.join(__dirname, ".fetch-schedules-tmp.sql");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
// ponytail: fixed context-refresh cadence, not measured against a real block threshold - lower
// it (or make it adaptive on a blocked/empty response) if a long sweep still gets rate-limited.
const CONTEXT_REFRESH_EVERY = 25;
// How many resolved flights to batch into one D1 write. Bounds how much a kill can lose, at the
// cost of one wrangler invocation per batch.
const FLUSH_EVERY = 20;

export function parseArgs(argv) {
  const args = { delay: 8000, limit: Infinity, apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--flights") args.flights = argv[++i];
    else if (a === "--range") args.range = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--delay") args.delay = Number(argv[++i]);
    else if (a === "--apply") args.apply = true;
    else if (a === "--retry-missing") args.retryMissing = true;
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") void 0; // no-op: dry-run is already the default without --apply
  }
  if (!args.flights && !args.range) throw new Error("pass --flights EK247,EK49 or --range 0-999");
  return args;
}

export function expandFlights(args) {
  if (args.flights)
    return args.flights
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const [lo, hi] = args.range.split("-").map(Number);
  const out = [];
  for (let n = lo; n <= hi; n++) out.push(`EK${n}`);
  return out;
}

/**
 * Progress is {done, missing}. `missing` is separate because fr24 returning zero rows is NOT
 * proof a flight doesn't exist: EK245 came back empty here, yet vradarserver/standing-data has
 * it as UAE245 OMDB-SBGL-SCEL. Keeping those apart lets a later pass re-check them without
 * --force, which would also throw away the flights that did resolve.
 */
function loadProgress() {
  const empty = { done: new Set(), missing: new Set() };
  if (!existsSync(PROGRESS_FILE)) return empty;
  try {
    const raw = JSON.parse(readFileSync(PROGRESS_FILE, "utf8"));
    if (Array.isArray(raw)) return { done: new Set(raw), missing: new Set() }; // pre-split format
    return { done: new Set(raw.done ?? []), missing: new Set(raw.missing ?? []) };
  } catch {
    return empty;
  }
}

function saveProgress(progress) {
  writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({ done: [...progress.done], missing: [...progress.missing] })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toInsertSql(row) {
  const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
  return (
    `INSERT INTO flight_schedules (flight_no, leg_seq, origin, dest, dep_local, arr_local, day_offset, days_of_week, source) VALUES ` +
    `(${esc(row.flightNo)}, ${row.legSeq}, ${esc(row.origin)}, ${esc(row.dest)}, ${esc(row.depLocal)}, ${esc(row.arrLocal)}, ${row.dayOffset}, ${esc(row.daysOfWeek)}, ${esc(row.source)}) ` +
    `ON CONFLICT(flight_no, leg_seq) DO UPDATE SET origin=excluded.origin, dest=excluded.dest, dep_local=excluded.dep_local, arr_local=excluded.arr_local, day_offset=excluded.day_offset, days_of_week=excluded.days_of_week, source=excluded.source;`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidates = [...new Set(expandFlights(args).map(normaliseFlightNo))];
  const progress = args.force ? { done: new Set(), missing: new Set() } : loadProgress();
  const skip = args.retryMissing ? progress.done : new Set([...progress.done, ...progress.missing]);
  const queue = candidates.filter((f) => !skip.has(f)).slice(0, args.limit);

  if (!queue.length) {
    console.log("nothing to do (all flights already in progress file - use --force to redo)");
    return;
  }
  console.log(
    `${queue.length} flight(s) to fetch, ${args.apply ? "WILL WRITE to prod D1" : "dry-run (pass --apply to write)"}`
  );

  const browser = await chromium
    .launch({ headless: false, channel: "chrome" })
    .catch(() => chromium.launch({ headless: false }));
  let ctx = await browser.newContext({ userAgent: UA, locale: "en-GB" });
  let page = await ctx.newPage();

  const sqlStatements = [];
  const tally = { found: 0, notFound: 0, blocked: 0, written: 0 };
  const retried = new Map();
  // Flights whose SQL is built but not yet in D1. They are only marked done once written -
  // a kill mid-sweep used to leave 62 flights recorded as done with nothing written, because
  // progress was per-flight while the write was one batch at the very end.
  let unflushed = [];

  const flush = () => {
    if (!args.apply || !unflushed.length) return;
    const sql = unflushed.flatMap((f) => f.sql);
    mkdirSync(path.dirname(TMP_SQL_FILE), { recursive: true });
    writeFileSync(TMP_SQL_FILE, sql.join("\n") + "\n");
    console.log(`  flushing ${sql.length} statement(s) for ${unflushed.length} flight(s) to D1`);
    // npx, not a bare `wrangler`: it's a devDependency here, not a global install.
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "roaster-me-db", "--remote", "--file", TMP_SQL_FILE],
      { stdio: ["ignore", "ignore", "inherit"], cwd: path.join(__dirname, "..") }
    );
    tally.written += sql.length;
    for (const f of unflushed) progress.done.add(f.flight);
    saveProgress(progress);
    unflushed = [];
  };

  for (let i = 0; i < queue.length; i++) {
    const flight = queue[i];
    if (i > 0 && i % CONTEXT_REFRESH_EVERY === 0) {
      await ctx.close();
      ctx = await browser.newContext({ userAgent: UA, locale: "en-GB" });
      page = await ctx.newPage();
    }

    let html = "";
    try {
      await page.goto(`https://www.flightradar24.com/data/flights/${flight.toLowerCase()}`, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForTimeout(3500);
      html = await page.content();
    } catch (e) {
      console.log(`${flight}: ERROR ${String(e).slice(0, 100)}`);
      await sleep(args.delay);
      continue;
    }

    const rows = parseFr24Rows(html);
    if (!rows.length) {
      if (looksBlocked(html)) {
        // A challenge is a burst signal, not a verdict on the flight: measured 2-of-3 blocked
        // back-to-back at 4s, while every one of those flights resolved when fetched alone.
        // So retry once behind a fresh context - a rerun of the whole sweep is a poor substitute
        // when the block rate is this high.
        if ((retried.get(flight) ?? 0) < 1) {
          retried.set(flight, 1);
          console.log(`${flight}: BLOCKED (challenge page) - fresh context, retrying once`);
          await ctx.close();
          ctx = await browser.newContext({ userAgent: UA, locale: "en-GB" });
          page = await ctx.newPage();
          await sleep(args.delay * 3);
          i--; // retry the same flight
          continue;
        }
        tally.blocked++;
        console.log(`${flight}: BLOCKED twice - backing off, not marked done`);
        await sleep(args.delay * 3);
        continue; // NOT added to `done` - retried on next run
      }
      tally.notFound++;
      console.log(`${flight}: not found (0 rows, no challenge marker)`);
      progress.missing.add(flight);
      saveProgress(progress);
      await sleep(args.delay);
      continue;
    }

    const legs = deriveLegSchedule(rows);
    tally.found++;
    const dateCount = new Set(rows.map((r) => r.dateText)).size;
    console.log(`${flight}: found - ${legs.length} leg(s) across ${dateCount} sampled date(s)`);
    const flightSql = [];
    for (const leg of legs) {
      flightSql.push(
        toInsertSql({
          flightNo: flight,
          legSeq: leg.legSeq,
          origin: leg.origin,
          dest: leg.dest,
          depLocal: leg.depLocal,
          arrLocal: leg.arrLocal,
          dayOffset: leg.dayOffset,
          daysOfWeek: leg.daysOfWeek,
          source: "local-fetch",
        })
      );
    }
    sqlStatements.push(...flightSql);
    unflushed.push({ flight, sql: flightSql });
    if (unflushed.length >= FLUSH_EVERY) flush();
    await sleep(args.delay);
  }

  flush();
  await browser.close();

  if (!args.apply) {
    console.log(`\n--- SQL (${sqlStatements.length} statement(s)) ---`);
    console.log(sqlStatements.join("\n") || "(none)");
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
