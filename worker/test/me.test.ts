import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Me } from "@roaster/shared";
import { getLastDevOtp } from "../src/email";

describe("GET /api/me", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch("https://example.com/api/me");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthenticated" });
  });

  it("returns the signed-in user after a full OTP sign-in flow", async () => {
    const email = "pilot@example.com";

    const sendRes = await SELF.fetch("https://example.com/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(sendRes.status).toBe(200);

    const otp = getLastDevOtp();
    expect(otp).toMatch(/^\d{6}$/);

    const signInRes = await SELF.fetch("https://example.com/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    expect(signInRes.status).toBe(200);

    const setCookies = signInRes.headers.getSetCookie
      ? signInRes.headers.getSetCookie()
      : [signInRes.headers.get("set-cookie") ?? ""];
    expect(setCookies.length).toBeGreaterThan(0);
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

    const meRes = await SELF.fetch("https://example.com/api/me", {
      headers: { Cookie: cookieHeader },
    });
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as Me;
    expect(body.email).toBe(email);
  });
});
