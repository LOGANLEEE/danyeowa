import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("GET /api/__e2e/last-otp", () => {
  it("404s when E2E_TEST_MODE is unset", async () => {
    // Call the Hono app directly with an explicit env override instead of SELF.fetch.
    // SELF.fetch runs against wrangler's ambient bindings, which on a dev machine with a
    // .dev.vars file setting E2E_TEST_MODE would silently open the gate — the "closed"
    // branch would then never actually execute, making this assertion a false negative.
    // Passing env directly guarantees the binding is unset for this request.
    const res = await app.request(
      "https://example.com/api/__e2e/last-otp?email=crew@example.com",
      {},
      { ...env, E2E_TEST_MODE: undefined },
    );
    expect(res.status).toBe(404);
  });

  it("is reachable when E2E_TEST_MODE is explicitly true", async () => {
    // Same call, but with the gate explicitly opened. Omit `email` so the response is the
    // route's own 400 ("email is required") rather than a 404 — proving we passed the
    // E2E_TEST_MODE check rather than merely hitting the same not-found path for a
    // different reason.
    const res = await app.request(
      "https://example.com/api/__e2e/last-otp",
      {},
      { ...env, E2E_TEST_MODE: "true" },
    );
    expect(res.status).toBe(400);
  });
});
