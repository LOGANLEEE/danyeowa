/**
 * POC: can a real browser on this Mac harvest usable schedule data from flightradar24?
 *
 * The Worker's scraper is fingerprint-blocked (403 to curl/fetch) and, even when it parses,
 * it keeps only the FIRST row and ignores the requested date — which is why a flight with two
 * departures a day (EK247: 08:05 to GIG, 17:25 to EZE) cannot be represented today.
 *
 * This measures what is actually extractable: every row, with its date, so we can judge
 *   (a) whether a local fetcher is viable at all,
 *   (b) what a multi-departure chooser would have to work with,
 *   (c) how long a sweep would take.
 *
 * Run: node scripts/poc-local-fetch.mjs EK247 EK49 EK412
 */
import { chromium } from "@playwright/test";

const FLIGHTS = process.argv.slice(2).length ? process.argv.slice(2) : ["EK247", "EK49", "EK412"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const browser = await chromium.launch({ headless: false, channel: "chrome" }).catch(() =>
  chromium.launch({ headless: false }),
);
const ctx = await browser.newContext({ userAgent: UA, locale: "en-GB" });
const page = await ctx.newPage();

const timings = [];

for (const flight of FLIGHTS) {
  const t0 = Date.now();
  let rows = [];
  let note = "";
  try {
    await page.goto(`https://www.flightradar24.com/data/flights/${flight.toLowerCase()}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(3500);

    rows = await page.evaluate(() => {
      const out = [];
      for (const tr of document.querySelectorAll("table tr")) {
        const cells = [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim());
        if (cells.length < 5) continue;
        const line = cells.join(" | ");
        // A data row carries a date and at least one HH:MM.
        if (!/\d{1,2}\s+\w{3}\s+\d{4}/.test(line) || !/\d{2}:\d{2}/.test(line)) continue;
        out.push({
          date: (line.match(/\d{1,2}\s+\w{3}\s+\d{4}/) || [])[0] ?? null,
          iata: [...new Set(line.match(/\(([A-Z]{3})\)/g) || [])].map((s) => s.replace(/[()]/g, "")),
          times: (line.match(/\b\d{2}:\d{2}\b/g) || []).slice(0, 4),
          raw: line.slice(0, 120),
        });
      }
      return out;
    });
    if (!rows.length) note = "no parseable rows (challenge or layout change?)";
  } catch (e) {
    note = String(e).slice(0, 70);
  }
  const ms = Date.now() - t0;
  timings.push(ms);

  console.log(`\n=== ${flight}  (${ms}ms, ${rows.length} rows) ${note}`);
  // Group by date: more than one row for the same date === multiple departures that day.
  const byDate = new Map();
  for (const r of rows) {
    if (!r.date) continue;
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  }
  const dates = [...byDate.entries()].slice(0, 6);
  for (const [date, rs] of dates) {
    const flag = rs.length > 1 ? `  <-- ${rs.length} DEPARTURES THIS DAY` : "";
    console.log(`  ${date}${flag}`);
    for (const r of rs.slice(0, 3)) console.log(`     ${r.iata.join("→") || "?"}  ${r.times.join(" ")}`);
  }
}

await browser.close();

const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
console.log(`\n--- avg ${avg}ms per flight`);
console.log(`--- a 1000-number sweep at this rate + 3s politeness delay ≈ ${Math.round(((avg + 3000) * 1000) / 60000)} min`);
