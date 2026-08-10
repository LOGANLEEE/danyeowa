import { describe, expect, it } from "vitest";
import { dutyDayMarks } from "./dayMarks";

const TZ = "Asia/Dubai";
const BASE = "DXB";

function leg(origin: string, dest: string, depUtc: string, arrUtc: string) {
  return { origin, dest, depUtc, arrUtc };
}

describe("dutyDayMarks", () => {
  it("marks a day that leaves base and stays away as outbound, coded by the furthest station", () => {
    // DXB -> SYD -> CHC, both legs departing Aug 15 Dubai local.
    const trips = [
      {
        flights: [
          leg("DXB", "SYD", "2026-08-15T02:00:00.000Z", "2026-08-15T12:00:00.000Z"),
          leg("SYD", "CHC", "2026-08-15T14:00:00.000Z", "2026-08-15T17:00:00.000Z"),
        ],
      },
    ];

    const marks = dutyDayMarks(trips, TZ, BASE, ["2026-08-15"]);
    expect(marks.get("2026-08-15")).toEqual({ kind: "outbound", code: "CHC" });
  });

  it("marks a day landing back at base as return, coded by the station flown home from", () => {
    const trips = [
      { flights: [leg("SYD", "DXB", "2026-08-18T02:00:00.000Z", "2026-08-18T12:00:00.000Z")] },
    ];

    const marks = dutyDayMarks(trips, TZ, BASE, ["2026-08-18"]);
    expect(marks.get("2026-08-18")).toEqual({ kind: "return", code: "SYD" });
  });

  it("marks out-and-back on one local day as turnaround, coded by the turn station", () => {
    // DXB -> BKK -> DXB, both legs on Aug 18 Dubai local.
    const trips = [
      {
        flights: [
          leg("DXB", "BKK", "2026-08-18T05:40:00.000Z", "2026-08-18T11:25:00.000Z"),
          leg("BKK", "DXB", "2026-08-18T13:00:00.000Z", "2026-08-18T17:00:00.000Z"),
        ],
      },
    ];

    const marks = dutyDayMarks(trips, TZ, BASE, ["2026-08-18"]);
    expect(marks.get("2026-08-18")).toEqual({ kind: "turnaround", code: "BKK" });
  });

  it("marks an outstation-to-outstation day as a sector", () => {
    const trips = [
      { flights: [leg("SYD", "CHC", "2026-08-16T22:00:00.000Z", "2026-08-17T02:00:00.000Z")] },
    ];

    const marks = dutyDayMarks(trips, TZ, BASE, ["2026-08-17"]);
    expect(marks.get("2026-08-17")).toEqual({ kind: "sector", code: "CHC" });
  });

  it("marks a day with no departure as a layover at the last station landed at", () => {
    const trips = [
      {
        flights: [
          leg("DXB", "AKL", "2026-08-15T06:00:00.000Z", "2026-08-16T02:00:00.000Z"),
          leg("AKL", "DXB", "2026-08-18T05:00:00.000Z", "2026-08-18T18:00:00.000Z"),
        ],
      },
    ];

    const marks = dutyDayMarks(trips, TZ, BASE, ["2026-08-16", "2026-08-17", "2026-08-18"]);
    expect(marks.get("2026-08-16")).toEqual({ kind: "layover", code: "AKL" });
    expect(marks.get("2026-08-17")).toEqual({ kind: "layover", code: "AKL" });
    expect(marks.get("2026-08-18")).toEqual({ kind: "return", code: "AKL" });
  });

  it("buckets legs by the home-tz local day, not the UTC day", () => {
    // 2026-08-15T21:00Z is Aug 16 01:00 in Dubai - the mark belongs to Aug 16.
    const trips = [
      { flights: [leg("DXB", "LHR", "2026-08-15T21:00:00.000Z", "2026-08-16T04:00:00.000Z")] },
    ];

    const marks = dutyDayMarks(trips, TZ, BASE, ["2026-08-15", "2026-08-16"]);
    expect(marks.has("2026-08-15")).toBe(false);
    expect(marks.get("2026-08-16")).toEqual({ kind: "outbound", code: "LHR" });
  });

  it("returns no mark for a day with no legs and nothing landed yet", () => {
    const trips = [
      { flights: [leg("DXB", "LHR", "2026-08-15T06:00:00.000Z", "2026-08-15T12:00:00.000Z")] },
    ];

    expect(dutyDayMarks(trips, TZ, BASE, ["2026-08-14"]).size).toBe(0);
  });
});
