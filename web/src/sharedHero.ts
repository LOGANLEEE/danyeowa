import { addDaysIso, localDateKey } from "@danyeowa/shared";
import type { SharedViewTrip } from "@danyeowa/shared";

export type HeroStatus =
  | { kind: "away"; awayCity: string; homeWeekday: string; daysUntilHome: number }
  | { kind: "home-upcoming"; nextTripDate: string }
  | { kind: "home-none" };

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });

/** Whole calendar days from `todayIso` to `targetIso` (both "YYYY-MM-DD", timezone-agnostic). */
function daysBetweenIso(todayIso: string, targetIso: string): number {
  const toMs = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
  return Math.round((toMs(targetIso) - toMs(todayIso)) / (24 * 60 * 60 * 1000));
}

/** Weekday name for an ISO calendar date, independent of any timezone (the date string alone
 * determines the weekday). */
function weekdayFor(dateIso: string): string {
  return WEEKDAY_FMT.format(new Date(`${dateIso}T00:00:00.000Z`));
}

/**
 * Derives the family viewer's hero status from the trip list and viewer-local "now".
 *
 * `viewerTz` resolves `nowMs` to the viewer's own local calendar date (Intl default in the
 * browser) — the away/home decision and "days until home" are both evaluated against that
 * date, per the plan's "times in VIEWER's local tz" requirement. `trips` must already be
 * sorted by `fromIso` (as the public API returns them); the first trip whose span covers
 * today wins "away", otherwise the earliest trip with `fromIso` in the future is "next trip".
 */
export function deriveHeroStatus(
  trips: SharedViewTrip[],
  nowMs: number,
  viewerTz: string,
): HeroStatus {
  const todayIso = localDateKey(new Date(nowMs).toISOString(), viewerTz);

  const currentTrip = trips.find((t) => t.fromIso <= todayIso && todayIso <= t.toIso);
  if (currentTrip) {
    return {
      kind: "away",
      awayCity: currentTrip.awayCity,
      homeWeekday: weekdayFor(currentTrip.toIso),
      daysUntilHome: Math.max(0, daysBetweenIso(todayIso, currentTrip.toIso)),
    };
  }

  const upcoming = trips.filter((t) => t.fromIso > todayIso);
  if (upcoming.length > 0) {
    const soonest = upcoming.reduce((earliest, t) => (t.fromIso < earliest.fromIso ? t : earliest));
    return { kind: "home-upcoming", nextTripDate: soonest.fromIso };
  }

  return { kind: "home-none" };
}

/** Trips departing within the next 8 weeks (56 days) of `nowMs` in `viewerTz`, or already
 * in progress — the rolling list window per the plan. `trips` need not be pre-filtered for
 * past trips (the public API already excludes them), but this re-derives the cutoff purely
 * from the viewer's "now" for testability. */
export function upcomingTrips(
  trips: SharedViewTrip[],
  nowMs: number,
  viewerTz: string,
): SharedViewTrip[] {
  const todayIso = localDateKey(new Date(nowMs).toISOString(), viewerTz);
  const cutoffIso = addDaysIso(todayIso, 56);
  return trips.filter((t) => t.fromIso <= cutoffIso && t.toIso >= todayIso);
}

/** Inclusive day span length ("away N days") for a trip. */
export function tripLengthDays(trip: SharedViewTrip): number {
  return daysBetweenIso(trip.fromIso, trip.toIso) + 1;
}

// en-GB abbreviates September as "Sept" (4 letters) rather than the more common 3-letter
// "Sep" every other month uses, so a fixed month-abbreviation table is used instead of
// relying on Intl's own short-month formatting for consistency across all 12 months.
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Formats a single ISO calendar date as a short human date, e.g. "1 Sep". */
export function formatDate(dateIso: string): string {
  const [, month, day] = dateIso.split("-").map(Number) as [number, number, number];
  return `${day} ${SHORT_MONTHS[month - 1]}`;
}

/** Formats a fromIso..toIso span as a short human range, e.g. "1 Sep - 6 Sep". */
export function formatDateRange(fromIso: string, toIso: string): string {
  return `${formatDate(fromIso)} - ${formatDate(toIso)}`;
}
