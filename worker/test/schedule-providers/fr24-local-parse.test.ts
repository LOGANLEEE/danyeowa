import { describe, expect, it } from "vitest";
// Pure parsing/derivation logic lives in scripts/lib/ (imported by both the plain-Node CLI
// script and this suite) rather than under worker/src - it's not a ScheduleProvider, it's the
// offline part of scripts/fetch-schedules.mjs, which harvests fr24 with a real local Chrome
// (worker fetch is fingerprint/egress-blocked - see docs/DECISIONS.md).
import { deriveLegSchedule, looksBlocked, parseFr24Rows } from "../../../scripts/lib/fr24-parse.mjs";
// @ts-expect-error - ?raw has no type declaration in this project
import fr24Ek247Html from "../fixtures/fr24-ek247.html?raw";

describe("parseFr24Rows", () => {
  it("parses every data-row on the EK247 fixture (a two-leg-per-day service), not just the first", () => {
    const rows = parseFr24Rows(fr24Ek247Html);
    expect(rows.length).toBeGreaterThan(2);
    const dates = new Set(rows.map((r) => r.dateText));
    expect(dates.has("17 Aug 2026")).toBe(true);
  });

  it("finds two rows for a date with a two-leg service", () => {
    const rows = parseFr24Rows(fr24Ek247Html).filter((r) => r.dateText === "17 Aug 2026");
    expect(rows).toHaveLength(2);
    const byRoute = Object.fromEntries(rows.map((r) => [`${r.origin}${r.dest}`, r]));
    expect(byRoute.DXBGIG).toMatchObject({ depLocal: "08:05", arrLocal: "15:50" });
    expect(byRoute.GIGEZE).toMatchObject({ depLocal: "17:25", arrLocal: "20:50" });
  });

  it("returns [] for a page with no data-row markup", () => {
    expect(parseFr24Rows("<html><body>Not found</body></html>")).toEqual([]);
  });
});

describe("looksBlocked", () => {
  it("is false for the real fixture", () => {
    expect(looksBlocked(fr24Ek247Html)).toBe(false);
  });

  it("flags common bot-challenge markers", () => {
    expect(looksBlocked("<title>Just a moment...</title>")).toBe(true);
    expect(looksBlocked("<div id='cf-chl-widget'>Checking your browser</div>")).toBe(true);
  });

  it("does not flag an ordinary empty/not-found page", () => {
    expect(looksBlocked("<html><body>No results</body></html>")).toBe(false);
  });
});

describe("deriveLegSchedule", () => {
  it("assigns leg_seq by departure-time order within a date, and day_offset per leg", () => {
    const rows = parseFr24Rows(fr24Ek247Html);
    const legs = deriveLegSchedule(rows);
    expect(legs).toHaveLength(2);
    // Sorted by depLocal within each date: DXB->GIG (08:05) is the earlier departure -> leg 0.
    expect(legs[0]).toMatchObject({ legSeq: 0, origin: "DXB", dest: "GIG", depLocal: "08:05", arrLocal: "15:50" });
    expect(legs[1]).toMatchObject({ legSeq: 1, origin: "GIG", dest: "EZE", depLocal: "17:25", arrLocal: "20:50" });
    // Both legs land same-day in the fixture (no midnight crossing).
    expect(legs[0]!.dayOffset).toBe(0);
    expect(legs[1]!.dayOffset).toBe(0);
  });

  it("marks a leg daily (\"1234567\") when it appears on every sampled date", () => {
    const rows = parseFr24Rows(fr24Ek247Html);
    const legs = deriveLegSchedule(rows);
    for (const leg of legs) expect(leg.daysOfWeek).toBe("1234567");
  });

  it("derives day_offset=1 when arrival time is earlier than departure (overnight leg)", () => {
    const rows = [
      { dateText: "10 Aug 2026", origin: "DXB", dest: "BCN", depLocal: "23:50", arrLocal: "04:10" },
      { dateText: "11 Aug 2026", origin: "DXB", dest: "BCN", depLocal: "23:50", arrLocal: "04:10" },
    ];
    const legs = deriveLegSchedule(rows);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ legSeq: 0, dayOffset: 1, daysOfWeek: "1234567" });
  });

  it("lists only the observed weekdays for a leg_seq that's missing on some sampled dates", () => {
    // leg_seq 0 (the day's earliest departure) exists on every date by construction (sort
    // position 0 is always filled once a date has any row), so only a later leg_seq can have
    // a real gap: here leg_seq 1 (BCN->DXB, the day's second departure) is absent on 11 Aug
    // (Tue) - only 10 Aug (Mon) and 12 Aug (Wed) run it, so its daysOfWeek is "13", not
    // "1234567", even though leg_seq 0 (which runs all three sampled dates) is.
    const rows = [
      { dateText: "10 Aug 2026", origin: "DXB", dest: "BCN", depLocal: "08:00", arrLocal: "12:00" },
      { dateText: "10 Aug 2026", origin: "BCN", dest: "DXB", depLocal: "14:00", arrLocal: "22:00" },
      { dateText: "11 Aug 2026", origin: "DXB", dest: "BCN", depLocal: "08:00", arrLocal: "12:00" },
      { dateText: "12 Aug 2026", origin: "DXB", dest: "BCN", depLocal: "08:00", arrLocal: "12:00" },
      { dateText: "12 Aug 2026", origin: "BCN", dest: "DXB", depLocal: "14:00", arrLocal: "22:00" },
    ];
    const legs = deriveLegSchedule(rows);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toMatchObject({ legSeq: 0, daysOfWeek: "1234567" });
    expect(legs[1]).toMatchObject({ legSeq: 1, daysOfWeek: "13" });
  });
});
