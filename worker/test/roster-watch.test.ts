import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrewResponse } from "@danyeowa/shared";
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";
import { runRosterWatchScan } from "../src/roster-watch";
import { __testing } from "../src/webpush";
import { signInAs } from "./helpers";

const NOW_MS = Date.parse("2026-09-01T00:00:00.000Z");

function db() {
  return drizzle(env.DB, { schema });
}

async function makeUser(label: string): Promise<string> {
  const id = crypto.randomUUID();
  const email = `${label}-${id}@local.test`;
  await db().insert(schema.user).values({ id, name: label, email });
  return id;
}

async function pair(a: string, b: string): Promise<string> {
  const id = crypto.randomUUID();
  await db().insert(schema.crewInvites).values({
    id,
    fromUserId: a,
    toEmail: `${id}@local.test`,
    token: id,
    acceptedAt: 1,
    acceptedByUserId: b,
  });
  return id;
}

/** One trip with one flight; `depUtc` is the part tests vary to make a "change". */
async function addTrip(userId: string, depUtc: string, flightNo = "EK448"): Promise<string> {
  const tripId = crypto.randomUUID();
  await db().insert(schema.trips).values({ id: tripId, userId });
  await db().insert(schema.flights).values({
    id: crypto.randomUUID(),
    tripId,
    userId,
    flightNo,
    origin: "DXB",
    dest: "AKL",
    depUtc,
    arrUtc: new Date(Date.parse(depUtc) + 16 * 3_600_000).toISOString(),
    reportUtc: new Date(Date.parse(depUtc) - 2 * 3_600_000).toISOString(),
    depTz: "Asia/Dubai",
    arrTz: "Pacific/Auckland",
  });
  return tripId;
}

const deleteTrip = (tripId: string) => db().delete(schema.trips).where(eq(schema.trips.id, tripId));

async function watch(watcher: string, watched: string, lastFingerprint: string | null = null) {
  await db()
    .insert(schema.rosterWatches)
    .values({ watcherUserId: watcher, watchedUserId: watched, enabled: true, lastFingerprint });
}

async function storedFingerprint(watcher: string, watched: string) {
  const [row] = await db()
    .select()
    .from(schema.rosterWatches)
    .where(
      and(
        eq(schema.rosterWatches.watcherUserId, watcher),
        eq(schema.rosterWatches.watchedUserId, watched),
      ),
    );
  return row ? row.lastFingerprint : undefined;
}

async function vapidEnv() {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  return {
    ...env,
    VAPID_PRIVATE_KEY: __testing.base64urlEncode(pkcs8),
    VAPID_PUBLIC_KEY: __testing.base64urlEncode(raw),
  };
}

async function subscribe(userId: string, endpoint = `https://push.example/${crypto.randomUUID()}`) {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  await db()
    .insert(schema.pushSubscriptions)
    .values({
      userId,
      endpoint,
      p256dh: __testing.base64urlEncode(
        new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)),
      ),
      auth: __testing.base64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
    });
}

const mockPush = (status = 201) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status }));
const sends = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

/** Scan once to take the baseline, as a watcher who just switched the toggle on would. */
async function baseline(vapid: Awaited<ReturnType<typeof vapidEnv>>) {
  await runRosterWatchScan(vapid, NOW_MS);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedAirports(db());
});

