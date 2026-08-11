#!/usr/bin/env node
/**
 * Keeps arrival alerts honest by correcting stored arrival times against live flightradar24 data.
 *
 * WHY this runs on a Mac and not in the Worker: both fr24 endpoints it needs are same-origin-only
 * and a direct request gets a Cloudflare 403, so the call has to come from inside a loaded
 * flightradar24.com page. See scripts/lib/fr24-live.mjs.
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
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLiveArrival, isMaterialDrift } from "./lib/fr24-live.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
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

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "roaster-me-db", "--remote", "--json", "--command", sql],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  // wrangler prefixes the JSON with progress lines on some versions; take the array.
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start))[0]?.results ?? [];
}

function esc(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + args.hours * 3600_000).toISOString();

  const upcoming = d1(
    `SELECT id, flight_no, origin, dest, arr_utc, arrival_alert_stage FROM flights ` +
      `WHERE arr_utc >= ${esc(nowIso)} AND arr_utc <= ${esc(untilIso)} ORDER BY arr_utc;`
  );

  if (!upcoming.length) {
    console.log(`${nowIso} nothing arriving in the next ${args.hours}h`);
    return;
  }
  console.log(
    `${nowIso} ${upcoming.length} arrival(s) in the next ${args.hours}h, ` +
      `${args.apply ? "WILL WRITE to prod D1" : "dry-run"}`
  );

  const browser = await chromium
    .launch({ headless: true, channel: "chrome" })
    .catch(() => chromium.launch({ headless: true }));
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-GB" });
  const page = await ctx.newPage();
  await page.goto("https://www.flightradar24.com/", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(5000);

  const updates = [];
  for (const flight of upcoming) {
    const live = await fetchLiveArrival(page, flight.flight_no);

    if (live.blocked) {
      console.log(`  ${flight.flight_no}: BLOCKED (${live.reason}) - leaving the stored time alone`);
      continue;
    }
    if (!live.airborne || !live.liveArrival) {
      console.log(`  ${flight.flight_no}: not airborne yet, nothing to correct`);
      continue;
    }

    const storedEpoch = Math.round(Date.parse(flight.arr_utc) / 1000);
    if (!isMaterialDrift(storedEpoch, live.liveArrival)) {
      console.log(`  ${flight.flight_no}: on time (${live.statusText ?? "no status"})`);
      continue;
    }

    const driftMin = Math.round((live.liveArrival - storedEpoch) / 60);
    const newIso = new Date(live.liveArrival * 1000).toISOString();
    console.log(
      `  ${flight.flight_no}: ${driftMin > 0 ? `${driftMin} min late` : `${-driftMin} min early`} ` +
        `-> ${newIso} (${live.statusText ?? "no status"})`
    );

    // Clearing the stage re-arms 60/30/0 against the corrected time. Without it a delayed flight
    // keeps whatever stage it reached on the old schedule and goes quiet.
    updates.push(
      `UPDATE flights SET arr_utc = ${esc(newIso)}, arrival_alert_stage = NULL WHERE id = ${esc(flight.id)};`
    );
    await page.waitForTimeout(1500);
  }

  await browser.close();

  if (!updates.length) {
    console.log("no corrections needed");
    return;
  }
  if (!args.apply) {
    console.log(`\n--- would run ${updates.length} update(s) (pass --apply) ---`);
    console.log(updates.join("\n"));
    return;
  }
  d1(updates.join(" "));
  console.log(`applied ${updates.length} correction(s)`);
}

// Importing this module for parseArgs in tests must not launch a browser.
if (process.argv[1] && process.argv[1].endsWith("refresh-arrivals.mjs")) {
  await main();
}
