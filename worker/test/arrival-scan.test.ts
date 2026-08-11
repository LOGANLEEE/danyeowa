import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";
import { runArrivalScan } from "../src/report-scan";
import { __testing } from "../src/webpush";

/**
 * Arrival alerts — the "her flight lands in an hour" notification, for whoever is meeting a
 * flight rather than working it. Report alerts are covered separately in report-scan.test.ts;
 * what matters here is that the two are independent, since one flight can owe both.
 */
const NOW_MS = Date.parse("2026-09-01T00:00:00.000Z");

function db() {
  return drizzle(env.DB, { schema });
}

async function makeUser(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db().insert(schema.user).values({ id, name: email, email });
  return id;
}

async function insertFlight(opts: {
  userId: string;
  arrUtc: string;
  arrivalNotifiedAt?: number | null;
  reportUtc?: string;
  dest?: string;
}): Promise<string> {
  const database = db();
  const tripId = crypto.randomUUID();
  await database.insert(schema.trips).values({ id: tripId, userId: opts.userId, label: "meeting her" });
  const flightId = crypto.randomUUID();
  await database.insert(schema.flights).values({
    id: flightId,
    tripId,
    userId: opts.userId,
    flightNo: "EK373",
    origin: "BKK",
    dest: opts.dest ?? "DXB",
    depUtc: "2026-08-31T14:35:00.000Z",
    arrUtc: opts.arrUtc,
    // Far in the past, so the report scan can never be what fires in these tests.
    reportUtc: opts.reportUtc ?? "2026-08-31T12:00:00.000Z",
    depTz: "Asia/Bangkok",
    arrTz: "Asia/Dubai",
    arrivalNotifiedAt: opts.arrivalNotifiedAt ?? null,
  });
  return flightId;
}

async function testVapidEnv() {
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

async function addSubscription(userId: string, endpoint: string) {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  await db().insert(schema.pushSubscriptions).values({
    userId,
    endpoint,
    p256dh: __testing.base64urlEncode(publicKeyRaw),
    auth: __testing.base64urlEncode(authSecret),
  });
}

describe("runArrivalScan", () => {
  beforeEach(async () => {
    await seedAirports(db());
    vi.restoreAllMocks();
  });

  it("notifies when the flight lands inside the user's lead window", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-1");
    // Lands in 45 minutes; default lead is 120.
    await insertFlight({ userId, arrUtc: new Date(NOW_MS + 45 * 60_000).toISOString() });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const result = await runArrivalScan(await testVapidEnv(), NOW_MS);

    expect(result.notified).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while the flight is still further out than the lead", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-2");
    await db()
      .insert(schema.notificationPrefs)
      .values({ userId, enabled: true, leadMinutes: 60 });
    await insertFlight({ userId, arrUtc: new Date(NOW_MS + 180 * 60_000).toISOString() });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const result = await runArrivalScan(await testVapidEnv(), NOW_MS);

    expect(result.notified).toBe(0);
    expect(result.skippedOutsideLead).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not send twice for the same flight", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-3");
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 30 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const vapidEnv = await testVapidEnv();
    expect((await runArrivalScan(vapidEnv, NOW_MS)).notified).toBe(1);
    expect((await runArrivalScan(vapidEnv, NOW_MS)).notified).toBe(0);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalNotifiedAt).toBe(NOW_MS);
  });

  it("skips a user who turned notifications off", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-4");
    await db().insert(schema.notificationPrefs).values({ userId, enabled: false, leadMinutes: 120 });
    await insertFlight({ userId, arrUtc: new Date(NOW_MS + 30 * 60_000).toISOString() });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    expect((await runArrivalScan(await testVapidEnv(), NOW_MS)).notified).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores a flight that has already landed", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-5");
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS - 10 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    // Asserted on THIS flight rather than on result.scanned: the test database is shared across
    // the file, so the candidate count includes other tests' rows.
    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalNotifiedAt).toBeNull();
  });

  it("leaves the report stamp alone, so one flight can owe both alerts", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-6");
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 30 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalNotifiedAt).toBe(NOW_MS);
    expect(row?.reportNotifiedAt).toBeNull();
  });
});
