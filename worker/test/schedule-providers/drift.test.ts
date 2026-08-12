import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs helper shared with scripts/, no type declarations
import { isMaterialDrift } from "../../../scripts/lib/fr24-live.mjs";

/**
 * The threshold that decides whether a live arrival estimate is worth writing back.
 *
 * It is not cosmetic: a correction clears `arrival_alert_stage`, so rewriting a row re-arms the
 * 60/30/0 alerts. Too low a bar and every flight's normal minute-or-two wobble re-triggers the
 * whole ladder; too high and a real delay lands the "landing now" push while she is still in
 * the air.
 */
describe("isMaterialDrift", () => {
  const base = 1_786_500_000;

  it("ignores the small wobble every flight has against its timetable", () => {
    expect(isMaterialDrift(base, base + 5 * 60)).toBe(false);
    expect(isMaterialDrift(base, base - 9 * 60)).toBe(false);
  });

  it("catches a delay worth re-arming the alerts for", () => {
    expect(isMaterialDrift(base, base + 35 * 60)).toBe(true);
  });

  it("catches an early arrival too — the alerts are just as wrong in that direction", () => {
    expect(isMaterialDrift(base, base - 44 * 60)).toBe(true);
  });

  it("treats exactly the threshold as material", () => {
    expect(isMaterialDrift(base, base + 10 * 60)).toBe(true);
  });

  it("refuses to judge when either time is missing, rather than guessing", () => {
    expect(isMaterialDrift(null, base)).toBe(false);
    expect(isMaterialDrift(base, null)).toBe(false);
    expect(isMaterialDrift(0, base)).toBe(false);
  });

  it("honours a caller-supplied threshold", () => {
    expect(isMaterialDrift(base, base + 3 * 60, 2)).toBe(true);
    expect(isMaterialDrift(base, base + 3 * 60, 30)).toBe(false);
  });
});
