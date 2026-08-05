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

  // Task 3 mounts createAuth(env) on the Hono app's /api/auth/* route.
  // Until then, SELF-fetch hits no handler and 404s — this is the red state
  // Task 3 turns green by wiring the middleware + route from the research doc.
  it.fails("sends a dev OTP via the SELF-mounted /api/auth route (Task 3)", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "crew@example.com", type: "sign-in" }),
    });
    expect(res.status).toBe(200);
    const otp = getLastDevOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });
});
