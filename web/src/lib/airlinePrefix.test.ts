import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AIRLINE_PREFIX, getAirlinePrefix, setAirlinePrefix } from "./airlinePrefix";

describe("airline prefix store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to EK when nothing is stored", () => {
    expect(getAirlinePrefix()).toBe(DEFAULT_AIRLINE_PREFIX);
  });

  it("round-trips a set value", () => {
    setAirlinePrefix("QF");
    expect(getAirlinePrefix()).toBe("QF");
  });

  it("falls back to EK when the stored value is garbage", () => {
    localStorage.setItem("roster-airline-prefix", "garbage");
    expect(getAirlinePrefix()).toBe(DEFAULT_AIRLINE_PREFIX);
  });

  it("stores lowercase input uppercased", () => {
    setAirlinePrefix("qf");
    expect(getAirlinePrefix()).toBe("QF");
  });

  it("rejects a 1-character value", () => {
    setAirlinePrefix("Q");
    expect(getAirlinePrefix()).toBe(DEFAULT_AIRLINE_PREFIX);
  });

  it("rejects a 3-character value", () => {
    setAirlinePrefix("QFA");
    expect(getAirlinePrefix()).toBe(DEFAULT_AIRLINE_PREFIX);
  });

  it("rejects digits", () => {
    setAirlinePrefix("Q1");
    expect(getAirlinePrefix()).toBe(DEFAULT_AIRLINE_PREFIX);
  });

  it("falls back to EK when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getAirlinePrefix()).toBe(DEFAULT_AIRLINE_PREFIX);
    spy.mockRestore();
  });
});
