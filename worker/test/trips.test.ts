import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Flight, Trip } from "@danyeowa/shared";
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";
import { signInAs } from "./helpers";

type TripWithFlights = Trip & { flights: Flight[] };

beforeEach(async () => {
  const db = drizzle(env.DB, { schema });
  await seedAirports(db);
});

const akl2LegTrip = {
  label: "AKL swing",
  legs: [
    {
      flightNo: "EK448",
      origin: "DXB",
      dest: "AKL",
      depUtc: "2026-09-01T02:00:00.000Z",
      arrUtc: "2026-09-02T06:00:00.000Z",
      // reportUtc intentionally omitted -> should be backfilled via reportDefault()
    },
    {
      flightNo: "EK449",
      origin: "AKL",
      dest: "DXB",
      depUtc: "2026-09-05T14:00:00.000Z",
      arrUtc: "2026-09-06T02:00:00.000Z",
      reportUtc: "2026-09-05T12:00:00.000Z",
    },
  ],
};

async function createTrip(cookie: string, body: unknown = akl2LegTrip) {
  const res = await SELF.fetch("https://example.com/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return res;
}

describe("trips API", () => {
  it("401s on all four endpoints when unauthenticated", async () => {
    const getRes = await SELF.fetch("https://example.com/api/trips");
    expect(getRes.status).toBe(401);

    const postRes = await SELF.fetch("https://example.com/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(akl2LegTrip),
    });
    expect(postRes.status).toBe(401);

    const deleteRes = await SELF.fetch("https://example.com/api/trips/does-not-exist", {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(401);
  });

  it("GET /api/airports/:iata returns a seeded airport, 404s for unknown", async () => {
    const okRes = await SELF.fetch("https://example.com/api/airports/DXB");
    expect(okRes.status).toBe(200);
    const airport = (await okRes.json()) as { iata: string; tz: string };
    expect(airport.tz).toBe("Asia/Dubai");

    const notFoundRes = await SELF.fetch("https://example.com/api/airports/ZZZ");
    expect(notFoundRes.status).toBe(404);
  });

  // Grouped under a single signed-in session: better-auth's OTP send route is
  // rate-limited per IP (window: 60s, max: 3 in src/auth.ts), and the test runner's
  // fetches all share one synthetic IP — so we sign in once per describe block
  // (owner + intruder) rather than once per test.
  describe("as an authenticated owner", () => {
    let cookie: string;

    beforeAll(async () => {
      cookie = await signInAs("crew1@example.com");
    });

    it("creates a 2-leg trip, backfills report_utc, resolves tz, and GET returns it", async () => {
      const postRes = await createTrip(cookie);
      expect(postRes.status).toBe(201);
      const created = (await postRes.json()) as TripWithFlights;
      expect(created.label).toBe("AKL swing");
      expect(created.flights).toHaveLength(2);

      const leg1 = created.flights.find((f) => f.flightNo === "EK448");
      expect(leg1?.depTz).toBe("Asia/Dubai");
      expect(leg1?.arrTz).toBe("Pacific/Auckland");
      expect(leg1?.reportUtc).toBe("2026-09-01T00:30:00.000Z");

      const leg2 = created.flights.find((f) => f.flightNo === "EK449");
      expect(leg2?.reportUtc).toBe("2026-09-05T12:00:00.000Z");

      const getRes = await SELF.fetch("https://example.com/api/trips", {
        headers: { Cookie: cookie },
      });
      expect(getRes.status).toBe(200);
      const body = (await getRes.json()) as { trips: TripWithFlights[] };
      const trip = body.trips.find((t) => t.id === created.id);
      expect(trip).toBeDefined();
      expect(trip?.flights.map((f) => f.flightNo)).toEqual(["EK448", "EK449"]);
    });

    it("400s with the unknown airport named when IATA is not seeded", async () => {
      const res = await createTrip(cookie, {
        legs: [
          {
            flightNo: "EK001",
            origin: "ZZZ",
            dest: "DXB",
            depUtc: "2026-09-01T02:00:00.000Z",
            arrUtc: "2026-09-01T06:00:00.000Z",
          },
        ],
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("ZZZ");
    });

    it("deletes a trip and cascades to its flights (204)", async () => {
      const postRes = await createTrip(cookie);
      const created = (await postRes.json()) as TripWithFlights;

      const deleteRes = await SELF.fetch(`https://example.com/api/trips/${created.id}`, {
        method: "DELETE",
        headers: { Cookie: cookie },
      });
      expect(deleteRes.status).toBe(204);

      const getRes = await SELF.fetch("https://example.com/api/trips", {
        headers: { Cookie: cookie },
      });
      const body = (await getRes.json()) as { trips: TripWithFlights[] };
      expect(body.trips.find((t) => t.id === created.id)).toBeUndefined();

      const remainingFlights = await env.DB.prepare("SELECT id FROM flights WHERE trip_id = ?")
        .bind(created.id)
        .all();
      expect(remainingFlights.results.length).toBe(0);
    });
  });

  describe("cross-user ownership", () => {
    let ownerCookie: string;
    let intruderCookie: string;

    beforeAll(async () => {
      ownerCookie = await signInAs("owner@example.com");
      intruderCookie = await signInAs("intruder@example.com");
    });

    it("404s when DELETEing another user's trip (no existence leak)", async () => {
      const postRes = await createTrip(ownerCookie);
      const created = (await postRes.json()) as TripWithFlights;

      const deleteRes = await SELF.fetch(`https://example.com/api/trips/${created.id}`, {
        method: "DELETE",
        headers: { Cookie: intruderCookie },
      });
      expect(deleteRes.status).toBe(404);
    });
  });
});
