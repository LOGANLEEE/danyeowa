const REPORT_LEAD_MS = 90 * 60 * 1000;

export function formatLocal(
  utcIso: string,
  tz: string,
  opts?: { withDate?: boolean },
): string {
  const date = new Date(utcIso);
  if (opts?.withDate) {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${get("weekday")} ${get("day")} ${get("month")} ${get("hour")}:${get("minute")}`;
  }
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(date);
}

export function relativeUntil(utcIso: string, nowMs: number): string {
  const diffMs = Date.parse(utcIso) - nowMs;
  if (diffMs < 60_000) return "now";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);

  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}d ${hours}h`;
  }

  const minutes = totalMinutes % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  return `in ${totalHours}h ${paddedMinutes}m`;
}

export function reportDefault(depUtcIso: string): string {
  return new Date(Date.parse(depUtcIso) - REPORT_LEAD_MS).toISOString();
}

export function layoverHours(arrUtcIso: string, nextDepUtcIso: string): number {
  return (Date.parse(nextDepUtcIso) - Date.parse(arrUtcIso)) / (60 * 60 * 1000);
}

/** Local calendar date for `utcIso` in `tz`, as an ISO date string ("YYYY-MM-DD"). */
export function localDateKey(utcIso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(utcIso));
}

/** Local calendar day for `utcIso` in `tz`, as an epoch-ms midnight-UTC marker (day-granularity only, not a real instant). */
export function localDayEpoch(utcIso: string, tz: string): number {
  const [year, month, day] = localDateKey(utcIso, tz).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // Date.UTC's month param is 0-indexed; localDateKey's month (from en-CA) is 1-indexed.
  return Date.UTC(year, month - 1, day);
}

export function dayOffset(
  depUtcIso: string,
  arrUtcIso: string,
  depTz: string,
  arrTz: string,
): number {
  const depDay = localDayEpoch(depUtcIso, depTz);
  const arrDay = localDayEpoch(arrUtcIso, arrTz);
  return Math.round((arrDay - depDay) / (24 * 60 * 60 * 1000));
}

/** Offset in minutes of `tz` at the given UTC instant, e.g. Asia/Kathmandu -> 345. */
function offsetMinutesAt(utcMs: number, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const part = fmt.formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName");
  const match = part?.value.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours < 0 ? hours * 60 - minutes : hours * 60 + minutes;
}

export type TripProgress = {
  /** 1-indexed current day of the trip, clamped to [1, totalDays]. */
  currentDay: number;
  /** Total trip length in local calendar days (home-base tz), first dep day through last arr day, inclusive. */
  totalDays: number;
};

/**
 * Determines whether a trip is currently in progress (first departure has passed, last
 * arrival has not) and, if so, which calendar day of the trip `now` falls on.
 *
 * Day counting uses the HOME BASE tz (the origin tz of the first leg — the crew's home
 * airport for this trip) for calendar-day boundaries, per the mockup's "day X of N".
 *
 * Returns `null` when the trip has not yet started or has already ended (fully future or
 * fully past relative to `nowMs`).
 */
export function tripProgress(
  firstDepUtc: string,
  lastArrUtc: string,
  homeBaseTz: string,
  nowMs: number,
): TripProgress | null {
  const firstDepMs = Date.parse(firstDepUtc);
  const lastArrMs = Date.parse(lastArrUtc);
  if (nowMs < firstDepMs || nowMs >= lastArrMs) return null;

  const firstDay = localDayEpoch(firstDepUtc, homeBaseTz);
  const lastDay = localDayEpoch(lastArrUtc, homeBaseTz);
  const nowDay = localDayEpoch(new Date(nowMs).toISOString(), homeBaseTz);

  const DAY_MS = 24 * 60 * 60 * 1000;
  const totalDays = Math.round((lastDay - firstDay) / DAY_MS) + 1;
  const currentDay = Math.min(totalDays, Math.max(1, Math.round((nowDay - firstDay) / DAY_MS) + 1));

  return { currentDay, totalDays };
}

/**
 * Converts a wall-clock local time (no offset, e.g. "2026-08-10T04:45:00") in the given
 * IANA tz to a UTC ISO string.
 *
 * DST disambiguation rule: a wall time can map to two different UTC instants around a
 * DST transition, so the offset is sampled a few hours either side of the naive
 * (UTC-as-if) instant and the LARGER offset of the two is used — which always resolves
 * to the earlier UTC instant:
 * - Ambiguous (fall-back, wall time occurs twice): picks the pre-transition offset
 *   (e.g. BST +1 rather than GMT +0) — "earlier offset wins".
 * - Skipped (spring-forward gap, wall time never occurs): picks the post-transition
 *   offset, since that's the only one under which the wall time is reachable.
 * - No nearby transition: both samples agree, so the choice is moot.
 */
