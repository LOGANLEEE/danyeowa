import { describe, expect, it } from "vitest";
import {
  dayOffset,
  formatLocal,
  layoverHours,
  relativeUntil,
  reportDefault,
  tripProgress,
  wallToUtc,
} from "./time";

describe("formatLocal", () => {
  it("formats time-only (default) in the given IANA tz", () => {
    // 2026-08-10T00:45:00Z in Asia/Dubai (+04:00, no DST) = 04:45
    expect(formatLocal("2026-08-10T00:45:00Z", "Asia/Dubai")).toBe("04:45");
  });

  it("formats with weekday + date + time when opts.withDate is set", () => {
    // 2026-08-10T00:45:00Z in Asia/Dubai = Mon 10 Aug 04:45
    expect(formatLocal("2026-08-10T00:45:00Z", "Asia/Dubai", { withDate: true })).toBe(
      "Mon 10 Aug 04:45",
    );
  });

  it("handles a fractional-offset timezone (Asia/Kathmandu, +05:45)", () => {
    // 2026-08-10T00:00:00Z + 05:45 = 05:45
    expect(formatLocal("2026-08-10T00:00:00Z", "Asia/Kathmandu")).toBe("05:45");
  });

  it("reflects the pre-DST-transition offset just before Europe/London springs forward", () => {
    // 2026-03-29 01:00 UTC is 01:00 GMT (still standard time, transition is at 01:00 UTC)
    expect(formatLocal("2026-03-29T00:30:00Z", "Europe/London")).toBe("00:30");
  });

  it("reflects the post-DST-transition offset just after Europe/London springs forward", () => {
    // 2026-03-29 01:30 UTC -> BST (+1) = 02:30
    expect(formatLocal("2026-03-29T01:30:00Z", "Europe/London")).toBe("02:30");
  });

  it("America/Sao_Paulo has no DST since 2019 - offset stable across a year", () => {
    // -03:00 year round
    expect(formatLocal("2026-01-15T12:00:00Z", "America/Sao_Paulo")).toBe("09:00");
    expect(formatLocal("2026-07-15T12:00:00Z", "America/Sao_Paulo")).toBe("09:00");
  });

  it("formats correctly across a month boundary", () => {
    // 2026-07-31T22:00:00Z in Asia/Dubai (+4) = Aug 1st 02:00
    expect(formatLocal("2026-07-31T22:00:00Z", "Asia/Dubai", { withDate: true })).toBe(
      "Sat 1 Aug 02:00",
    );
  });
});

describe("relativeUntil", () => {
  const now = Date.parse("2026-08-10T00:00:00Z");

  it("returns 'now' for anything under 1 minute away", () => {
    expect(relativeUntil("2026-08-10T00:00:30Z", now)).toBe("now");
  });

  it("returns 'now' for times already in the past", () => {
    expect(relativeUntil("2026-08-09T23:59:00Z", now)).toBe("now");
  });

  it("formats sub-24h durations as 'in Xh Ym'", () => {
    // 11h 08m from now
    expect(relativeUntil("2026-08-10T11:08:00Z", now)).toBe("in 11h 08m");
  });

  it("formats sub-1h durations as 'in Xh Ym' with 0 hours", () => {
    expect(relativeUntil("2026-08-10T00:45:00Z", now)).toBe("in 0h 45m");
  });

  it("formats >=24h durations as 'Xd Yh' (no 'in' prefix, no minutes)", () => {
    // 4d 12h from now
    expect(relativeUntil("2026-08-14T12:00:00Z", now)).toBe("4d 12h");
  });

  it("formats exactly 24h as '1d 0h'", () => {
    expect(relativeUntil("2026-08-11T00:00:00Z", now)).toBe("1d 0h");
  });

  it("rounds down (floors) partial minutes within the sub-24h window", () => {
    // 1h 29m59s -> floors to 1h 29m
    expect(relativeUntil("2026-08-10T01:29:59Z", now)).toBe("in 1h 29m");
  });
});

describe("reportDefault", () => {
  it("returns departure time minus 90 minutes as an ISO UTC string", () => {
    expect(reportDefault("2026-08-10T08:45:00.000Z")).toBe("2026-08-10T07:15:00.000Z");
  });

  it("rolls back across a day boundary", () => {
    expect(reportDefault("2026-08-10T00:30:00.000Z")).toBe("2026-08-09T23:00:00.000Z");
  });

  it("rolls back across a month boundary", () => {
    expect(reportDefault("2026-08-01T00:10:00.000Z")).toBe("2026-07-31T22:40:00.000Z");
  });
});

