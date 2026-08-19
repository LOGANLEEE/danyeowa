import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { HealthResponse } from "@danyeowa/shared";

describe("GET /api/health", () => {
  it("returns ok with live D1", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body).toEqual({ ok: true, d1: true });
  });

  it("has a DB binding", () => {
    expect(env.DB).toBeDefined();
  });

  // The deploy job asserts that production reports THIS commit before it calls the deploy done.
  // Without that, a green deploy job proves only that wrangler exited zero — which it did on the
  // run where production kept serving code that queried a dropped table.
  it("reports the commit it was deployed from, when the deploy supplied one", async () => {
    (env as unknown as { BUILD_SHA?: string }).BUILD_SHA = "abc123def456";
    try {
      const res = await SELF.fetch("https://example.com/api/health");
      const body = (await res.json()) as HealthResponse;
      expect(body.version).toBe("abc123def456");
    } finally {
      delete (env as unknown as { BUILD_SHA?: string }).BUILD_SHA;
    }
  });

  it("omits version entirely when nothing supplied one", async () => {
    // Local dev and `wrangler dev` have no BUILD_SHA. An empty string would read as a deployed
    // commit of "" and make the smoke check compare nothing to nothing.
    const body = (await (
      await SELF.fetch("https://example.com/api/health")
    ).json()) as HealthResponse;
    expect("version" in body).toBe(false);
  });
});
