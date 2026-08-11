import { describe, expect, it } from "vitest";
import { normaliseFlightNo } from "./flight";

describe("normaliseFlightNo", () => {
  it("strips leading zeros from the numeric part", () => {
    expect(normaliseFlightNo("EK049")).toBe("EK49");
    expect(normaliseFlightNo("EK0049")).toBe("EK49");
  });

  it("uppercases and trims", () => {
    expect(normaliseFlightNo("ek49")).toBe("EK49");
    expect(normaliseFlightNo("  ek49  ")).toBe("EK49");
  });

  it("leaves an already-minimal flight number unchanged", () => {
    expect(normaliseFlightNo("EK9")).toBe("EK9");
  });

  it("keeps at least one digit when the numeric part is all zeros", () => {
    expect(normaliseFlightNo("EK0")).toBe("EK0");
    expect(normaliseFlightNo("EK000")).toBe("EK0");
  });

  it("leaves a non-matching value alone (just trimmed+uppercased) instead of mangling it", () => {
    expect(normaliseFlightNo("not-a-flight")).toBe("NOT-A-FLIGHT");
    expect(normaliseFlightNo("EK")).toBe("EK");
  });
});
