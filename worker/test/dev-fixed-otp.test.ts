import { describe, expect, it } from "vitest";
import { devFixedOtpFor } from "../src/auth";

const DEV = { DEV_OTP_FALLBACK: "true", DEV_FIXED_OTP_EMAIL: "logan@example.com" };

describe("devFixedOtpFor", () => {
  it("hands the fixed code to the configured local address", () => {
    expect(devFixedOtpFor(DEV, "logan@example.com")).toBe("123123");
  });

  it("matches regardless of case, since better-auth lowercases the submitted address", () => {
    expect(devFixedOtpFor(DEV, "LOGAN@example.com")).toBe("123123");
    expect(devFixedOtpFor({ ...DEV, DEV_FIXED_OTP_EMAIL: "Logan@Example.com" }, "logan@example.com")).toBe(
      "123123",
    );
  });

  it("leaves every other address to the random generator", () => {
    expect(devFixedOtpFor(DEV, "someone-else@example.com")).toBeUndefined();
  });

  // The rest of this file is the security boundary: a deployed Worker must never be able to
  // reach the fixed code, because that would make the test account signable-into by anyone.
  it("stays off when DEV_OTP_FALLBACK is absent, even for the configured address", () => {
    expect(devFixedOtpFor({ DEV_FIXED_OTP_EMAIL: "logan@example.com" }, "logan@example.com")).toBeUndefined();
  });

  it("stays off for any DEV_OTP_FALLBACK value other than exactly \"true\"", () => {
    for (const flag of ["false", "1", "TRUE", "yes", ""]) {
      expect(devFixedOtpFor({ ...DEV, DEV_OTP_FALLBACK: flag }, "logan@example.com")).toBeUndefined();
    }
  });

  it("stays off when no address is configured, however the flag is set", () => {
    expect(devFixedOtpFor({ DEV_OTP_FALLBACK: "true" }, "logan@example.com")).toBeUndefined();
    expect(devFixedOtpFor({ DEV_OTP_FALLBACK: "true", DEV_FIXED_OTP_EMAIL: "" }, "")).toBeUndefined();
  });
});
