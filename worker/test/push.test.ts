import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { PushConfig } from "@danyeowa/shared";
import * as schema from "../src/db/schema";
import { signInAs } from "./helpers";

function subscribeBody(endpoint: string) {
  return {
    endpoint,
    keys: { p256dh: "test-p256dh-key", auth: "test-auth-secret" },
  };
}

async function subscribe(cookie: string, endpoint: string) {
  return SELF.fetch("https://example.com/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(subscribeBody(endpoint)),
  });
}

describe("push API", () => {
  describe("unauthenticated", () => {
    it("401s on GET /api/push/config", async () => {
      const res = await SELF.fetch("https://example.com/api/push/config");
      expect(res.status).toBe(401);
    });

    it("401s on POST /api/push/subscribe", async () => {
      const res = await SELF.fetch("https://example.com/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscribeBody("https://push.example.com/abc")),
      });
      expect(res.status).toBe(401);
    });

    it("401s on DELETE /api/push/subscribe", async () => {
      const res = await SELF.fetch("https://example.com/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "https://push.example.com/abc" }),
      });
      expect(res.status).toBe(401);
    });

    it("401s on PUT /api/push/prefs", async () => {
      const res = await SELF.fetch("https://example.com/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, leadMinutes: 60 }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("as an authenticated user", () => {
    let cookie: string;

    beforeAll(async () => {
      cookie = await signInAs("crew-push1@example.com");
    });

    it("GET /api/push/config returns publicKey and defaults when no row exists", async () => {
      const res = await SELF.fetch("https://example.com/api/push/config", {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushConfig;
      expect(typeof body.publicKey).toBe("string");
      expect(body.publicKey.length).toBeGreaterThan(0);
      expect(body.enabled).toBe(true);
      expect(body.leadMinutes).toBe(120);
      expect(body.subscribed).toBe(false);
    });

    it("POST /api/push/subscribe creates a subscription (201) and config reflects subscribed:true", async () => {
      const res = await subscribe(cookie, "https://push.example.com/endpoint-1");
      expect(res.status).toBe(201);

      const configRes = await SELF.fetch("https://example.com/api/push/config", {
        headers: { Cookie: cookie },
      });
      const body = (await configRes.json()) as PushConfig;
      expect(body.subscribed).toBe(true);
    });

    it("POST /api/push/subscribe upserts by endpoint instead of creating duplicates", async () => {
      const endpoint = "https://push.example.com/endpoint-dedupe";
      await subscribe(cookie, endpoint);
      await subscribe(cookie, endpoint);

      const db = drizzle(env.DB, { schema });
      const rows = await db
        .select()
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, endpoint));
      expect(rows).toHaveLength(1);
    });

    it("POST /api/push/subscribe rejects an invalid body (400)", async () => {
      const res = await SELF.fetch("https://example.com/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ endpoint: "not-a-url", keys: { p256dh: "", auth: "" } }),
      });
      expect(res.status).toBe(400);
    });

    it("POST /api/push/subscribe rejects a non-https endpoint (400)", async () => {
      const res = await SELF.fetch("https://example.com/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(subscribeBody("http://push.example.com/insecure")),
      });
      expect(res.status).toBe(400);
    });

    it("DELETE /api/push/subscribe removes the subscription (204) and config reflects subscribed:false", async () => {
      const endpoint = "https://push.example.com/endpoint-delete";
      await subscribe(cookie, endpoint);

      const res = await SELF.fetch("https://example.com/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ endpoint }),
      });
      expect(res.status).toBe(204);

      const db = drizzle(env.DB, { schema });
      const rows = await db
        .select()
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, endpoint));
      expect(rows).toHaveLength(0);
    });

    it("PUT /api/push/prefs updates enabled + leadMinutes and config reflects them", async () => {
      const res = await SELF.fetch("https://example.com/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ enabled: false, leadMinutes: 90 }),
      });
      expect(res.status).toBe(200);

      const configRes = await SELF.fetch("https://example.com/api/push/config", {
        headers: { Cookie: cookie },
      });
      const body = (await configRes.json()) as PushConfig;
      expect(body.enabled).toBe(false);
      expect(body.leadMinutes).toBe(90);
    });

    it("PUT /api/push/prefs rejects leadMinutes outside 30..360 (400)", async () => {
      const tooLow = await SELF.fetch("https://example.com/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ enabled: true, leadMinutes: 10 }),
      });
      expect(tooLow.status).toBe(400);

      const tooHigh = await SELF.fetch("https://example.com/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ enabled: true, leadMinutes: 400 }),
      });
      expect(tooHigh.status).toBe(400);
    });
  });

  describe("user isolation", () => {
    let ownerCookie: string;
    let intruderCookie: string;

    beforeAll(async () => {
      ownerCookie = await signInAs("push-owner@example.com");
      intruderCookie = await signInAs("push-intruder@example.com");
    });

    it("does not let another user's subscribe affect this user's subscribed flag", async () => {
      await subscribe(ownerCookie, "https://push.example.com/owner-endpoint");

      const res = await SELF.fetch("https://example.com/api/push/config", {
        headers: { Cookie: intruderCookie },
      });
      const body = (await res.json()) as PushConfig;
      expect(body.subscribed).toBe(false);
    });

    it("does not let another user's prefs update affect this user's prefs", async () => {
      await SELF.fetch("https://example.com/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ enabled: false, leadMinutes: 45 }),
      });

      const res = await SELF.fetch("https://example.com/api/push/config", {
        headers: { Cookie: intruderCookie },
      });
      const body = (await res.json()) as PushConfig;
      expect(body.enabled).toBe(true);
      expect(body.leadMinutes).toBe(120);
    });

    it("does not let an intruder DELETE another user's subscription", async () => {
      const endpoint = "https://push.example.com/owner-delete-target";
      await subscribe(ownerCookie, endpoint);

      const res = await SELF.fetch("https://example.com/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: intruderCookie },
        body: JSON.stringify({ endpoint }),
      });
      // The route scopes the delete to the caller's user_id, so it 204s (no-op)
      // without matching any row rather than error - assert the owner's row survives.
      expect(res.status).toBe(204);

      const database = drizzle(env.DB, { schema });
      const rows = await database
        .select()
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, endpoint));
      expect(rows).toHaveLength(1);
    });
  });
});
