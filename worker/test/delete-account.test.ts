import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";
import { signInAs } from "./helpers";

/**
 * Deleting an account.
 *
 * `POST /api/auth/delete-user` removes one row — the user — and everything else goes with it
 * because every table that holds anything of theirs declares ON DELETE cascade. That is the
 * whole design, and it is only safe if the database actually ENFORCES the cascade: a declared
 * one that SQLite ignores orphans the rows instead of removing them, and looks identical from
 * the caller's side. So the cascade is measured here rather than read off the schema.
 */

const OWNER = "delete-owner@example.com";
const BYSTANDER = "delete-bystander@example.com";

let ownerCookie = "";
let ownerId = "";
let bystanderCookie = "";
let bystanderId = "";

function api(path: string, init?: RequestInit) {
  return SELF.fetch(`https://example.com/api${path}`, init);
}

/**
 * better-auth guards its sensitive endpoints with an Origin check that the app's own Hono routes
 * do not have — without a header it answers `MISSING_OR_NULL_ORIGIN`, 403, and deletes nothing.
 * A browser sends this automatically on a same-origin request, so it costs the real client
 * nothing; it only has to be supplied by hand here. The value has to be the trusted origin,
 * which comes from BETTER_AUTH_URL (`http://localhost:8787` in .dev.vars) rather than from the
 * URL SELF.fetch is called with.
 */
const AUTH_ORIGIN = "http://localhost:8787";

beforeAll(async () => {
  const db = drizzle(env.DB, { schema });
  await seedAirports(db);

  ownerCookie = await signInAs(OWNER);
  ownerId = ((await (await api("/me", { headers: { Cookie: ownerCookie } })).json()) as { id: string })
    .id;

  bystanderCookie = await signInAs(BYSTANDER);
  bystanderId = (
    (await (await api("/me", { headers: { Cookie: bystanderCookie } })).json()) as { id: string }
  ).id;
});

async function countsFor(userId: string) {
  const one = async (sql: string) =>
    (await env.DB.prepare(sql).bind(userId).first<{ n: number }>())?.n ?? -1;
  return {
    user: await one("SELECT COUNT(*) AS n FROM user WHERE id = ?"),
    session: await one("SELECT COUNT(*) AS n FROM session WHERE user_id = ?"),
    trips: await one("SELECT COUNT(*) AS n FROM trips WHERE user_id = ?"),
    flights: await one("SELECT COUNT(*) AS n FROM flights WHERE user_id = ?"),
    invitesSent: await one("SELECT COUNT(*) AS n FROM crew_invites WHERE from_user_id = ?"),
  };
}

describe("DELETE account", () => {
  it("takes the roster, the crew invites and the sessions with it", async () => {
    // Give the owner something to lose, through the real API — a hand-written row could satisfy
    // the cascade while the app's own writes did not.
    const created = await api("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({
        legs: [
          {
            flightNo: "EK448",
            origin: "DXB",
            dest: "AKL",
            depUtc: "2026-09-01T02:00:00.000Z",
            arrUtc: "2026-09-02T06:00:00.000Z",
          },
        ],
      }),
    });
    expect(created.status).toBe(201);

    const invited = await api("/crew/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ email: BYSTANDER }),
    });
    expect(invited.status).toBe(201);

    // The instrument first: prove these counts can be non-zero, or "all zero afterwards" proves
    // nothing at all.
    const before = await countsFor(ownerId);
    expect(before).toEqual({ user: 1, session: 1, trips: 1, flights: 1, invitesSent: 1 });

    const res = await api("/auth/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie, Origin: AUTH_ORIGIN },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    const after = await countsFor(ownerId);
    expect(after).toEqual({ user: 0, session: 0, trips: 0, flights: 0, invitesSent: 0 });
  });

  it("leaves everyone else untouched", async () => {
    // The bystander was the invited party on a row that has just been deleted from under them.
    // Their own account, session and data must be exactly as they were.
    const theirs = await countsFor(bystanderId);
    expect(theirs.user).toBe(1);
    expect(theirs.session).toBe(1);

    const me = await api("/me", { headers: { Cookie: bystanderCookie } });
    expect(me.status).toBe(200);
  });

  it("ends the session, so the cookie stops working immediately", async () => {
    // Deleting the row is not enough on its own: a still-valid session cookie for a user that
    // no longer exists is the kind of thing that 500s rather than 401s.
    const me = await api("/me", { headers: { Cookie: ownerCookie } });
    expect(me.status).toBe(401);

    const trips = await api("/trips", { headers: { Cookie: ownerCookie } });
    expect(trips.status).toBe(401);
  });

  it("refuses a signed-out caller", async () => {
    const res = await api("/auth/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: AUTH_ORIGIN },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(200);
  });

  it("refuses a cross-site POST, even with a valid cookie", async () => {
    // The endpoint is CSRF-protected: a cookie alone is not enough, the Origin has to be ours.
    // Worth pinning, because "delete everything" is the worst thing to leave forgeable.
    const stranger = await signInAs("delete-csrf@example.com");
    const res = await api("/auth/delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: stranger,
        Origin: "https://evil.example",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);

    const me = await api("/me", { headers: { Cookie: stranger } });
    expect(me.status).toBe(200); // still there
  });
});