export function wallToUtc(wallIso: string, tz: string): string {
  const naiveMs = Date.parse(`${wallIso}Z`);
  // Probe the offset shortly before and shortly after the naive instant (wider than any
  // real-world DST shift, which is at most a couple of hours) to see both sides of a
  // possible transition, then take the larger offset (earlier UTC instant) of the two.
  const probeSpanMs = 3 * 60 * 60 * 1000;
  const offsetBefore = offsetMinutesAt(naiveMs - probeSpanMs, tz);
  const offsetAfter = offsetMinutesAt(naiveMs + probeSpanMs, tz);
  const chosenOffset = Math.max(offsetBefore, offsetAfter);
  return new Date(naiveMs - chosenOffset * 60_000).toISOString();
}

export type MonthGridCell = {
  /** ISO calendar date, e.g. "2026-08-01". Timezone-agnostic (calendar date, not an instant). */
  iso: string;
  /** Day-of-month number for this cell's own month (1-31), even when `inMonth` is false. */
  day: number;
  /** Whether this cell's date falls within the requested `month`. */
  inMonth: boolean;
};

function isoDate(year: number, monthIndex0: number, day: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, day));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Builds a Monday-start, 6-week month grid for `month` (1-12) of `year`. Purely calendar-date
 * arithmetic (no instants), so it does not depend on `tz`; the parameter is accepted for call-site
 * symmetry with other calendar helpers.
 */
export function monthGrid(year: number, month: number, _tz: string): MonthGridCell[][] {
  const monthIndex0 = month - 1;
  const firstOfMonth = new Date(Date.UTC(year, monthIndex0, 1));
  // JS getUTCDay(): 0=Sun..6=Sat. Convert to Mon-start offset (0=Mon..6=Sun).
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(year, monthIndex0, 1 - firstWeekday));

  const weeks: MonthGridCell[][] = [];
  for (let week = 0; week < 6; week++) {
    const days: MonthGridCell[] = [];
    for (let day = 0; day < 7; day++) {
      const cellDate = new Date(gridStart.getTime() + (week * 7 + day) * 24 * 60 * 60 * 1000);
      days.push({
        iso: isoDate(cellDate.getUTCFullYear(), cellDate.getUTCMonth(), cellDate.getUTCDate()),
        day: cellDate.getUTCDate(),
        inMonth: cellDate.getUTCMonth() === monthIndex0 && cellDate.getUTCFullYear() === year,
      });
    }
    weeks.push(days);
  }
  return weeks;
}

export type TripSpan = {
  firstDepUtc: string;
  lastArrUtc: string;
};

/**
 * Maps each local calendar date (in `homeTz`) covered by any trip's span (first departure to
 * last arrival) within the given `year`/`month` to "away" (fully covered day) or "partial"
 * (the trip's first or last local day, when part of the day is spent outside the trip).
 * A single-day trip's only day is "away".
 */
export function tripDaysInMonth(
  trips: TripSpan[],
  year: number,
  month: number,
  homeTz: string,
): Map<string, "away" | "partial"> {
  const result = new Map<string, "away" | "partial">();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  for (const trip of trips) {
    const firstDayKey = localDateKeyFromEpoch(localDayEpoch(trip.firstDepUtc, homeTz));
    const lastDayKey = localDateKeyFromEpoch(localDayEpoch(trip.lastArrUtc, homeTz));

    let cursor = localDayEpoch(trip.firstDepUtc, homeTz);
    const end = localDayEpoch(trip.lastArrUtc, homeTz);
    const DAY_MS = 24 * 60 * 60 * 1000;

    while (cursor <= end) {
      const key = localDateKeyFromEpoch(cursor);
      if (key.startsWith(monthPrefix)) {
        const status = key === firstDayKey || key === lastDayKey ? "partial" : "away";
        // A same-day trip (first === last) should read as "away", not "partial".
        result.set(key, firstDayKey === lastDayKey ? "away" : status);
      }
      cursor += DAY_MS;
    }
  }

  return result;
}

function localDateKeyFromEpoch(dayEpochMs: number): string {
  const d = new Date(dayEpochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
