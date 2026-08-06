import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import { seedSchedules } from "../src/db/seed-schedules";

describe("flight_schedules schema", () => {
  it("has a flight_schedules table", async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    expect(names).toContain("flight_schedules");
  });

  it("enforces a composite primary key on (flight_no, leg_seq)", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.flightSchedules).values({
      flightNo: "EK999",
      legSeq: 0,
      origin: "DXB",
      dest: "ZZZ",
      depLocal: "10:00",
      arrLocal: "12:00",
      dayOffset: 0,
      daysOfWeek: "1234567",
    });

    // Same (flight_no, leg_seq) pair must conflict — proves composite PK, not a
    // single-column PK on flight_no alone (which would also reject a second
    // leg_seq for the same flight).
    await expect(
      db.insert(schema.flightSchedules).values({
        flightNo: "EK999",
        legSeq: 0,
        origin: "DXB",
        dest: "YYY",
        depLocal: "11:00",
        arrLocal: "13:00",
        dayOffset: 0,
        daysOfWeek: "1234567",
      })
    ).rejects.toThrow();

    // A different leg_seq for the same flight_no must be allowed.
    await db.insert(schema.flightSchedules).values({
      flightNo: "EK999",
      legSeq: 1,
      origin: "ZZZ",
      dest: "YYY",
      depLocal: "13:30",
      arrLocal: "15:30",
      dayOffset: 0,
      daysOfWeek: "1234567",
    });

    const rows = await env.DB.prepare(
      "SELECT leg_seq FROM flight_schedules WHERE flight_no = 'EK999' ORDER BY leg_seq"
    ).all<{ leg_seq: number }>();
    expect(rows.results.map((r) => r.leg_seq)).toEqual([0, 1]);
  });

  it("seeds EK412 DXB -> SYD", async () => {
    const db = drizzle(env.DB, { schema });
    await seedSchedules(db);

    const result = await env.DB.prepare(
      "SELECT origin, dest FROM flight_schedules WHERE flight_no = 'EK412'"
    ).first<{ origin: string; dest: string }>();

    expect(result?.origin).toBe("DXB");
    expect(result?.dest).toBe("SYD");
  });

  it("seeds at least 80 rows", async () => {
    const db = drizzle(env.DB, { schema });
    await seedSchedules(db);

    const result = await env.DB.prepare("SELECT COUNT(*) as count FROM flight_schedules").first<{
      count: number;
    }>();
    expect(result?.count).toBeGreaterThanOrEqual(80);
  });
});
