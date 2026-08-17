import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrewResponse, Flight, Trip } from "@danyeowa/shared";

type TripWithFlights = Trip & { flights: Flight[] };
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";
import { signInAs } from "./helpers";

// Storage is shared across the tests in this file (not rolled back per test), so anything a
// test writes has to be cleared here or the next one inherits it — the accounts created in
// beforeAll are deliberately kept.
afterEach(() => {
  vi.unstubAllGlobals();
  delete (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
});

beforeEach(async () => {
  const db = drizzle(env.DB, { schema });
  await db.delete(schema.crewInvites);
  await db.delete(schema.flights);
  await db.delete(schema.trips);
  await seedAirports(db);
});

const EMAIL_A = "crew-a@example.com";
const EMAIL_B = "crew-b@example.com";
const EMAIL_C = "crew-stranger@example.com";

// Signed in once for the whole file, not per test: the OTP endpoint allows 3 sends per minute
// and the clock doesn't advance here. The beforeEach above is what gives each test a clean
// slate — these three accounts are the only state that survives between them.
let cookieA = "";
let cookieB = "";
let cookieC = "";
let idA = "";
let idB = "";

const trip = {
  label: "AKL swing",
  legs: [
    {
      flightNo: "EK448",
      origin: "DXB",
      dest: "AKL",
      depUtc: "2026-09-01T02:00:00.000Z",
      arrUtc: "2026-09-02T06:00:00.000Z",
    },
  ],
};

const json = (cookie: string) => ({ "Content-Type": "application/json", Cookie: cookie });

function api(path: string, init?: RequestInit) {
  return SELF.fetch(`https://example.com/api${path}`, init);
}

async function createTrip(cookie: string) {
  const res = await api("/trips", { method: "POST", headers: json(cookie), body: JSON.stringify(trip) });
  expect(res.status).toBe(201);
  return (await res.json()) as TripWithFlights;
}

async function invite(cookie: string, email: string) {
  const res = await api("/crew/invites", {
    method: "POST",
    headers: json(cookie),
    body: JSON.stringify({ email }),
  });
  return {
    status: res.status,
    body: (await res.json()) as { id: string; token?: string; emailed?: boolean; error?: string },
  };
}

const accept = (cookie: string, id: string) =>
  api(`/crew/invites/${id}/accept`, { method: "POST", headers: json(cookie) });
const revoke = (cookie: string, id: string) =>
  api(`/crew/invites/${id}/revoke`, { method: "POST", headers: json(cookie) });

const crewOf = async (cookie: string) =>
  (await (await api("/crew", { headers: { Cookie: cookie } })).json()) as CrewResponse;

/** Whoever holds `cookie` reading `userId`'s roster. */
const crewTrips = (cookie: string, userId: string) =>
  api(`/crew/${userId}/trips`, { headers: { Cookie: cookie } });

const ownTrips = async (cookie: string) =>
  ((await (await api("/trips", { headers: { Cookie: cookie } })).json()) as { trips: TripWithFlights[] }).trips;

/** A invites B, B accepts. The starting point for everything past the invite flow itself. */
async function pairUp() {
  const created = await invite(cookieA, EMAIL_B);
  expect(created.status).toBe(201);
  expect((await accept(cookieB, created.body.id)).status).toBe(200);
  return created.body.id;
}

beforeAll(async () => {
  cookieA = await signInAs(EMAIL_A);
  cookieB = await signInAs(EMAIL_B);
  cookieC = await signInAs(EMAIL_C);
  idA = ((await (await api("/me", { headers: { Cookie: cookieA } })).json()) as { id: string }).id;
  idB = ((await (await api("/me", { headers: { Cookie: cookieB } })).json()) as { id: string }).id;
});

describe("crew sharing", () => {
  it("requires a session on every route", async () => {
    expect((await api("/crew")).status).toBe(401);
    expect(
      (
        await api("/crew/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    expect((await api("/crew/invites/whatever/accept", { method: "POST" })).status).toBe(401);
    expect((await api("/crew/invites/whatever/revoke", { method: "POST" })).status).toBe(401);
    expect((await api(`/crew/${idA}/trips`)).status).toBe(401);
  });

  // Until now an invite told the recipient nothing. It was invisible unless they already had an
  // account, signed in, and happened to look at the Share tab — which is why one sat unnoticed
  // in production. The email is the notification; the row is still the source of truth.
  it("emails the invited address, and says so", async () => {
    const key = "re_test_key";
    (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY = key;
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { status, body } = await invite(cookieA, "someone-new@example.com");

    expect(status).toBe(201);
    expect(body.emailed).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(init.body)) as { to: string[]; subject: string; html: string };
    expect(payload.to).toEqual(["someone-new@example.com"]);
    // No token and no sign-in link: the invite is claimed by signing in as the invited address,
    // so a forwarded email grants nothing. This is the property the deleted share link lacked.
    expect(payload.html).not.toContain("token");
    expect(payload.html).toContain("danyeowa.com");
  });

  it("still creates a usable invite when the email cannot be sent", async () => {
    // No RESEND_API_KEY configured — sendCrewInviteEmail gives up before any network call.
    delete (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;

    const { status, body } = await invite(cookieA, EMAIL_B);
    expect(status).toBe(201);
    // Reported honestly rather than swallowed: the sender is told nobody was notified.
    expect(body.emailed).toBe(false);

    // The invite itself is untouched by the mail failure — B can still accept it.
    expect((await accept(cookieB, body.id)).status).toBe(200);
    expect((await crewOf(cookieA)).members.map((m) => m.userId)).toEqual([idB]);
  });

  it("pairs two accounts and lets each read the other's roster", async () => {
    await pairUp();
    const tripA = await createTrip(cookieA);
    await createTrip(cookieB);

    const crewA = await crewOf(cookieA);
    expect(crewA.members.map((m) => m.userId)).toEqual([idB]);
    expect(crewA.members[0]!.email).toBe(EMAIL_B);
    expect(crewA.sent).toEqual([]);
    expect((await crewOf(cookieB)).members.map((m) => m.userId)).toEqual([idA]);

    const seenByB = await crewTrips(cookieB, idA);
    expect(seenByB.status).toBe(200);
    const { trips } = (await seenByB.json()) as { trips: TripWithFlights[] };
    expect(trips.map((t) => t.id)).toEqual([tripA.id]);
    // Identical shape to /api/trips — the calendar renders both through the same components.
    expect(trips[0]!.flights[0]!.flightNo).toBe("EK448");
  });

  it("lists a pending invite for both sides, with the token only for the sender", async () => {
    const created = await invite(cookieA, EMAIL_B);
    expect(created.status).toBe(201);

    const sender = await crewOf(cookieA);
    expect(sender.sent.map((i) => i.email)).toEqual([EMAIL_B]);
    expect(sender.sent[0]!.token).toBeTruthy();
    expect(sender.members).toEqual([]);

    const receiver = await crewOf(cookieB);
    expect(receiver.received.map((i) => i.id)).toEqual([created.body.id]);
    expect(receiver.received[0]!.token).toBeUndefined();
    expect(receiver.members).toEqual([]);
  });

  it("matches the invited address case-insensitively", async () => {
    const created = await invite(cookieA, EMAIL_B.toUpperCase());
    expect(created.status).toBe(201);

    expect((await accept(cookieB, created.body.id)).status).toBe(200);
    expect((await crewOf(cookieB)).members.map((m) => m.userId)).toEqual([idA]);
  });

  it("refuses to invite yourself, or to invite the same person twice", async () => {
    expect((await invite(cookieA, EMAIL_A)).status).toBe(400);
    expect((await invite(cookieA, EMAIL_A.toUpperCase())).status).toBe(400);

    expect((await invite(cookieA, EMAIL_B)).status).toBe(201);
    expect((await invite(cookieA, EMAIL_B)).status).toBe(409);
  });

  it("rejects a malformed email", async () => {
    expect((await invite(cookieA, "not-an-email")).status).toBe(400);
    expect((await invite(cookieA, "")).status).toBe(400);
  });

  it("will not let a third party accept an invite addressed to someone else", async () => {
    const created = await invite(cookieA, EMAIL_B);

    // 404, not 403: a 403 would confirm the invite exists, and hint at who it is for.
    expect((await accept(cookieC, created.body.id)).status).toBe(404);
    expect((await crewOf(cookieC)).members).toEqual([]);
    expect((await crewTrips(cookieC, idA)).status).toBe(404);
  });

  it("refuses to read a roster with no pairing", async () => {
    await createTrip(cookieA);

    expect((await crewTrips(cookieC, idA)).status).toBe(404);
    // An account that doesn't exist answers identically, so this can't probe for accounts.
    expect((await crewTrips(cookieC, "no-such-user")).status).toBe(404);
  });

  it("stops the sharing in both directions once either side revokes", async () => {
    const inviteId = await pairUp();
    await createTrip(cookieA);

    expect((await crewTrips(cookieB, idA)).status).toBe(200);
    expect((await revoke(cookieB, inviteId)).status).toBe(200);

    expect((await crewTrips(cookieB, idA)).status).toBe(404);
    expect((await crewTrips(cookieA, idB)).status).toBe(404);
    expect((await crewOf(cookieA)).members).toEqual([]);
    expect((await crewOf(cookieB)).members).toEqual([]);
  });

  it("will not revoke an invite you are not a party to", async () => {
    const created = await invite(cookieA, EMAIL_B);

    expect((await revoke(cookieC, created.body.id)).status).toBe(404);
    expect((await crewOf(cookieA)).sent).toHaveLength(1);
  });

  it("re-accepting is a no-op, and a revoked invite cannot be accepted again", async () => {
    const inviteId = await pairUp();
    expect((await accept(cookieB, inviteId)).status).toBe(200);
    expect((await crewOf(cookieB)).members).toHaveLength(1);

    await revoke(cookieB, inviteId);
    expect((await accept(cookieB, inviteId)).status).toBe(409);
    expect((await crewOf(cookieB)).members).toEqual([]);
  });

  // --- The pairing can only exist once, and revoking it means it is gone.
  // Found by adversarial review: A and B each sending an invite (the natural race when two
  // people agree to share and both go do it) used to leave TWO live grants, so "Stop sharing"
  // revoked one row and the other kept reading.
  it("refuses a reciprocal invite once the pairing is live", async () => {
    await pairUp();

    const back = await invite(cookieB, EMAIL_A);
    expect(back.status).toBe(409);
    expect(back.body.error).toBe("already_paired");
    expect((await crewOf(cookieB)).sent).toEqual([]);
  });

  it("revokes every live grant between the pair, not just the row that was clicked", async () => {
    // A pairing made before creation started refusing the second row — written straight to the
    // table because the API now (correctly) has no way to produce it.
    const first = await pairUp();
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.crewInvites).values({
      id: "legacy-duplicate",
      fromUserId: idB,
      toEmail: EMAIL_A,
      token: "legacy-token",
      createdAt: Date.now(),
      acceptedAt: Date.now(),
      acceptedByUserId: idA,
    });
    await createTrip(cookieA);
    expect((await crewTrips(cookieB, idA)).status).toBe(200);

    expect((await revoke(cookieA, first)).status).toBe(200);

    expect((await crewTrips(cookieB, idA)).status).toBe(404);
    expect((await crewTrips(cookieA, idB)).status).toBe(404);
    expect((await crewOf(cookieA)).members).toEqual([]);
    expect((await crewOf(cookieB)).members).toEqual([]);
  });

  it("shows one badge per crew member even when two live rows name the same pair", async () => {
    await pairUp();
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.crewInvites).values({
      id: "legacy-duplicate-2",
      fromUserId: idB,
      toEmail: EMAIL_A,
      token: "legacy-token-2",
      createdAt: Date.now(),
      acceptedAt: Date.now(),
      acceptedByUserId: idA,
    });

    // Two rows, one person: duplicate badges each with their own "Stop sharing" read as a
    // rendering glitch rather than as two separate grants.
    expect((await crewOf(cookieA)).members.map((m) => m.userId)).toEqual([idB]);
    expect((await crewOf(cookieB)).members.map((m) => m.userId)).toEqual([idA]);
  });

  it("names the sender on an invite addressed to you", async () => {
    await invite(cookieA, EMAIL_B);

    const received = (await crewOf(cookieB)).received;
    expect(received).toHaveLength(1);
    // Accepting hands someone your whereabouts — it cannot be an anonymous "someone".
    expect(received[0]!.fromEmail).toBe(EMAIL_A);
    expect(received[0]!.token).toBeUndefined();
  });

  it("reads in both directions once paired, not just accepter to inviter", async () => {
    await pairUp();
    const tripB = await createTrip(cookieB);

    // The inviter reading the accepter's roster — the mirror of the case already covered.
    const res = await crewTrips(cookieA, idB);
    expect(res.status).toBe(200);
    const { trips } = (await res.json()) as { trips: TripWithFlights[] };
    expect(trips.map((t) => t.id)).toEqual([tripB.id]);
  });

  it("lets the recipient decline, leaving no pairing and nothing waiting", async () => {
    const created = await invite(cookieA, EMAIL_B);

    expect((await revoke(cookieB, created.body.id)).status).toBe(200);

    expect((await crewOf(cookieA)).sent).toEqual([]);
    expect((await crewOf(cookieB)).received).toEqual([]);
    expect((await crewOf(cookieB)).members).toEqual([]);
    expect((await crewTrips(cookieB, idA)).status).toBe(404);
  });

  // The whole point of the feature: crew access is READ-only. These are the write paths a paired
  // account could reach for, and every one of them must still refuse.
  it("gives a crew member no way to change the roster they can read", async () => {
    await pairUp();
    const tripA = await createTrip(cookieA);
    const flightId = tripA.flights[0]!.id;

    expect((await api(`/trips/${tripA.id}`, { method: "DELETE", headers: json(cookieB) })).status).toBe(404);
    expect(
      (
        await api(`/flights/${flightId}`, {
          method: "PATCH",
          headers: json(cookieB),
          body: JSON.stringify({ flightNo: "EK999" }),
        })
      ).status,
    ).toBe(404);

    const untouched = await ownTrips(cookieA);
    expect(untouched.map((t) => t.id)).toEqual([tripA.id]);
    expect(untouched[0]!.flights[0]!.flightNo).toBe("EK448");
  });

  it("keeps a crew member's trips out of your own list", async () => {
    await pairUp();
    const tripA = await createTrip(cookieA);
    await createTrip(cookieB);

    const own = await ownTrips(cookieB);
    expect(own.map((t) => t.id)).not.toContain(tripA.id);
    expect(own).toHaveLength(1);
  });
});
