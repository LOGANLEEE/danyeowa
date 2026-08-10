import { describe, expect, it } from "vitest";
import { humanDateLabel } from "./dateLabel";

describe("humanDateLabel", () => {
  it("formats a local ISO date as weekday short + day + month short", () => {
    expect(humanDateLabel("2026-08-20", "Asia/Dubai")).toBe("Thu 20 Aug");
  });

  it("uses the given home tz's own calendar, not UTC's", () => {
    // 2026-08-20 noon UTC is already 2026-08-21 early morning in Pacific/Auckland
    // (UTC+12), proving the tz argument actually shifts the rendered calendar date.
    expect(humanDateLabel("2026-08-20", "Pacific/Auckland")).toBe("Fri 21 Aug");
  });
});
