import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { HealthResponse } from "@roaster/shared";

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
});