describe("layoverHours", () => {
  it("computes whole-and-fractional hours between arrival and next departure", () => {
    expect(layoverHours("2026-08-10T08:00:00Z", "2026-08-10T10:30:00Z")).toBe(2.5);
  });

  it("returns 0 when arrival and next departure are simultaneous", () => {
    expect(layoverHours("2026-08-10T08:00:00Z", "2026-08-10T08:00:00Z")).toBe(0);
  });

  it("computes layovers spanning a day boundary", () => {
    expect(layoverHours("2026-08-10T23:00:00Z", "2026-08-11T02:00:00Z")).toBe(3);
  });
});

describe("dayOffset", () => {
  it("returns 0 when departure and arrival fall on the same local calendar day", () => {
    // DXB dep 09:00 +4 = local Aug 10; arrival same local day
    expect(
      dayOffset(
        "2026-08-10T05:00:00Z", // 09:00 Dubai
        "2026-08-10T10:00:00Z", // e.g. 14:00 Dubai, same day
        "Asia/Dubai",
        "Asia/Dubai",
      ),
    ).toBe(0);
  });

  it("returns +1 for an overnight arrival landing the next local day", () => {
    // Dep Dubai 23:00 local (19:00Z) Aug 10 -> Arr London 01:00 local (01:00Z) Aug 11
    expect(
      dayOffset("2026-08-10T19:00:00Z", "2026-08-11T01:00:00Z", "Asia/Dubai", "Europe/London"),
    ).toBe(1);
  });

  it("returns +2 for a long-haul DXB->AKL crossing the date line, arriving two local days later", () => {
    // DXB dep 2026-08-10 02:35 local (+4) = 2026-08-09T22:35:00Z
    // AKL arr 2026-08-12 06:15 local (+12 in Aug, NZ winter) = 2026-08-11T18:15:00Z
    const depUtc = "2026-08-09T22:35:00Z"; // Dubai local: 2026-08-10 02:35
    const arrUtc = "2026-08-11T18:15:00Z"; // Auckland local: 2026-08-12 06:15
    expect(dayOffset(depUtc, arrUtc, "Asia/Dubai", "Pacific/Auckland")).toBe(2);
  });

  it("returns -0 normalized to 0 semantics never negative for same-day short-hop backward tz", () => {
    // Dep local day should never itself be treated as negative when arrival tz is behind
    expect(
      dayOffset(
        "2026-08-10T12:00:00Z", // Dubai 16:00, Aug 10
        "2026-08-10T13:00:00Z", // Sao Paulo 10:00, Aug 10
        "Asia/Dubai",
        "America/Sao_Paulo",
      ),
    ).toBe(0);
  });

  it("returns 0 for a same-month regression case (no over-correction)", () => {
    // Dep Dubai 09:00 local Aug 5, arr Dubai 14:00 local Aug 5 - same local day
    expect(
      dayOffset("2026-08-05T05:00:00Z", "2026-08-05T10:00:00Z", "Asia/Dubai", "Asia/Dubai"),
    ).toBe(0);
  });

  it("returns +1 across a month boundary (Jan 31 -> Feb 1)", () => {
    // Dep Dubai 23:00 local Jan 31 (19:00Z), arr Dubai 01:00 local Feb 1 (2026-02-01T01:00:00Z Dubai local... )
    expect(
      dayOffset("2026-01-31T19:00:00Z", "2026-02-01T01:00:00Z", "Asia/Dubai", "Asia/Dubai"),
    ).toBe(1);
  });

  it("returns +1 across a year boundary (Dec 31 -> Jan 1)", () => {
    expect(
      dayOffset("2026-12-31T19:00:00Z", "2027-01-01T01:00:00Z", "Asia/Dubai", "Asia/Dubai"),
    ).toBe(1);
  });

  it("returns +1 across a Feb 28 -> Mar 1 boundary in a non-leap year (2026)", () => {
    expect(
      dayOffset("2026-02-28T19:00:00Z", "2026-03-01T01:00:00Z", "Asia/Dubai", "Asia/Dubai"),
    ).toBe(1);
  });
});

