import { describe, expect, it } from "vitest";
import {
  deriveHeroStatus,
  formatDate,
  formatDateRange,
  tripLengthDays,
  upcomingTrips,
} from "./sharedHero";
import type { SharedViewTrip } from "@danyeowa/shared";

const aklTrip: SharedViewTrip = {
  fromIso: "2026-09-01",
  toIso: "2026-09-06",
  awayCity: "Auckland",
  legs: [
    { dateIso: "2026-09-01", fromCity: "Dubai", toCity: "Singapore" },
    { dateIso: "2026-09-01", fromCity: "Singapore", toCity: "Auckland" },
  ],
};

const laterTrip: SharedViewTrip = {
  fromIso: "2026-10-01",
  toIso: "2026-10-03",
  awayCity: "London",
  legs: [{ dateIso: "2026-10-01", fromCity: "Dubai", toCity: "London" }],
};

describe("deriveHeroStatus", () => {
  it("returns away status mid-trip with days-until-home and home weekday", () => {
    // 2026-09-03 is a Thursday; toIso 2026-09-06 is a Sunday.
    const now = Date.parse("2026-09-03T12:00:00.000Z");
    const status = deriveHeroStatus([aklTrip], now, "UTC");
    expect(status).toEqual({
      kind: "away",
      awayCity: "Auckland",
      homeWeekday: "Sunday",
      daysUntilHome: 3,
    });
  });

  it("returns away status on the departure day itself (daysUntilHome full span)", () => {
    const now = Date.parse("2026-09-01T05:00:00.000Z");
    const status = deriveHeroStatus([aklTrip], now, "UTC");
    expect(status.kind).toBe("away");
    if (status.kind === "away") {
      expect(status.daysUntilHome).toBe(5);
    }
  });

  it("returns home-upcoming when today is before the next trip", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const status = deriveHeroStatus([aklTrip], now, "UTC");
    expect(status).toEqual({ kind: "home-upcoming", nextTripDate: "2026-09-01" });
  });

  it("picks the earliest upcoming trip when several are in the future", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const status = deriveHeroStatus([laterTrip, aklTrip], now, "UTC");
    expect(status).toEqual({ kind: "home-upcoming", nextTripDate: "2026-09-01" });
  });

  it("returns home-none when there are no trips at all", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    expect(deriveHeroStatus([], now, "UTC")).toEqual({ kind: "home-none" });
  });

  it("returns home-none when all trips are already finished relative to now", () => {
    const now = Date.parse("2026-12-01T00:00:00.000Z");
    expect(deriveHeroStatus([aklTrip, laterTrip], now, "UTC")).toEqual({ kind: "home-none" });
  });

  it("resolves the away/home decision using the viewer's own timezone, not UTC", () => {
    // 2026-09-06T23:30Z is still 2026-09-07 07:30 in Auckland (UTC+12) - already past toIso
    // in Auckland's calendar, so a family member there should see "home", not "away".
    const now = Date.parse("2026-09-06T23:30:00.000Z");
    const statusAuckland = deriveHeroStatus([aklTrip, laterTrip], now, "Pacific/Auckland");
    expect(statusAuckland.kind).toBe("home-upcoming");

    const statusUtc = deriveHeroStatus([aklTrip, laterTrip], now, "UTC");
    expect(statusUtc.kind).toBe("away");
  });
});

describe("upcomingTrips", () => {
  it("includes a trip currently in progress and one departing within 8 weeks", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const result = upcomingTrips([aklTrip, laterTrip], now, "UTC");
    expect(result).toEqual([aklTrip, laterTrip]);
  });

  it("excludes a trip departing more than 8 weeks out", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const farTrip: SharedViewTrip = { ...laterTrip, fromIso: "2026-12-01", toIso: "2026-12-03" };
    const result = upcomingTrips([aklTrip, farTrip], now, "UTC");
    expect(result).toEqual([aklTrip]);
  });

  it("excludes a trip that already ended", () => {
    const now = Date.parse("2026-09-10T00:00:00.000Z");
    const result = upcomingTrips([aklTrip], now, "UTC");
    expect(result).toEqual([]);
  });
});

describe("tripLengthDays", () => {
  it("counts an inclusive day span", () => {
    expect(tripLengthDays(aklTrip)).toBe(6);
  });

  it("counts a single-day trip as 1 day", () => {
    expect(tripLengthDays({ ...aklTrip, fromIso: "2026-09-01", toIso: "2026-09-01" })).toBe(1);
  });
});

describe("formatDateRange / formatDate", () => {
  it("formats a range as short human dates", () => {
    expect(formatDateRange("2026-09-01", "2026-09-06")).toBe("1 Sep - 6 Sep");
  });

  it("formats a single date", () => {
    expect(formatDate("2026-10-01")).toBe("1 Oct");
  });
});
