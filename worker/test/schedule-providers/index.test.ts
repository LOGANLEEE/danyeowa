import { describe, expect, it } from "vitest";
import { resolveFromProviders, type ScheduleProvider } from "../../src/schedule-providers/index";
import type { Env } from "../../src/index";

function testEnv(): Env {
  return { DB: {} as unknown as Env["DB"], ASSETS: {} as unknown as Env["ASSETS"] };
}

function fakeProvider(name: string, result: Awaited<ReturnType<ScheduleProvider["fetchFlight"]>>): ScheduleProvider {
  return { name, fetchFlight: () => Promise.resolve(result) };
}

describe("resolveFromProviders", () => {
  it("returns the first provider's legs with source live-scrape when it's named fr24", async () => {
    const legs = [{ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25", dayOffset: 0 }];
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [fakeProvider("fr24", legs)],
    });
    expect(result).toEqual({ legs, source: "live-scrape" });
  });

  it("labels a hit from the aerodatabox provider as source live-api", async () => {
    const legs = [{ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25", dayOffset: 0 }];
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [fakeProvider("aerodatabox", legs)],
    });
    expect(result).toEqual({ legs, source: "live-api" });
  });

  it("falls through to the second provider when the first misses (returns null)", async () => {
    const legs = [{ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25", dayOffset: 0 }];
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [fakeProvider("fr24", null), fakeProvider("aerodatabox", legs)],
    });
    expect(result).toEqual({ legs, source: "live-api" });
  });

  it("falls through to the second provider when the first throws", async () => {
    const legs = [{ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25", dayOffset: 0 }];
    const throwingProvider: ScheduleProvider = {
      name: "fr24",
      fetchFlight: () => Promise.reject(new Error("network error")),
    };
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [throwingProvider, fakeProvider("aerodatabox", legs)],
    });
    expect(result).toEqual({ legs, source: "live-api" });
  });

  it("returns null when every provider misses", async () => {
    const result = await resolveFromProviders("XX999", "2026-08-17", testEnv(), {
      providers: [fakeProvider("fr24", null), fakeProvider("aerodatabox", null)],
    });
    expect(result).toBeNull();
  });

  it("returns null when every provider throws", async () => {
    const throwingProvider: ScheduleProvider = {
      name: "fr24",
      fetchFlight: () => Promise.reject(new Error("boom")),
    };
    const result = await resolveFromProviders("XX999", "2026-08-17", testEnv(), {
      providers: [throwingProvider],
    });
    expect(result).toBeNull();
  });

  it("treats an empty-array leg result as a miss and falls through", async () => {
    const legs = [{ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25", dayOffset: 0 }];
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [fakeProvider("fr24", []), fakeProvider("aerodatabox", legs)],
    });
    expect(result).toEqual({ legs, source: "live-api" });
  });

  it("respects a provider that never resolves by timing out (per-provider AbortSignal)", async () => {
    const legs = [{ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25", dayOffset: 0 }];
    const hangingProvider: ScheduleProvider = {
      name: "fr24",
      fetchFlight: (_flightNo, _dateIso, signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve(null));
        }),
    };
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [hangingProvider, fakeProvider("aerodatabox", legs)],
    });
    expect(result).toEqual({ legs, source: "live-api" });
  }, 10_000);
});
