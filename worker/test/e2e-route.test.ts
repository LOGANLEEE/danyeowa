import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/__e2e/last-otp", () => {
  it("404s when E2E_TEST_MODE is unset", async () => {
    // The default test env (worker/vitest.config.ts bindings) does NOT set
    // E2E_TEST_MODE, so this proves the route is closed by default.
    const res = await SELF.fetch("https://example.com/api/__e2e/last-otp?email=crew@example.com");
    expect(res.status).toBe(404);
  });
});
