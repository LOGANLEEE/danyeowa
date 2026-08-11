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
  arrivalAlertStage?: number | null;
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
    arrivalAlertStage: opts.arrivalAlertStage ?? null,
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

  it("notifies once the flight is inside the first stage", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-1");
    // Lands in 45 minutes, so the 60-minute stage is due.
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 45 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBe(60);
  });

  it("stays quiet while the flight is further out than the first stage", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-2");
    // 90 minutes out: past nothing, since the earliest stage is 60.
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 90 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    // Asserted on THIS flight, never on the run's counters: the test database is shared across
    // the file, so every count includes other tests' rows.
    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBeNull();
  });

  it("does not repeat a stage it has already sent", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-3");
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 30 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const vapidEnv = await testVapidEnv();
    await runArrivalScan(vapidEnv, NOW_MS);
    const sendsAfterFirstScan = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await runArrivalScan(vapidEnv, NOW_MS);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(sendsAfterFirstScan);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBe(30);
  });

  it("skips a user who turned notifications off", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-4");
    await db().insert(schema.notificationPrefs).values({ userId, enabled: false, leadMinutes: 120 });
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 30 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBeNull();
  });

  it("still sends the landing ping just after touchdown", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-5");
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS - 10 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    // Asserted on THIS flight rather than on result.scanned: the test database is shared across
    // the file, so the candidate count includes other tests' rows.
    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBe(0);
  });

  it("fires all three stages as the flight closes in, once each", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-7");
    const arrivalMs = NOW_MS + 90 * 60_000;
    const flightId = await insertFlight({ userId, arrUtc: new Date(arrivalMs).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const vapidEnv = await testVapidEnv();
    const at = (minutesBefore: number) => runArrivalScan(vapidEnv, arrivalMs - minutesBefore * 60_000);

    const stage = async () => {
      const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
      return row?.arrivalAlertStage ?? null;
    };

    await at(90);
    expect(await stage()).toBeNull(); // before any stage
    await at(55);
    expect(await stage()).toBe(60);
    await at(45);
    expect(await stage()).toBe(60); // same stage, no repeat
    await at(25);
    expect(await stage()).toBe(30);
    await at(-2);
    expect(await stage()).toBe(0); // landed
    await at(-5);
    expect(await stage()).toBe(0); // nothing left to send
  });

  it("sends the stage that matches reality when a scan straddles two", async () => {
    // The cron runs every 15 minutes, so a flight can pass 60 and 30 between two scans. It must
    // not announce "lands in 60 min" when it is 25 minutes out.
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-8");
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 25 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBe(30);
  });

  it("skips arrival alerts alone when the user turns just those off", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-9");
    await db()
      .insert(schema.notificationPrefs)
      .values({ userId, enabled: true, leadMinutes: 120, arrivalEnabled: false });
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 30 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBeNull();
  });

  it("leaves the report stamp alone, so one flight can owe both alerts", async () => {
    const userId = await makeUser(`arr-${crypto.randomUUID()}@local.test`);
    await addSubscription(userId, "https://push.example/arr-6");
    const flightId = await insertFlight({ userId, arrUtc: new Date(NOW_MS + 30 * 60_000).toISOString() });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await runArrivalScan(await testVapidEnv(), NOW_MS);

    const [row] = await db().select().from(schema.flights).where(eq(schema.flights.id, flightId));
    expect(row?.arrivalAlertStage).toBe(30);
    expect(row?.reportNotifiedAt).toBeNull();
  });
});
