/**
 * Live arrival times from flightradar24, for correcting a stored schedule against reality.
 *
 * Two hops, both same-origin on www.flightradar24.com (a cross-origin request to either is
 * refused, and a direct request from node gets a Cloudflare 403 — so this runs inside a page):
 *
 *   1. /v1/search/web/find?query=EK373  -> results of type "live" carry fr24's flight id
 *   2. /clickhandler/?flight=<id>       -> time.estimated.arrival while airborne,
 *                                          time.real.arrival once it is down
 *
 * The scheduled-timetable endpoint used by fetch-schedules.mjs cannot do this: it only returns
 * FUTURE flights, every one of them "Scheduled" with null estimated and real times. Measured,
 * not assumed — six long-haul flights, all airborne, all null.
 */

import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME_PROFILE = path.join(
  os.homedir(),
  "Library/Application Support/Google/Chrome"
);

/**
 * Builds a throwaway Chrome profile carrying only the real one's cookies.
 *
 * Both endpoints refuse a fresh automated browser — 403 in headless AND headed Playwright — while
 * the same calls from the user's own signed-in Chrome succeed. The difference is the session, so
 * the session is what gets borrowed.
 *
 * Copying rather than pointing at the profile directly matters: Chrome holds a singleton lock on
 * a live profile, and the user should not have to close their browser for a cron job. Only three
 * files are needed — the cookie database, the Local State that holds its encryption key, and
 * Preferences — so this stays small instead of duplicating a multi-gigabyte profile.
 */
export function borrowChromeProfile(scratchDir, profileName = "Default") {
  if (!existsSync(CHROME_PROFILE)) {
    throw new Error(`Chrome profile not found at ${CHROME_PROFILE}`);
  }
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(path.join(scratchDir, profileName, "Network"), { recursive: true });

  const copies = [
    ["Local State", "Local State"],
    [path.join(profileName, "Network", "Cookies"), path.join(profileName, "Network", "Cookies")],
    [path.join(profileName, "Preferences"), path.join(profileName, "Preferences")],
  ];
  for (const [from, to] of copies) {
    const src = path.join(CHROME_PROFILE, from);
    if (existsSync(src)) copyFileSync(src, path.join(scratchDir, to));
  }
  return scratchDir;
}

/**
 * Resolves one flight number to its live arrival estimate, or null when it isn't in the air.
 *
 * Runs entirely inside the page because both endpoints are same-origin only. Returns the
 * scheduled time alongside the estimate so the caller can decide whether the drift is worth a
 * write.
 */
export async function fetchLiveArrival(page, flightNo) {
  return page.evaluate(async (no) => {
    const json = async (url) => {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      const contentType = r.headers.get("content-type") || "";
      if (!contentType.includes("json")) return { blocked: true, status: r.status };
      return { blocked: false, body: await r.json() };
    };

    const search = await json(`/v1/search/web/find?query=${encodeURIComponent(no)}&limit=30`);
    if (search.blocked) return { blocked: true, reason: `search http ${search.status}` };

    // Match the flight number exactly: a query for EK4 also returns EK40, EK41, EK48.
    const live = (search.body.results || []).find(
      (r) => r.type === "live" && r.detail?.flight?.toUpperCase() === no.toUpperCase()
    );
    if (!live) return { blocked: false, airborne: false };

    const detail = await json(`/clickhandler/?flight=${live.id}`);
    if (detail.blocked) return { blocked: true, reason: `clickhandler http ${detail.status}` };

    const time = detail.body?.time ?? {};
    return {
      blocked: false,
      airborne: true,
      statusText: detail.body?.status?.text ?? null,
      scheduledArrival: time.scheduled?.arrival ?? null,
      // real once it has landed, estimated while it is still flying. Either beats the timetable.
      liveArrival: time.real?.arrival ?? time.estimated?.arrival ?? null,
      origin: detail.body?.airport?.origin?.code?.iata ?? null,
      dest: detail.body?.airport?.destination?.code?.iata ?? null,
    };
  }, flightNo);
}

/**
 * Whether a live time is worth writing back.
 *
 * Small drifts are noise — every flight is a minute or two off its timetable, and rewriting the
 * row for that would churn the database and re-arm alerts for nothing. The threshold is in
 * minutes so it can be reasoned about against the alert stages (60 / 30 / 0).
 */
export function isMaterialDrift(scheduledEpoch, liveEpoch, thresholdMinutes = 10) {
  if (!scheduledEpoch || !liveEpoch) return false;
  return Math.abs(liveEpoch - scheduledEpoch) >= thresholdMinutes * 60;
}
