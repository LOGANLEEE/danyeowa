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

export function parseArgs(argv) {
  const args = { delay: 4000, limit: Infinity, apply: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--flights") args.flights = argv[++i];
    else if (a === "--range") args.range = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--delay") args.delay = Number(argv[++i]);
    else if (a === "--apply") args.apply = true;
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

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(PROGRESS_FILE, "utf8")));
  } catch {
    return new Set();
  }
}

function saveProgress(done) {
  writeFileSync(PROGRESS_FILE, JSON.stringify([...done]));
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
  const done = args.force ? new Set() : loadProgress();
  const queue = candidates.filter((f) => !done.has(f)).slice(0, args.limit);

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
        tally.blocked++;
        console.log(`${flight}: BLOCKED (challenge page) - backing off, not marked done`);
        await sleep(args.delay * 3);
        continue; // NOT added to `done` - retried on next run
      }
      tally.notFound++;
      console.log(`${flight}: not found (0 rows, no challenge marker)`);
      done.add(flight);
      saveProgress(done);
      await sleep(args.delay);
      continue;
    }

    const legs = deriveLegSchedule(rows);
    tally.found++;
    const dateCount = new Set(rows.map((r) => r.dateText)).size;
    console.log(`${flight}: found - ${legs.length} leg(s) across ${dateCount} sampled date(s)`);
    for (const leg of legs) {
      sqlStatements.push(
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
    done.add(flight);
    saveProgress(done);
    await sleep(args.delay);
  }

  await browser.close();

  console.log(`\n--- SQL (${sqlStatements.length} statement(s)) ---`);
  console.log(sqlStatements.join("\n") || "(none)");

  if (args.apply && sqlStatements.length) {
    mkdirSync(path.dirname(TMP_SQL_FILE), { recursive: true });
    writeFileSync(TMP_SQL_FILE, sqlStatements.join("\n") + "\n");
    console.log(`\nApplying via wrangler d1 execute -> ${TMP_SQL_FILE}`);
    execFileSync("wrangler", ["d1", "execute", "roaster-me-db", "--remote", "--file", TMP_SQL_FILE], {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    tally.written = sqlStatements.length;
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
