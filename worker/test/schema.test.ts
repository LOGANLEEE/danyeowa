import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("auth schema", () => {
  it("has better-auth tables", async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    for (const t of ["user", "session", "account", "verification"]) {
      expect(names).toContain(t);
    }
  });
});
