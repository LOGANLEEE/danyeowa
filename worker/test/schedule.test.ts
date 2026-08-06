import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";
import { seedSchedules } from "../src/db/seed-schedules";
import { signInAs } from "./helpers";

beforeEach(async () => {
  const db = drizzle(env.DB, { schema });
  await seedAirports(db);
  await seedSchedules(db);
});

describe("GET /api/schedule/lookup", () => {
  // All fetches in this describe block share one synthetic test IP, so sign in once
  // (same pattern as trips.test.ts) rather than per-test, to stay under the
  // 3-per-60s-per-IP OTP rate limit.
  let cookie: string;
  beforeAll(async () => {
    cookie = await signInAs("schedule-lookup@example.com");
  });

  it("401s when unauthenticated", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK412&date=2026-08-20",
    );
    expect(res.status).toBe(401);
  });

  it("returns all legs for a known multi-leg flight number, ordered by leg_seq, with tz resolved", async () => {
    // 2026-08-20 is a Thursday; EK412 is seeded as daily ("1234567") so it always matches.
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK412&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      legs: Array<{
        legSeq: number;
        origin: string;
        dest: string;
        depLocal: string;
        arrLocal: string;
        dayOffset: number;
        originTz: string;
        destTz: string;
        confirmCount: number;
      }>;
    }>();
    expect(body.legs).toHaveLength(2);
    expect(body.legs[0]).toMatchObject({
      legSeq: 0,
      origin: "DXB",
      dest: "SYD",
      depLocal: "10:15",
      arrLocal: "06:00",
      dayOffset: 1,
      originTz: "Asia/Dubai",
      destTz: "Australia/Sydney",
      confirmCount: 0,
    });
    expect(body.legs[1]).toMatchObject({
      legSeq: 1,
      origin: "SYD",
      dest: "CHC",
    });
  });

  it("is case-insensitive on flight_no", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=ek412&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
  });

  it("404s with unknown_flight for a flight number with no schedule row", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=XX999&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("unknown_flight");
  });

  it("404s with not_scheduled_that_day when the date's weekday (origin tz) isn't in days_of_week", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.flightSchedules).values({
      flightNo: "EK777",
      legSeq: 0,
      origin: "DXB",
      dest: "LHR",
      depLocal: "09:00",
      arrLocal: "13:00",
      dayOffset: 0,
      // Only operates Mon (1) - excludes Thursday (4), 2026-08-20's ISO weekday.
      daysOfWeek: "1",
    });

    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK777&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not_scheduled_that_day");
  });

  it("respects the validity window (valid_from/valid_to)", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.flightSchedules).values({
      flightNo: "EK888",
      legSeq: 0,
      origin: "DXB",
      dest: "LHR",
      depLocal: "09:00",
      arrLocal: "13:00",
      dayOffset: 0,
      daysOfWeek: "1234567",
      validFrom: "2026-09-01",
      validTo: "2026-09-30",
    });

    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK888&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(404);
  });

  it("400s on a malformed flight_no", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=1234&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/schedule/confirm", () => {
  const confirmBody = {
    flightNo: "EK412",
    legSeq: 0,
    origin: "DXB",
    dest: "SYD",
    depLocal: "10:20",
    arrLocal: "06:05",
    dayOffset: 1,
  };

  let cookie: string;
  beforeAll(async () => {
    cookie = await signInAs("schedule-confirm@example.com");
  });

  it("401s when unauthenticated", async () => {
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmBody),
    });
    expect(res.status).toBe(401);
  });

  it("increments confirm_count and updates times for an existing row (update branch)", async () => {
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(confirmBody),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT confirm_count, dep_local, arr_local, last_confirmed_at FROM flight_schedules WHERE flight_no = 'EK412' AND leg_seq = 0",
    ).first<{
      confirm_count: number;
      dep_local: string;
      arr_local: string;
      last_confirmed_at: number | null;
    }>();
    expect(row?.confirm_count).toBe(1);
    expect(row?.dep_local).toBe("10:20");
    expect(row?.arr_local).toBe("06:05");
    expect(row?.last_confirmed_at).not.toBeNull();
  });

  it("inserts a new row with confirm_count=1 for an unknown flight/leg (insert branch)", async () => {
    const newLeg = {
      flightNo: "EK999",
      legSeq: 0,
      origin: "DXB",
      dest: "JFK",
      depLocal: "08:00",
      arrLocal: "14:00",
      dayOffset: 0,
    };
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(newLeg),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT confirm_count, days_of_week FROM flight_schedules WHERE flight_no = 'EK999' AND leg_seq = 0",
    ).first<{ confirm_count: number; days_of_week: string }>();
    expect(row?.confirm_count).toBe(1);
    // A crowd-inserted row with no prior schedule data defaults to "always match".
    expect(row?.days_of_week).toBe("1234567");
  });

  it("case-insensitive flight_no normalization on confirm", async () => {
    // EK384 is a distinct seeded flight from the update-branch test above (which
    // mutates EK412's confirm_count in this same describe block), so this stays
    // independent of test execution order / storage isolation semantics.
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...confirmBody, flightNo: "ek384", origin: "dxb", dest: "bkk" }),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT confirm_count FROM flight_schedules WHERE flight_no = 'EK384' AND leg_seq = 0",
    ).first<{ confirm_count: number }>();
    expect(row?.confirm_count).toBe(1);
  });

  it("400s on an invalid body", async () => {
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ flightNo: "EK412" }),
    });
    expect(res.status).toBe(400);
  });
});
