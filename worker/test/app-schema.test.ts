import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";

describe("app schema", () => {
  it("has trips, flights, airports tables", async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    for (const t of ["trips", "flights", "airports"]) {
      expect(names).toContain(t);
    }
  });

  it("generates a UUID-shaped id when none is provided", async () => {
    const db = drizzle(env.DB, { schema });
    const userId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, 'Test', ?, 0)"
    )
      .bind(userId, `${userId}@example.com`)
      .run();

    const [inserted] = await db
      .insert(schema.trips)
      .values({ userId, label: "No explicit id" })
      .returning();

    expect(inserted?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("cascades delete from trips to flights", async () => {
    const db = drizzle(env.DB, { schema });
    const userId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO user (id, name, email, email_verified) VALUES (?, 'Test', ?, 0)"
    )
      .bind(userId, `${userId}@example.com`)
      .run();

    const tripId = crypto.randomUUID();
    await db.insert(schema.trips).values({ id: tripId, userId, label: "Test trip" });

    const flightId = crypto.randomUUID();
    await db.insert(schema.flights).values({
      id: flightId,
      tripId,
      userId,
      flightNo: "EK001",
      origin: "DXB",
      dest: "LHR",
      depUtc: "2026-03-01T02:00:00.000Z",
      arrUtc: "2026-03-01T06:00:00.000Z",
      reportUtc: "2026-03-01T00:30:00.000Z",
      depTz: "Asia/Dubai",
      arrTz: "Europe/London",
    });

    const before = await env.DB.prepare("SELECT id FROM flights WHERE id = ?")
      .bind(flightId)
      .all();
    expect(before.results.length).toBe(1);

    await db.delete(schema.trips).where(eq(schema.trips.id, tripId));

    const after = await env.DB.prepare("SELECT id FROM flights WHERE id = ?")
      .bind(flightId)
      .all();
    expect(after.results.length).toBe(0);
  });

  it("seeds airports with correct DXB timezone", async () => {
    const db = drizzle(env.DB, { schema });
    await seedAirports(db);

    const result = await env.DB.prepare("SELECT tz FROM airports WHERE iata = 'DXB'").first<{
      tz: string;
    }>();
    expect(result?.tz).toBe("Asia/Dubai");
  });
});
