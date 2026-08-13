import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth";
import { getLastDevOtp } from "../src/email";

describe("email OTP send", () => {
  it("sends a dev OTP via direct createAuth(env).api call", async () => {
    const auth = createAuth(env);
    const result = await auth.api.sendVerificationOTP({
      body: { email: "crew@example.com", type: "sign-in" },
    });
    expect(result).toBeTruthy();
    const otp = getLastDevOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("sends a dev OTP via the SELF-mounted /api/auth route (Task 3)", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "crew@example.com", type: "sign-in" }),
    });
    expect(res.status).toBe(200);
    const otp = getLastDevOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  // The OTP is a bearer credential for any account. Stored in plain text, read access to D1 is
  // enough to sign in as anyone — which is how a production crew test was actually run here.
  it("stores the OTP hashed, and still accepts the plain-text code", async () => {
    const email = "hashcheck@example.com";
    const sendRes = await SELF.fetch(
      "https://example.com/api/auth/email-otp/send-verification-otp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "sign-in" }),
      },
    );
    expect(sendRes.status).toBe(200);

    const otp = getLastDevOtp();
    expect(otp).toMatch(/^\d{6}$/);

    const stored = await env.DB.prepare(
      "SELECT value FROM verification WHERE identifier LIKE ?",
    )
      .bind(`%${email}`)
      .all<{ value: string }>();
    expect(stored.results.length).toBeGreaterThan(0);
    for (const row of stored.results) {
      expect(row.value).not.toContain(otp);
    }

    // Hashing is only worth having if the code the user typed still verifies.
    const signInRes = await SELF.fetch("https://example.com/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    expect(signInRes.status).toBe(200);
  });
});
