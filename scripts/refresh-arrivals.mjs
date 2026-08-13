#!/usr/bin/env node
/**
 * Keeps arrival alerts honest by correcting stored arrival times against live flightradar24 data.
 *
 * WHY this runs on a Mac and not in the Worker: both fr24 endpoints it needs are same-origin-only
 * and a direct request gets a Cloudflare 403, so the call has to come from inside a loaded
 * flightradar24.com page. See scripts/lib/fr24-live.mjs.
 *
 * It holds no database credentials. Reads and writes go through the Worker's /api/ingest routes,
 * which validate against the same schema the app reads — see scripts/lib/ingest-client.mjs.
 *
 * What it does: finds flights in production D1 arriving within the next few hours, asks fr24 for
 * each one's live estimate, and writes back any material drift. When an arrival MOVES, it also
 * clears arrival_alert_stage so the 60/30/0 alerts re-arm against the corrected time — otherwise
 * a two-hour delay would leave a flight that had already been announced as "landing now".
 *
 * Usage:
 *   node scripts/refresh-arrivals.mjs                # dry-run: prints what it would change
 *   node scripts/refresh-arrivals.mjs --apply        # writes to production D1
 *   node scripts/refresh-arrivals.mjs --hours 6      # widen the window (default 4)
 *
 * Run it from cron every 15 minutes, matching the Worker's alert scan. See docs/RUNBOOK.md for
 * the crontab line (it can't live in this comment — a cron schedule contains the characters that
 * end a block comment).
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { borrowChromeProfile, fetchLiveArrival, isMaterialDrift } from "./lib/fr24-live.mjs";
import { getUpcomingArrivals, postArrivalCorrections } from "./lib/ingest-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const PROFILE_SCRATCH = path.join(os.tmpdir(), "danyeowa-chrome-profile");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function parseArgs(argv) {
  const args = { apply: false, hours: 4 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--hours") args.hours = Number(argv[++i]);
  }
  return args;
}

/**
 * Runs one statement against production D1, retrying transient API failures.
 *
 * Cloudflare answers a concurrent or rate-limited request with 7403 "account is not valid or is
 * not authorized", which reads like a broken credential but is not: the same command succeeds
 * moments later, and the harvester writing at the same time is enough to provoke it. Without a
 * retry a single one of those killed the whole run — four occurrences, two dead runs, while the
 * schedule harvester carried on fine because its writes already retried.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();

  const upcoming = await getUpcomingArrivals(args.hours);

  if (!upcoming.length) {
    console.log(`${nowIso} nothing arriving in the next ${args.hours}h`);
    return;
  }
  console.log(
    `${nowIso} ${upcoming.length} arrival(s) in the next ${args.hours}h, ` +
      `${args.apply ? "WILL WRITE to prod D1" : "dry-run"}`
  );

  // Two things are needed to get past the 403 that a plain Playwright context hits, and BOTH
  // were measured — cookies alone still got 403, and automation flags alone were never tried
  // without them:
  //   - the real Chrome profile's cookies, copied so the browser can stay open
  //   - automation markers off, since navigator.webdriver is what a bot check reads first
  const ctx = await chromium.launchPersistentContext(borrowChromeProfile(PROFILE_SCRATCH), {
    headless: true,
    channel: "chrome",
    userAgent: UA,
    locale: "en-GB",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.flightradar24.com/", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(5000);

  const updates = [];
  for (const flight of upcoming) {
    const live = await fetchLiveArrival(page, flight.flightNo);

    if (live.blocked) {
      console.log(`  ${flight.flightNo}: BLOCKED (${live.reason}) - leaving the stored time alone`);
      continue;
    }
    if (!live.airborne || !live.liveArrival) {
      console.log(`  ${flight.flightNo}: not airborne yet, nothing to correct`);
      continue;
    }

    const storedEpoch = Math.round(Date.parse(flight.arrUtc) / 1000);
    if (!isMaterialDrift(storedEpoch, live.liveArrival)) {
      console.log(`  ${flight.flightNo}: on time (${live.statusText ?? "no status"})`);
      continue;
    }

    const driftMin = Math.round((live.liveArrival - storedEpoch) / 60);
    const newIso = new Date(live.liveArrival * 1000).toISOString();
    console.log(
      `  ${flight.flightNo}: ${driftMin > 0 ? `${driftMin} min late` : `${-driftMin} min early`} ` +
        `-> ${newIso} (${live.statusText ?? "no status"})`
    );

    // The server clears arrival_alert_stage on apply, which re-arms 60/30/0 against the
    // corrected time — without that a delayed flight keeps the stage it reached on the old
    // schedule and goes quiet.
    updates.push({ flightId: flight.id, arrUtc: newIso });
    await page.waitForTimeout(1500);
  }

  await ctx.close();

  if (!updates.length) {
    console.log("no corrections needed");
    return;
  }
  if (!args.apply) {
    console.log(`\n--- would correct ${updates.length} flight(s) (pass --apply) ---`);
    for (const u of updates) console.log(`  ${u.flightId} -> ${u.arrUtc}`);
    return;
  }
  const result = await postArrivalCorrections(updates);
  console.log(`applied ${result.updated} correction(s)`);
}

// Importing this module for parseArgs in tests must not launch a browser.
if (process.argv[1] && process.argv[1].endsWith("refresh-arrivals.mjs")) {
  try {
    await main();
  } catch (e) {
    // A cron log full of stack traces hides the one line that matters. Fail loudly but briefly;
    // the next run is fifteen minutes away and nothing was half-written.
    console.log(`${new Date().toISOString()} FAILED: ${String(e).split("\n")[0].slice(0, 200)}`);
    process.exitCode = 1;
  }
}
