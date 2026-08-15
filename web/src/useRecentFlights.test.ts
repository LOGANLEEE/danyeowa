import { describe, expect, it } from "vitest";
import { useRecentFlights } from "./useRecentFlights";
import type { TripWithFlights } from "./api";

function tripWith(id: string, flightNo: string, depUtc: string): TripWithFlights {
  return {
    id,
    userId: "u1",
    label: null,
    createdAt: Date.now(),
    flights: [
      {
        id: `${id}-f`,
        tripId: id,
        userId: "u1",
        flightNo,
        origin: "DXB",
        dest: "LHR",
        depUtc,
        arrUtc: depUtc,
        reportUtc: depUtc,
        depTz: "Asia/Dubai",
        arrTz: "Europe/London",
        source: "manual",
        notes: null,
        legSeq: 0,
        operating: true,
      },
    ],
  };
}

describe("useRecentFlights", () => {
  it("returns distinct flight numbers ordered by most-recent departure first", () => {
    const trips = [
      tripWith("t1", "EK001", "2026-08-01T00:00:00.000Z"),
      tripWith("t2", "EK002", "2026-08-10T00:00:00.000Z"),
      tripWith("t3", "EK003", "2026-08-05T00:00:00.000Z"),
    ];
    expect(useRecentFlights(trips)).toEqual(["EK002", "EK003", "EK001"]);
  });

  it("de-duplicates a flight number, keeping only its most recent departure for ranking", () => {
    const trips = [
      tripWith("t1", "EK001", "2026-08-01T00:00:00.000Z"),
      tripWith("t2", "EK002", "2026-08-15T00:00:00.000Z"),
      tripWith("t3", "EK001", "2026-08-20T00:00:00.000Z"),
    ];
    const result = useRecentFlights(trips);
    expect(result.filter((f) => f === "EK001")).toHaveLength(1);
    // EK001's most recent dep (08-20) outranks EK002 (08-15).
    expect(result).toEqual(["EK001", "EK002"]);
  });

  it("caps the result at 4 flight numbers", () => {
    const trips = [
      tripWith("t1", "EK001", "2026-08-01T00:00:00.000Z"),
      tripWith("t2", "EK002", "2026-08-02T00:00:00.000Z"),
      tripWith("t3", "EK003", "2026-08-03T00:00:00.000Z"),
      tripWith("t4", "EK004", "2026-08-04T00:00:00.000Z"),
      tripWith("t5", "EK005", "2026-08-05T00:00:00.000Z"),
    ];
    expect(useRecentFlights(trips)).toHaveLength(4);
    expect(useRecentFlights(trips)).toEqual(["EK005", "EK004", "EK003", "EK002"]);
  });

  it("returns an empty array for no trips", () => {
    expect(useRecentFlights([])).toEqual([]);
  });

  it("collects flight numbers from multi-leg trips", () => {
    const trip: TripWithFlights = {
      id: "t1",
      userId: "u1",
      label: null,
      createdAt: Date.now(),
      flights: [
        {
          id: "f1",
          tripId: "t1",
          userId: "u1",
          flightNo: "EK448",
          origin: "DXB",
          dest: "SIN",
          depUtc: "2026-08-11T02:15:00.000Z",
          arrUtc: "2026-08-11T13:35:00.000Z",
          reportUtc: "2026-08-11T00:45:00.000Z",
          depTz: "Asia/Dubai",
          arrTz: "Asia/Singapore",
          source: "manual",
          notes: null,
          legSeq: 0,
          operating: true,
        },
        {
          id: "f2",
          tripId: "t1",
          userId: "u1",
          flightNo: "EK449",
          origin: "SIN",
          dest: "AKL",
          depUtc: "2026-08-11T16:00:00.000Z",
          arrUtc: "2026-08-12T04:20:00.000Z",
          reportUtc: "2026-08-11T14:30:00.000Z",
          depTz: "Asia/Singapore",
          arrTz: "Pacific/Auckland",
          source: "manual",
          notes: null,
          legSeq: 1,
          operating: true,
        },
      ],
    };
    expect(useRecentFlights([trip])).toEqual(["EK449", "EK448"]);
  });

  it("puts session flight numbers first, most-recent-added first, ahead of anything from trips", () => {
    // Fresh session (trips=[]) - useRecentFlights alone would see nothing; the caller's
    // own session-local adds (most-recent-first) must still surface as chips.
    expect(useRecentFlights([], ["EK412"])).toEqual(["EK412"]);
    expect(useRecentFlights([], ["EK002", "EK412"])).toEqual(["EK002", "EK412"]);
  });

  it("de-duplicates a session flight number that also appears in trips, keeping the session slot", () => {
    const trips = [tripWith("t1", "EK001", "2026-08-01T00:00:00.000Z")];
    const result = useRecentFlights(trips, ["EK001"]);
    expect(result.filter((f) => f === "EK001")).toHaveLength(1);
    expect(result).toEqual(["EK001"]);
  });

  it("still caps the merged (session + trips) result at 4", () => {
    const trips = [
      tripWith("t1", "EK001", "2026-08-01T00:00:00.000Z"),
      tripWith("t2", "EK002", "2026-08-02T00:00:00.000Z"),
      tripWith("t3", "EK003", "2026-08-03T00:00:00.000Z"),
    ];
    const result = useRecentFlights(trips, ["EK412", "EK413"]);
    expect(result).toHaveLength(4);
    expect(result).toEqual(["EK412", "EK413", "EK003", "EK002"]);
  });
});
