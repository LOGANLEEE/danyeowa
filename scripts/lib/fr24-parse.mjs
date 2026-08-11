/**
 * Pure parsing/derivation logic for a flightradar24 "data/flights/<code>" page, split out so
 * it can be exercised offline against a saved fixture (worker/test/fixtures/fr24-ek247.html)
 * without a live browser or network. No Node- or browser-specific APIs, no side effects at
 * import time - safe to import from both scripts/fetch-schedules.mjs (plain Node) and the
 * worker's vitest suite (workerd sandbox via @cloudflare/vitest-pool-workers).
 *
 * fr24's row markup duplicates every data-row twice - a `td.visible-xs.visible-sm` mobile
 * block and `td.hidden-xs.hidden-sm` desktop cells (see worker/src/schedule-providers/
 * scrape-fr24.ts's doc comment for the full layout) - so extraction below is scoped to the
 * desktop cells only, to avoid double-counting.
 */

const ROW_RE = /<tr class=" data-row"[\s\S]*?<\/tr>/g;
const TD_RE = /<td\b([^>]*)>([\s\S]*?)<\/td>/g;

function attr(attrs, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** "9:40" -> "09:40"; null for anything that isn't a bare HH:MM (fr24 shows an em-dash
 * placeholder for a not-yet-departed ATD cell, which callers don't want). */
function normaliseTime(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * Parses every data-row on a flightradar24 flight-history page into one entry per row (NOT
 * grouped/deduped - see deriveLegSchedule for that). Each entry: { dateText, origin, dest,
 * depLocal, arrLocal }. A row missing a date, two distinct airports, or a departure+arrival
 * time is dropped.
 */
export function parseFr24Rows(html) {
  const rows = [];
  for (const chunk of html.match(ROW_RE) ?? []) {
    let dateText = null;
    const airports = [];
    const times = [];
    for (const [, attrs, inner] of chunk.matchAll(TD_RE)) {
      const cls = attr(attrs, "class") ?? "";
      if (!cls.includes("hidden-xs") || !cls.includes("hidden-sm")) continue; // desktop cells only
      const ts = attr(attrs, "data-timestamp");
      if (ts !== null) {
        if (attr(attrs, "data-time-format")) {
          dateText = stripTags(inner);
        } else if (ts) {
          // empty data-timestamp = ATD placeholder ("—") on a not-yet-departed flight; skip.
          times.push(stripTags(inner));
        }
        continue;
      }
      const airportMatch = /\/data\/airports\/([a-z]{3})/i.exec(inner);
      if (airportMatch) airports.push(airportMatch[1].toUpperCase());
    }
    if (!dateText || airports.length < 2 || times.length < 1) continue;
    const depLocal = normaliseTime(times[0]);
    const arrLocal = normaliseTime(times[times.length - 1]);
    if (!depLocal || !arrLocal) continue;
    rows.push({ dateText, origin: airports[0], dest: airports[1], depLocal, arrLocal });
  }
  return rows;
}

/**
 * True when the page shows a bot-challenge instead of real content. Callers must never write
 * rows for a page that matches this, even when parseFr24Rows also returns zero rows (which a
 * challenge page always does too - the distinguishing signal is this marker, not row count).
 *
 * NOTE: "captcha" and "challenge-platform" were tried and dropped - Cloudflare's standard
 * always-on analytics beacon (`/cdn-cgi/challenge-platform/scripts/jsd/main.js`) and a
 * `security.captcha.key` app-config field are present on the real EK247 fixture, a normal,
 * unblocked page - both false-positived on it (see worker/test/schedule-providers/
 * fr24-local-parse.test.ts "is false for the real fixture").
 * ponytail: heuristic string list, not matched against a captured challenge-page fixture (none
 * on hand) - expand the list, or switch to a real fixture + snapshot match, if fr24 changes its
 * challenge markup and a block starts silently reading as "not found" instead.
 */
export function looksBlocked(html) {
  return /just a moment|attention required|checking your browser|cf-chl|access denied|cf-browser-verification/i.test(
    html
  );
}

function isoWeekday(dateText) {
  const day = new Date(`${dateText} UTC`).getUTCDay(); // 0=Sun..6=Sat
  return day === 0 ? 7 : day; // ISO: 1=Mon..7=Sun
}

/**
 * Groups raw per-row entries (see parseFr24Rows) by date, orders each date's rows by
 * departure time to assign leg_seq (0, 1, 2...) - 2+ rows on the same date is a multi-leg
 * service, e.g. EK247: DXB->GIG 08:05 (leg 0), then GIG->EZE 17:25 (leg 1) - then aggregates
 * each leg_seq across every sampled date into one schedule row.
 *
 * Route/times for a leg_seq use the MODE (most common origin+dest+dep+arr combo) across its
 * occurrences, in case one sampled date is an irregular outlier.
 *
 * daysOfWeek: if a leg_seq shows up on every date the page had ANY row for, the flight is
 * assumed daily -> "1234567" (fr24's sample is a short, mostly-consecutive window, not a real
 * weekly calendar, so a gap-free sample doesn't reveal which weekdays are "real"). Otherwise
 * it's the ISO weekdays (1=Mon..7=Sun) actually observed for that leg_seq, sorted, joined -
 * e.g. "135".
 */
export function deriveLegSchedule(rows) {
  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.dateText)) byDate.set(row.dateText, []);
    byDate.get(row.dateText).push(row);
  }
  const totalDates = byDate.size;

  const legs = new Map(); // legSeq -> { combos: Map<comboKey, count>, dates: Set<dateText> }
  for (const dateRows of byDate.values()) {
    const sorted = [...dateRows].sort((a, b) => a.depLocal.localeCompare(b.depLocal));
    sorted.forEach((row, legSeq) => {
      if (!legs.has(legSeq)) legs.set(legSeq, { combos: new Map(), dates: new Set() });
      const leg = legs.get(legSeq);
      const key = `${row.origin}|${row.dest}|${row.depLocal}|${row.arrLocal}`;
      leg.combos.set(key, (leg.combos.get(key) ?? 0) + 1);
      leg.dates.add(row.dateText);
    });
  }

  return [...legs.keys()]
    .sort((a, b) => a - b)
    .map((legSeq) => {
      const leg = legs.get(legSeq);
      let bestKey = null;
      let bestCount = -1;
      for (const [key, count] of leg.combos) {
        if (count > bestCount) {
          bestKey = key;
          bestCount = count;
        }
      }
      const [origin, dest, depLocal, arrLocal] = bestKey.split("|");
      const dayOffset = arrLocal < depLocal ? 1 : 0;
      const daysOfWeek =
        leg.dates.size === totalDates
          ? "1234567"
          : [...new Set([...leg.dates].map(isoWeekday))].sort((a, b) => a - b).join("");
      return { legSeq, origin, dest, depLocal, arrLocal, dayOffset, daysOfWeek };
    });
}
