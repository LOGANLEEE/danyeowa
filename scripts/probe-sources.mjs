/**
 * Can we actually get flight schedules, and from where?
 *
 * Four experiments, because the answer differs per client and the difference is the whole point:
 *   A. server-side fetch          — what a Cloudflare Worker sees (no JS, datacentre IP)
 *   B. real browser, flightradar24 — what your Mac sees (real TLS fingerprint, residential IP)
 *   C. real browser, Google search — same, against Google's flight card
 *   D. in-page fetch to Google     — what the app's own JS could do (CORS)
 *
 * Run: node scripts/probe-sources.mjs [FLIGHTNO]
 */
import { chromium } from "@playwright/test";

const FLIGHT = (process.argv[2] || "EK247").toUpperCase();
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const results = [];
const record = (name, verdict, detail) => {
  results.push({ name, verdict, detail });
  console.log(`${verdict === "WORKS" ? "✓" : "✗"} ${name.padEnd(34)} ${verdict.padEnd(8)} ${detail}`);
};

// ---------- A. server-side fetch (what the Worker does today) ----------
try {
  const res = await fetch(`https://www.flightradar24.com/data/flights/${FLIGHT.toLowerCase()}`, {
    headers: { "User-Agent": UA },
  });
  const html = await res.text();
  const rows = (html.match(/<tr/g) || []).length;
  record(
    "A. server fetch → fr24",
    res.ok && rows > 3 ? "WORKS" : "BLOCKED",
    `http=${res.status} rows=${rows}${/challenge|Just a moment|captcha/i.test(html) ? " (bot challenge)" : ""}`,
  );
} catch (e) {
  record("A. server fetch → fr24", "BLOCKED", String(e).slice(0, 60));
}

// ---------- browser experiments ----------
// headless:false matters — headless Chrome is fingerprinted and challenged far more often.
const browser = await chromium.launch({ headless: false, channel: "chrome" }).catch(() =>
  chromium.launch({ headless: false }),
);
const ctx = await browser.newContext({ userAgent: UA, locale: "en-GB" });
const page = await ctx.newPage();

// ---------- B. real browser → flightradar24 ----------
try {
  await page.goto(`https://www.flightradar24.com/data/flights/${FLIGHT.toLowerCase()}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => ({
    rows: document.querySelectorAll("table tr").length,
    challenged: /just a moment|verify you are human/i.test(document.body.innerText),
    sample: document.body.innerText.replace(/\s+/g, " ").slice(0, 100),
  }));
  record(
    "B. real browser → fr24",
    info.rows > 3 && !info.challenged ? "WORKS" : "BLOCKED",
    `rows=${info.rows}${info.challenged ? " (challenged)" : ""}`,
  );
} catch (e) {
  record("B. real browser → fr24", "BLOCKED", String(e).slice(0, 60));
}

// ---------- C. real browser → Google search ----------
try {
  await page.goto(`https://www.google.com/search?q=${FLIGHT}&hl=en`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      consent: /before you continue|accept all|I agree/i.test(text),
      // Google's flight card shows times like "8:05 AM" plus airport codes.
      times: (text.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/g) || []).slice(0, 6),
      iata: [...new Set(text.match(/\b[A-Z]{3}\b/g) || [])].slice(0, 8),
      hasCard: /Scheduled departure|flights found|Departing on time/i.test(text),
    };
  });
  record(
    "C. real browser → Google",
    info.hasCard ? "WORKS" : info.consent ? "BLOCKED" : "PARTIAL",
    info.hasCard ? `times=${info.times.join(",")} iata=${info.iata.join(",")}` : info.consent ? "consent wall" : "no flight card",
  );
} catch (e) {
  record("C. real browser → Google", "BLOCKED", String(e).slice(0, 60));
}

// ---------- D. in-page fetch (what the app's own JS could do) ----------
try {
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
  const cors = await page.evaluate(async (flight) => {
    try {
      const r = await fetch(`https://www.google.com/search?q=${flight}`);
      const t = await r.text();
      return { ok: true, len: t.length };
    } catch (err) {
      return { ok: false, err: String(err).slice(0, 90) };
    }
  }, FLIGHT);
  record("D. in-page fetch → Google", cors.ok ? "WORKS" : "BLOCKED", cors.ok ? `read ${cors.len} bytes` : cors.err);
} catch (e) {
  record("D. in-page fetch → Google", "BLOCKED", String(e).slice(0, 60));
}

await browser.close();

console.log("\n--- verdict ---");
const works = results.filter((r) => r.verdict === "WORKS").map((r) => r.name);
console.log(works.length ? `usable: ${works.join(" | ")}` : "no source usable as tested");
