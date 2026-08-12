import { describe, expect, it } from "vitest";
import { AeroDataBoxProvider, parseAeroDataBoxFlight } from "../../src/schedule-providers/aerodatabox";
import fixtureFlights from "../fixtures/aerodatabox-ek372.json";
import type { Env } from "../../src/index";

function testEnv(overrides?: Partial<Env>): Env {
  return { DB: {} as unknown as Env["DB"], ASSETS: {} as unknown as Env["ASSETS"], ...overrides };
}

describe("parseAeroDataBoxFlight", () => {
  it("parses the EK372 fixture to DXB->BKK", () => {
    const legs = parseAeroDataBoxFlight(fixtureFlights[0]!);
    expect(legs).toEqual([
      {
        origin: "DXB",
        dest: "BKK",
        depLocal: "09:40",
        arrLocal: "19:25",
        dayOffset: 0,
        sourceDateIso: "2026-08-17",
        originAirport: { name: "Dubai International Airport", tz: "Asia/Dubai" },
        destAirport: { name: "Suvarnabhumi Airport", tz: "Asia/Bangkok" },
      },
    ]);
  });

  it("returns null when departure airport iata is missing", () => {
    const legs = parseAeroDataBoxFlight({
      departure: { scheduledTime: { local: "2026-08-17 09:40+04:00" } },
      arrival: { airport: { iata: "BKK" }, scheduledTime: { local: "2026-08-17 19:25+07:00" } },
    });
    expect(legs).toBeNull();
  });

  it("returns null when scheduledTime.local is missing", () => {
    const legs = parseAeroDataBoxFlight({
      departure: { airport: { iata: "DXB" } },
      arrival: { airport: { iata: "BKK" }, scheduledTime: { local: "2026-08-17 19:25+07:00" } },
    });
    expect(legs).toBeNull();
  });

  it("computes a non-zero dayOffset for an overnight leg", () => {
    const legs = parseAeroDataBoxFlight({
      departure: { airport: { iata: "HKG" }, scheduledTime: { local: "2026-08-17 23:45+08:00" } },
      arrival: { airport: { iata: "BKK" }, scheduledTime: { local: "2026-08-18 01:35+07:00" } },
    });
    expect(legs?.[0]?.dayOffset).toBe(1);
  });
});

describe("AeroDataBoxProvider", () => {
  it("reports unavailable without a fetch when AERODATABOX_KEY is unset", async () => {
    const provider = new AeroDataBoxProvider(testEnv());
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = () => {
      fetchCalled = true;
      return Promise.reject(new Error("should not be called"));
    };
    try {
      const outcome = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
      expect(outcome).toMatchObject({ status: "unavailable" });
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetches and parses when AERODATABOX_KEY is set", async () => {
    const provider = new AeroDataBoxProvider(testEnv({ AERODATABOX_KEY: "test-key" }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify(fixtureFlights)));
    try {
      const outcome = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
      expect(outcome.status).toBe("legs");
      expect(outcome.status === "legs" && outcome.legs).toEqual([
        {
          origin: "DXB",
          dest: "BKK",
          depLocal: "09:40",
          arrLocal: "19:25",
          dayOffset: 0,
          sourceDateIso: "2026-08-17",
          originAirport: { name: "Dubai International Airport", tz: "Asia/Dubai" },
          destAirport: { name: "Suvarnabhumi Airport", tz: "Asia/Bangkok" },
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("omits airport metadata when the response's airport object has no name/timeZone (e.g. a leaner schema variant)", () => {
    const legs = parseAeroDataBoxFlight({
      departure: { airport: { iata: "DXB" }, scheduledTime: { local: "2026-08-17 09:40+04:00" } },
      arrival: { airport: { iata: "BKK" }, scheduledTime: { local: "2026-08-17 19:25+07:00" } },
    });
    expect(legs?.[0]?.originAirport).toBeUndefined();
    expect(legs?.[0]?.destAirport).toBeUndefined();
  });

  it("reports unavailable on a non-ok response", async () => {
    const provider = new AeroDataBoxProvider(testEnv({ AERODATABOX_KEY: "test-key" }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response("unauthorized", { status: 401 }));
    try {
      const outcome = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
      expect(outcome).toMatchObject({ status: "unavailable" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports unavailable on malformed JSON", async () => {
    const provider = new AeroDataBoxProvider(testEnv({ AERODATABOX_KEY: "test-key" }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response("not json"));
    try {
      const outcome = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
      expect(outcome).toMatchObject({ status: "unavailable" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports absent on an empty array response", async () => {
    const provider = new AeroDataBoxProvider(testEnv({ AERODATABOX_KEY: "test-key" }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response("[]"));
    try {
      const outcome = await provider.fetchFlight("EK372", "2026-08-17", new AbortController().signal);
      expect(outcome).toEqual({ status: "absent" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
