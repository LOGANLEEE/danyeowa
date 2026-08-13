import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Me } from "@danyeowa/shared";
import { signInAs } from "./helpers";

describe("GET /api/me", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch("https://example.com/api/me");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthenticated" });
  });

  it("returns the signed-in user after a full OTP sign-in flow", async () => {
    const email = "pilot@example.com";
    const cookieHeader = await signInAs(email);

    const meRes = await SELF.fetch("https://example.com/api/me", {
      headers: { Cookie: cookieHeader },
    });
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as Me;
    expect(body.email).toBe(email);
  });
});
