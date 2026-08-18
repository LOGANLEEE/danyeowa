import { describe, expect, it } from "vitest";
import { awaySpans, dutyDayMarks } from "./dayMarks";

const BASE = "DXB";

function leg(origin: string, dest: string, dep: string, arr: string) {
  return { origin, dest, depUtc: dep, arrUtc: arr };
}

/**
 * The real case this exists for: EK247 flies DXB → GIG → EZE on the 22nd–23rd, EK248 comes back
 * EZE → GIG → DXB on the 27th–28th. Two trips. Three days in Buenos Aires between them that
 * belong to neither, and used to render exactly like a day at home.
 */
const OUT = {
  flights: [
    leg("DXB", "GIG", "2026-08-22T02:30:00.000Z", "2026-08-22T15:10:00.000Z"),
    leg("GIG", "EZE", "2026-08-22T17:00:00.000Z", "2026-08-22T20:15:00.000Z"),
  ],
};
const BACK = {
  flights: [
    leg("EZE", "GIG", "2026-08-26T22:00:00.000Z", "2026-08-27T01:10:00.000Z"),
    leg("GIG", "DXB", "2026-08-27T03:00:00.000Z", "2026-08-27T21:40:00.000Z"),
  ],
};

describe("awaySpans", () => {
  it("joins two trips into one stretch away from base", () => {
    const spans = awaySpans([OUT, BACK], BASE);

    // One span, not two: she leaves base once and returns once.
    expect(spans).toEqual([
      { firstDepUtc: "2026-08-22T02:30:00.000Z", lastArrUtc: "2026-08-27T21:40:00.000Z" },
    ]);
  });

  it("fills the layover days with the city she is actually in", () => {
    const spans = awaySpans([OUT, BACK], BASE);
    // The days the span covers, in a UTC-ish home tz for a readable assertion.
    const days = ["2026-08-23", "2026-08-24", "2026-08-25"];
    const marks = dutyDayMarks([OUT, BACK], "UTC", BASE, days);

    expect(spans).toHaveLength(1);
    for (const iso of days) {
      expect(marks.get(iso)).toEqual({ kind: "layover", code: "EZE" });
    }
  });

  it("closes a same-day turnaround on the day it happens", () => {
    const turn = {
      flights: [
        leg("DXB", "KHI", "2026-08-05T04:00:00.000Z", "2026-08-05T06:30:00.000Z"),
        leg("KHI", "DXB", "2026-08-05T07:30:00.000Z", "2026-08-05T10:00:00.000Z"),
      ],
    };
    expect(awaySpans([turn], BASE)).toEqual([
      { firstDepUtc: "2026-08-05T04:00:00.000Z", lastArrUtc: "2026-08-05T10:00:00.000Z" },
    ]);
  });

  it("does not swallow the days between an unclosed trip and the next departure", () => {
    // The roster knows she flew to JED on the 19th but not how she got back. Four days later she
    // leaves base again — which can only mean she was home. Without the guard, the open span
    // would run from the 19th to the 28th and paint the 20th and 21st as away.
    const jed = { flights: [leg("DXB", "JED", "2026-08-19T05:00:00.000Z", "2026-08-19T07:45:00.000Z")] };

    const spans = awaySpans([jed, OUT, BACK], BASE);

    expect(spans).toEqual([
      { firstDepUtc: "2026-08-19T05:00:00.000Z", lastArrUtc: "2026-08-19T07:45:00.000Z" },
      { firstDepUtc: "2026-08-22T02:30:00.000Z", lastArrUtc: "2026-08-27T21:40:00.000Z" },
    ]);
  });

  it("stops an open span at the last landing it knows about", () => {
    // Still down-route when the roster runs out. Running the span to "now" or beyond would
    // invent days she may already be home for.
    const spans = awaySpans([OUT], BASE);
    expect(spans).toEqual([
      { firstDepUtc: "2026-08-22T02:30:00.000Z", lastArrUtc: "2026-08-22T20:15:00.000Z" },
    ]);
  });

  it("returns nothing for a roster that never touches base", () => {
    const orphan = { flights: [leg("GIG", "EZE", "2026-08-23T10:00:00.000Z", "2026-08-23T13:00:00.000Z")] };
    expect(awaySpans([orphan], BASE)).toEqual([]);
  });

  it("orders legs by departure, not by the order the trips arrive in", () => {
    // /api/trips does not promise an order, and a reversed list must not produce a reversed walk.
    expect(awaySpans([BACK, OUT], BASE)).toEqual(awaySpans([OUT, BACK], BASE));
  });
});
