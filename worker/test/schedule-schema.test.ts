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

  it("seeds only the live-verified rows, each marked source='seed-verified'", async () => {
    // Plan 10 T2 purged flight_schedules from a seed table (152 rows, mostly guessed via
    // EK's numbering convention - one of which, EK372, was confirmed actively WRONG) down
    // to a cache warmed by live provider fetches. scripts/ek-schedules.json now carries only
    // the ~17 rows independently verified against a live source (see
    // .superpowers/sdd/2026-08-09-plan10-live-schedules/task-2-report.md) - "seed at least
    // 80 rows" no longer reflects the design and would mask a regression back toward
    // reintroducing guessed data.
    const db = drizzle(env.DB, { schema });
    await seedSchedules(db);

    // Scoped to source='seed-verified' rather than a bare table count, since an earlier
    // test in this file (composite PK test) inserts its own EK999 rows with no source set
    // - this file has no per-test D1 reset, so those rows are still present here.
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM flight_schedules WHERE source = 'seed-verified'"
    ).first<{ count: number }>();
    expect(countResult?.count).toBe(17);

    // Every row seedSchedules() wrote (i.e. everything the ek-schedules.json flight
    // numbers cover) must be marked seed-verified - none left null/other, and no
    // previously-purged flight number (e.g. EK108, approximated-only) got reintroduced.
    const flightNos = new Set(
      (
        await env.DB.prepare("SELECT DISTINCT flight_no FROM flight_schedules WHERE source = 'seed-verified'").all<{
          flight_no: string;
        }>()
      ).results.map((r) => r.flight_no),
    );
    expect(flightNos).toEqual(
      new Set([
        "EK001", "EK002", "EK073", "EK203", "EK318",
        "EK384", "EK385", "EK404", "EK412", "EK413",
        "EK448", "EK449", "EK500",
      ]),
    );
  });
});
