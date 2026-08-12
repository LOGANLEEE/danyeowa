import { describe, expect, it } from "vitest";
import { resolveFromProviders, type ScheduleProvider } from "../../src/schedule-providers/index";
import type { Env } from "../../src/index";

function testEnv(): Env {
  return { DB: {} as unknown as Env["DB"], ASSETS: {} as unknown as Env["ASSETS"] };
}

const LEGS = [{ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25", dayOffset: 0 }];

function hit(name: string): ScheduleProvider {
  return { name, fetchFlight: () => Promise.resolve({ status: "legs" as const, legs: LEGS }) };
}

/** Answered, and the flight isn't there. */
function absent(name: string): ScheduleProvider {
  return { name, fetchFlight: () => Promise.resolve({ status: "absent" as const }) };
}

/** Couldn't answer — blocked, no key, timed out. */
function unavailable(name: string, reason = "http 403"): ScheduleProvider {
  return { name, fetchFlight: () => Promise.resolve({ status: "unavailable" as const, reason }) };
}

describe("resolveFromProviders", () => {
  it("returns the first provider's legs with source live-scrape when it's named fr24", async () => {
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [hit("fr24")],
    });
    expect(result).toEqual({ status: "resolved", schedule: { legs: LEGS, source: "live-scrape" } });
  });

  it("labels a hit from the aerodatabox provider as source live-api", async () => {
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [hit("aerodatabox")],
    });
    expect(result).toEqual({ status: "resolved", schedule: { legs: LEGS, source: "live-api" } });
  });

  it("falls through to the second provider when the first has no such flight", async () => {
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [absent("fr24"), hit("aerodatabox")],
    });
    expect(result).toMatchObject({ status: "resolved" });
  });

  it("falls through to the second provider when the first throws", async () => {
    const throwing: ScheduleProvider = {
      name: "fr24",
      fetchFlight: () => Promise.reject(new Error("network error")),
    };
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [throwing, hit("aerodatabox")],
    });
    expect(result).toMatchObject({ status: "resolved" });
  });

  it("reports absent only when every provider actually answered", async () => {
    const result = await resolveFromProviders("XX999", "2026-08-17", testEnv(), {
      providers: [absent("fr24"), absent("aerodatabox")],
    });
    expect(result).toEqual({ status: "absent" });
  });

  it("reports unavailable when a provider could not answer, even if another said absent", async () => {
    // This is the distinction the whole change exists for: a blocked scraper plus an
    // unconfigured API is not evidence that the flight does not exist, and caching it as a
    // miss shadows a real service for the whole TTL.
    const result = await resolveFromProviders("EK247", "2026-08-17", testEnv(), {
      providers: [unavailable("fr24", "bot challenge"), absent("aerodatabox")],
    });
    expect(result).toMatchObject({ status: "unavailable" });
    expect((result as { reason: string }).reason).toContain("bot challenge");
  });

  it("counts a thrown provider as unavailable, not as absence", async () => {
    const throwing: ScheduleProvider = {
      name: "fr24",
      fetchFlight: () => Promise.reject(new Error("boom")),
    };
    const result = await resolveFromProviders("XX999", "2026-08-17", testEnv(), {
      providers: [throwing],
    });
    expect(result).toMatchObject({ status: "unavailable" });
  });

  it("treats an empty leg list as absence and falls through", async () => {
    const empty: ScheduleProvider = {
      name: "fr24",
      fetchFlight: () => Promise.resolve({ status: "legs" as const, legs: [] }),
    };
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [empty, hit("aerodatabox")],
    });
    expect(result).toMatchObject({ status: "resolved" });
  });

  it("times a hanging provider out and counts it unavailable", async () => {
    const hanging: ScheduleProvider = {
      name: "fr24",
      fetchFlight: (_flightNo, _dateIso, signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve({ status: "unavailable", reason: "timeout" }));
        }),
    };
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [hanging, hit("aerodatabox")],
    });
    expect(result).toMatchObject({ status: "resolved" });
  }, 10_000);

  it("a hanging provider alone leaves the chain unavailable, so nothing gets negative-cached", async () => {
    const hanging: ScheduleProvider = {
      name: "fr24",
      fetchFlight: (_flightNo, _dateIso, signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve({ status: "unavailable", reason: "timeout" }));
        }),
    };
    const result = await resolveFromProviders("EK372", "2026-08-17", testEnv(), {
      providers: [hanging],
    });
    expect(result).toMatchObject({ status: "unavailable" });
  }, 10_000);
});
