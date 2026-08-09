import type { ProviderLeg } from "@roaster/shared";
import type { ScheduleProvider } from "./index";

/**
 * Scrapes a flightradar24 flight-history page (e.g. flightradar24.com/data/flights/ek372)
 * for its route and scheduled local times.
 *
 * Page shape (captured live 2026-08-09, fixture at worker/test/fixtures/fr24-ek372.html):
 * a `<table id="tbl-datatable">` with one `<tr class=" data-row">` per historical/upcoming
 * date. Each row duplicates its content twice - a `td.visible-xs.visible-sm` mobile block
 * and a set of `td.hidden-xs.hidden-sm` desktop cells - so parsing is scoped to the
 * desktop cells only (`hidden-xs hidden-sm`) to avoid double-counting.
 *
 * Within the desktop cells:
 * - Two `<a href="https://www.flightradar24.com/data/airports/{iata}">` links: origin
 *   then destination, in that order.
 * - Three `<td data-timestamp="{epochSeconds}" data-offset="{utcOffsetSeconds}">` cells
 *   in order: STD (scheduled departure), ATD (actual departure - often empty/"—" for a
 *   future flight, ignored), STA (scheduled arrival). `data-timestamp` is a UTC epoch
 *   and `data-offset` is that airport's UTC offset in seconds at that instant, so local
 *   time = timestamp + offset - this sidesteps parsing "9:40 AM" strings entirely.
 *
 * The page shows one row per calendar date rather than a weekly pattern, so
 * `daysOfWeek` is left undefined (caller/DB layer defaults to "1234567", the same
 * convention used for crowd-confirmed rows with no known pattern - see
 * schedule.ts POST /schedule/confirm).
 *
 * Only the FIRST data row is used - that's the operating day closest to "now" on the
 * live page, which is what a cache-miss lookup wants (T2 wires the specific requested
 * date; this provider doesn't attempt date-specific matching against fr24's page, since
 * the page is keyed by calendar date, not queryable by arbitrary future date).
 */
export class Fr24ScrapeProvider implements ScheduleProvider {
  name = "fr24";

  async fetchFlight(flightNo: string, _dateIso: string, signal: AbortSignal): Promise<ProviderLeg[] | null> {
    const url = `https://www.flightradar24.com/data/flights/${flightNo.toLowerCase()}`;
    let res: Response;
    try {
      res = await fetch(url, {
        signal,
        headers: { "User-Agent": "RoasterMeBot/1.0 (+schedule cache warm-up; single request, cached forever)" },
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    const leg = await parseFr24Html(res);
    return leg ? [leg] : null;
  }
}

/** Parses a flightradar24 flight-history page `Response` (or an equivalent fixture
 * `Response`) into a single `ProviderLeg`. Exported separately from the provider class so
 * unit tests can feed it a fixture `Response` directly without going through `fetch`. */
export async function parseFr24Html(res: Response): Promise<ProviderLeg | null> {
  let origin: string | null = null;
  let dest: string | null = null;
  const times: { timestamp: number; offset: number }[] = [];
  let sawFirstRow = false;
  let rowDone = false;

  const rewriter = new HTMLRewriter()
    .on("tr.data-row", {
      element(el) {
        // Only the first data-row (closest operating date on the page) is used; ignore
        // every element event that fires after it closes.
        if (sawFirstRow) return;
        sawFirstRow = true;
        el.onEndTag(() => {
          rowDone = true;
        });
      },
    })
    .on("tr.data-row td.hidden-xs.hidden-sm a[href*=\"/data/airports/\"]", {
      element(el) {
        if (rowDone) return;
        const href = el.getAttribute("href");
        const match = href ? /\/data\/airports\/([a-z]{3})/i.exec(href) : null;
        if (!match) return;
        const iata = match[1]!.toUpperCase();
        if (origin === null) origin = iata;
        else if (dest === null) dest = iata;
      },
    })
    .on("tr.data-row td.hidden-xs.hidden-sm[data-timestamp]", {
      element(el) {
        if (rowDone) return;
        const ts = el.getAttribute("data-timestamp");
        const offset = el.getAttribute("data-offset");
        if (!ts || !offset) return;
        const timestamp = Number(ts);
        const offsetSec = Number(offset);
        if (!Number.isFinite(timestamp) || !Number.isFinite(offsetSec)) return;
        times.push({ timestamp, offset: offsetSec });
      },
    });

  // HTMLRewriter is a lazy transform stream - draining the body via .text() is what
  // actually runs the handlers above.
  await rewriter.transform(res).text();

  if (!origin || !dest || times.length < 1) return null;

  // times[] order within the first row is STD, ATD, STA (see class doc comment).
  // ATD is frequently blank (no data-timestamp) for a not-yet-departed flight, which
  // HTMLRewriter's `data-timestamp` guard above already skips, so times[] may hold
  // only [STD, STA] (2 entries) or the full [STD, ATD, STA] (3 entries) depending on
  // whether the flight has actually departed yet.
  const std = times[0];
  const sta = times[times.length - 1];
  if (!std || !sta || std === sta) return null;

  const depLocal = epochToLocalHHMM(std.timestamp, std.offset);
  const arrLocal = epochToLocalHHMM(sta.timestamp, sta.offset);
  const depDay = epochToLocalDateKey(std.timestamp, std.offset);
  const arrDay = epochToLocalDateKey(sta.timestamp, sta.offset);
  const dayOffset = Math.round((arrDay - depDay) / (24 * 60 * 60));
  // The row's own departure-local calendar date is what this scrape actually describes -
  // NOT necessarily the dateIso the caller requested (fr24's page only shows the nearest
  // operating date to "now", see class doc comment).
  const sourceDateIso = epochToLocalDateIso(std.timestamp, std.offset);

  return { origin, dest, depLocal, arrLocal, dayOffset, sourceDateIso };
}

/** Formats a UTC epoch-seconds timestamp shifted by `offsetSec` (that airport's UTC
 * offset in seconds) as a local "HH:MM" clock time. */
function epochToLocalHHMM(epochSec: number, offsetSec: number): string {
  const localMs = (epochSec + offsetSec) * 1000;
  const d = new Date(localMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Local calendar day, as a UTC-midnight epoch-seconds marker (day granularity only),
 * used to derive `dayOffset` (arrival day minus departure day) without importing
 * `@roaster/shared`'s tz-aware helpers, which need an IANA name rather than a raw
 * offset. */
function epochToLocalDateKey(epochSec: number, offsetSec: number): number {
  const localMs = (epochSec + offsetSec) * 1000;
  const d = new Date(localMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}

/** Local calendar date as "YYYY-MM-DD", same offset math as `epochToLocalDateKey`. */
function epochToLocalDateIso(epochSec: number, offsetSec: number): string {
  const localMs = (epochSec + offsetSec) * 1000;
  const d = new Date(localMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