describe("tripProgress", () => {
  // 3-day DXB->AKL->DXB trip, home base Asia/Dubai:
  // first dep 2026-08-10 02:15 Dubai local (2026-08-09T22:15:00Z)
  // last arr  2026-08-12 18:00 Dubai local (2026-08-12T14:00:00Z)
  // Local days spanned: Aug 10, Aug 11, Aug 12 -> totalDays = 3.
  const firstDepUtc = "2026-08-09T22:15:00Z";
  const lastArrUtc = "2026-08-12T14:00:00Z";

  it("returns null when now is before the first departure (fully future trip)", () => {
    const now = Date.parse("2026-08-09T20:00:00Z");
    expect(tripProgress(firstDepUtc, lastArrUtc, "Asia/Dubai", now)).toBeNull();
  });

  it("returns null when now is at/after the last arrival (fully past trip)", () => {
    const now = Date.parse("2026-08-12T14:00:00Z");
    expect(tripProgress(firstDepUtc, lastArrUtc, "Asia/Dubai", now)).toBeNull();
  });

  it("reports day 1 of N right after departure", () => {
    // 2026-08-09T23:00Z = Dubai local Aug 10 03:00 = trip's first local day
    const now = Date.parse("2026-08-09T23:00:00Z");
    expect(tripProgress(firstDepUtc, lastArrUtc, "Asia/Dubai", now)).toEqual({
      currentDay: 1,
      totalDays: 3,
    });
  });

  it("reports the middle day of a multi-day trip", () => {
    // 2026-08-11T10:00Z = Dubai local Aug 11 14:00 = trip's 2nd local day
    const now = Date.parse("2026-08-11T10:00:00Z");
    expect(tripProgress(firstDepUtc, lastArrUtc, "Asia/Dubai", now)).toEqual({
      currentDay: 2,
      totalDays: 3,
    });
  });

  it("reports the final day just before the last arrival", () => {
    const now = Date.parse("2026-08-12T13:00:00Z");
    expect(tripProgress(firstDepUtc, lastArrUtc, "Asia/Dubai", now)).toEqual({
      currentDay: 3,
      totalDays: 3,
    });
  });

  it("returns null for a single-leg same-day trip once it has landed", () => {
    const now = Date.parse("2026-08-10T14:00:00Z");
    expect(
      tripProgress("2026-08-10T02:15:00Z", "2026-08-10T13:35:00Z", "Asia/Dubai", now),
    ).toBeNull();
  });

  it("reports day 1 of 1 mid-flight on a single-leg same-local-day trip", () => {
    const now = Date.parse("2026-08-10T06:00:00Z");
    expect(
      tripProgress("2026-08-10T02:15:00Z", "2026-08-10T13:35:00Z", "Asia/Dubai", now),
    ).toEqual({ currentDay: 1, totalDays: 1 });
  });
});

describe("wallToUtc", () => {
  it("converts a wall-clock local time + IANA tz into the correct UTC ISO string", () => {
    // 2026-08-10 04:45 in Asia/Dubai (+04:00) = 2026-08-10T00:45:00.000Z
    expect(wallToUtc("2026-08-10T04:45:00", "Asia/Dubai")).toBe("2026-08-10T00:45:00.000Z");
  });

  it("handles the fractional Kathmandu offset (+05:45)", () => {
    expect(wallToUtc("2026-08-10T05:45:00", "Asia/Kathmandu")).toBe("2026-08-10T00:00:00.000Z");
  });

  it("resolves a skipped (nonexistent) wall time during spring-forward using the post-transition offset", () => {
    // Europe/London springs forward 2026-03-29 01:00 UTC (01:00 GMT -> 02:00 BST).
    // 01:30 local never occurs; disambiguate by treating it as BST (+1) => 00:30Z.
    expect(wallToUtc("2026-03-29T01:30:00", "Europe/London")).toBe("2026-03-29T00:30:00.000Z");
  });

  it("resolves an ambiguous (repeated) wall time during a fall-back transition using the earlier offset", () => {
    // Europe/London falls back 2026-10-25 01:00 UTC (BST +1 -> GMT +0); local 01:30 occurs twice
    // (01:30 BST at 00:30Z, then 01:30 GMT at 01:30Z). Earlier offset (+1, BST) wins.
    expect(wallToUtc("2026-10-25T01:30:00", "Europe/London")).toBe("2026-10-25T00:30:00.000Z");
  });

  it("round-trips with formatLocal for an unambiguous stable-offset tz", () => {
    const utc = wallToUtc("2026-08-10T09:00:00", "America/Sao_Paulo");
    expect(formatLocal(utc, "America/Sao_Paulo")).toBe("09:00");
  });
});