describe("runRosterWatchScan", () => {
  it("sends nothing on the first scan and records a baseline", async () => {
    const [w, p] = [await makeUser("w"), await makeUser("p")];
    await pair(w, p);
    await addTrip(p, "2026-09-10T02:00:00.000Z");
    await subscribe(w);
    await watch(w, p);
    mockPush();

    const result = await runRosterWatchScan(await vapidEnv(), NOW_MS);

    expect(sends()).toBe(0);
    expect(result.baselined).toBeGreaterThanOrEqual(1);
    expect(await storedFingerprint(w, p)).toEqual(expect.any(String));
  });

  it("sends nothing when the toggle is off, whatever the other person changes", async () => {
    const [w, p] = [await makeUser("w"), await makeUser("p")];
    await pair(w, p);
    await subscribe(w);
    await addTrip(p, "2026-09-10T02:00:00.000Z");
    mockPush();
    const vapid = await vapidEnv();

    await baseline(vapid);
    await addTrip(p, "2026-09-12T02:00:00.000Z");
    await runRosterWatchScan(vapid, NOW_MS);

    expect(sends()).toBe(0);
  });

  it("pushes for the selected person only", async () => {
    const [w, a, b] = [await makeUser("w"), await makeUser("a"), await makeUser("b")];
    await pair(w, a);
    await pair(w, b);
    await subscribe(w);
    await addTrip(a, "2026-09-10T02:00:00.000Z");
    await addTrip(b, "2026-09-10T02:00:00.000Z");
    await watch(w, a);
    mockPush();
    const vapid = await vapidEnv();
    await baseline(vapid);

    await addTrip(b, "2026-09-11T02:00:00.000Z");
    await runRosterWatchScan(vapid, NOW_MS);
    expect(sends()).toBe(0);

    await addTrip(a, "2026-09-11T02:00:00.000Z");
    await runRosterWatchScan(vapid, NOW_MS);
    expect(sends()).toBe(1);
  });

  it("gives one push for an edit (create then delete) and none for a same-content re-save", async () => {
    const [w, p] = [await makeUser("w"), await makeUser("p")];
    await pair(w, p);
    await subscribe(w);
    const old = await addTrip(p, "2026-09-10T02:00:00.000Z");
    await watch(w, p);
    mockPush();
    const vapid = await vapidEnv();
    await baseline(vapid);

    // Same content under new ids: not a change.
    const again = await addTrip(p, "2026-09-10T02:00:00.000Z");
    await deleteTrip(old);
    await runRosterWatchScan(vapid, NOW_MS);
    expect(sends()).toBe(0);

    // A real edit: the departure moves.
    await addTrip(p, "2026-09-10T05:00:00.000Z");
    await deleteTrip(again);
    await runRosterWatchScan(vapid, NOW_MS);
    expect(sends()).toBe(1);

    await runRosterWatchScan(vapid, NOW_MS);
    expect(sends()).toBe(1);
  });

  it("gives one push for a bulk save of many trips", async () => {
    const [w, p] = [await makeUser("w"), await makeUser("p")];
    await pair(w, p);
    await subscribe(w);
    await watch(w, p);
    mockPush();
    const vapid = await vapidEnv();
    await baseline(vapid);

    for (let day = 10; day < 20; day++) await addTrip(p, `2026-09-${day}T02:00:00.000Z`);
    await runRosterWatchScan(vapid, NOW_MS);

    expect(sends()).toBe(1);
  });

  it("stops at once when the pairing is revoked, and forgets the watch", async () => {
    const [w, p] = [await makeUser("w"), await makeUser("p")];
    const inviteId = await pair(w, p);
    await subscribe(w);
    await watch(w, p);
    mockPush();
    const vapid = await vapidEnv();
    await baseline(vapid);

    await db().update(schema.crewInvites).set({ revokedAt: 5 }).where(eq(schema.crewInvites.id, inviteId));
    await addTrip(p, "2026-09-10T02:00:00.000Z");
    await runRosterWatchScan(vapid, NOW_MS);

    expect(sends()).toBe(0);
    expect(await storedFingerprint(w, p)).toBeUndefined();
  });

  it("keeps the change for the next scan when the push service fails", async () => {
    const [w, p] = [await makeUser("w"), await makeUser("p")];
    await pair(w, p);
    await subscribe(w);
    await watch(w, p);
    const vapid = await vapidEnv();
    mockPush();
    await baseline(vapid);
    const before = await storedFingerprint(w, p);

    await addTrip(p, "2026-09-10T02:00:00.000Z");
    mockPush(500);
    await runRosterWatchScan(vapid, NOW_MS);
    expect(await storedFingerprint(w, p)).toBe(before);

    vi.restoreAllMocks();
    mockPush(201);
    await runRosterWatchScan(vapid, NOW_MS);
    expect(sends()).toBe(1);
    expect(await storedFingerprint(w, p)).not.toBe(before);
  });

  it("drops an expired device and then stays quiet instead of retrying it forever", async () => {
    const [w, p] = [await makeUser("w"), await makeUser("p")];
    await pair(w, p);
    await subscribe(w, "https://push.example/dead");
    await watch(w, p);
    const vapid = await vapidEnv();
    mockPush();
    await baseline(vapid);

    await addTrip(p, "2026-09-10T02:00:00.000Z");
    mockPush(410);
    await runRosterWatchScan(vapid, NOW_MS);
    const callsAfterFirst = sends();
    expect(callsAfterFirst).toBe(1);
    const left = await db()
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, "https://push.example/dead"));
    expect(left).toHaveLength(0);

    await runRosterWatchScan(vapid, NOW_MS);
    expect(sends()).toBe(callsAfterFirst);
  });
});

describe("PUT /api/crew/:userId/roster-push", () => {
  let cookieA = "";
  let idA = "";
  let idB = "";
  let idStranger = "";

  beforeAll(async () => {
    cookieA = await signInAs("roster-push-a@example.com");
    const me = (await (await SELF.fetch("https://example.com/api/me", { headers: { Cookie: cookieA } })).json()) as {
      id: string;
    };
    idA = me.id;
    idB = await makeUser("b");
    idStranger = await makeUser("s");
  });

  const put = (userId: string, enabled: boolean) =>
    SELF.fetch(`https://example.com/api/crew/${userId}/roster-push`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookieA },
      body: JSON.stringify({ enabled }),
    });
  const crew = async () =>
    (await (await SELF.fetch("https://example.com/api/crew", { headers: { Cookie: cookieA } })).json()) as CrewResponse;

  it("refuses someone who is not paired, as an unknown id", async () => {
    expect((await put(idStranger, true)).status).toBe(404);
    expect(await storedFingerprint(idA, idStranger)).toBeUndefined();
  });

  it("is off by default, turns on and off for a paired person, and re-baselines on enable", async () => {
    const inviteId = await pair(idA, idB);
    expect((await crew()).members.find((m) => m.userId === idB)?.notifyRosterChanges).toBe(false);

    expect((await put(idB, true)).status).toBe(200);
    expect((await crew()).members.find((m) => m.userId === idB)?.notifyRosterChanges).toBe(true);

    await db()
      .update(schema.rosterWatches)
      .set({ lastFingerprint: "stale" })
      .where(eq(schema.rosterWatches.watcherUserId, idA));
    await put(idB, true);
    expect(await storedFingerprint(idA, idB)).toBeNull();

    expect((await put(idB, false)).status).toBe(200);
    expect((await crew()).members.find((m) => m.userId === idB)?.notifyRosterChanges).toBe(false);

    await put(idB, true);
    const revoke = await SELF.fetch(`https://example.com/api/crew/invites/${inviteId}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieA },
    });
    expect(revoke.status).toBe(200);
    expect((await crew()).members.find((m) => m.userId === idB)).toBeUndefined();
    expect(await storedFingerprint(idA, idB)).toBeUndefined();
    expect((await put(idB, true)).status).toBe(404);
  });
});
