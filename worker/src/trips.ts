import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { TripInputSchema, reportDefault } from "@danyeowa/shared";
import * as schema from "./db/schema";
import type { Env } from "./index";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const tripsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

type OwnableTable = typeof schema.trips | typeof schema.flights;

/**
 * Fetches a row by id, scoped to the owning user, returning null both when the row
 * doesn't exist and when it exists but belongs to someone else — callers must respond
 * 404 in both cases so ownership never leaks via a 403/404 status difference.
 */
async function requireOwn<T extends OwnableTable>(
  database: ReturnType<typeof db>,
  table: T,
  id: string,
  userId: string,
): Promise<T["$inferSelect"] | null> {
  const rows = await database
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .limit(1);
  return (rows[0] as T["$inferSelect"] | undefined) ?? null;
}

/**
 * One user's trips with their flights attached, filtered to a dep_utc window and ordered by the
 * earliest leg. Exported because the crew read route must return the identical shape to
 * /api/trips — the calendar renders both through the same components, and a second assembly
 * would drift from this one the first time either changed.
 *
 * The user id is a parameter, so callers are responsible for having earned it: /api/trips takes
 * it from the session; the crew route takes it only after proving an active pairing.
 */
export async function loadTripsWithFlights(
  database: ReturnType<typeof db>,
  userId: string,
  from?: string,
  to?: string,
) {
  const trips = await database
    .select()
    .from(schema.trips)
    .where(eq(schema.trips.userId, userId));

  const tripIds = trips.map((t) => t.id);
  const flightConditions = [
    tripIds.length > 0 ? inArray(schema.flights.tripId, tripIds) : eq(schema.flights.tripId, ""),
  ];
  if (from) flightConditions.push(gte(schema.flights.depUtc, from));
  if (to) flightConditions.push(lte(schema.flights.depUtc, to));

  const flights =
    tripIds.length > 0
      ? await database
          .select()
          .from(schema.flights)
          .where(and(...flightConditions))
          .orderBy(asc(schema.flights.legSeq))
      : [];

  const flightsByTrip = new Map<string, (typeof flights)[number][]>();
  for (const flight of flights) {
    const list = flightsByTrip.get(flight.tripId) ?? [];
    list.push(flight);
    flightsByTrip.set(flight.tripId, list);
  }

  // Only trips that still have a matching flight (post from/to filter) are returned,
  // ordered by their earliest flight's dep_utc ascending.
  const tripsWithFlights = trips
    .map((trip) => ({ ...trip, flights: flightsByTrip.get(trip.id) ?? [] }))
    .filter((trip) => trip.flights.length > 0 || (!from && !to));

  tripsWithFlights.sort((a, b) => {
    const aDep = a.flights[0]?.depUtc ?? "";
    const bDep = b.flights[0]?.depUtc ?? "";
    return aDep.localeCompare(bDep);
  });

  return tripsWithFlights;
}

tripsRouter.get("/trips", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const trips = await loadTripsWithFlights(db(c.env), user.id, c.req.query("from"), c.req.query("to"));
  return c.json({ trips });
});

tripsRouter.post("/trips", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = TripInputSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
  const input = parsed.data;

  const database = db(c.env);

  // Resolve dep/arr tz for every leg from the airports table by IATA up front, so a
  // single unknown airport 400s before any writes happen.
  const iatas = [...new Set(input.legs.flatMap((leg) => [leg.origin, leg.dest]))].map((code) =>
    code.toUpperCase(),
  );
  const airportRows = await database
    .select()
    .from(schema.airports)
    .where(inArray(schema.airports.iata, iatas));
  const airportByIata = new Map(airportRows.map((a) => [a.iata, a]));

  for (const leg of input.legs) {
    for (const code of [leg.origin.toUpperCase(), leg.dest.toUpperCase()]) {
      if (!airportByIata.has(code)) {
        return c.json({ error: `unknown airport: ${code}` }, 400);
      }
    }
  }

  const tripId = crypto.randomUUID();
  const tripRow = { id: tripId, userId: user.id, label: input.label ?? null };

  const flightRows = input.legs.map((leg, index) => {
    const origin = leg.origin.toUpperCase();
    const dest = leg.dest.toUpperCase();
    return {
      id: crypto.randomUUID(),
      tripId,
      userId: user.id,
      flightNo: leg.flightNo.toUpperCase(),
      origin,
      dest,
      depUtc: leg.depUtc,
      arrUtc: leg.arrUtc,
      // report_utc defaults to dep_utc - 90min (reportDefault) when the client
      // doesn't explicitly supply one; always editable afterwards via PATCH.
      reportUtc: leg.reportUtc ?? reportDefault(leg.depUtc),
      depTz: airportByIata.get(origin)!.tz,
      arrTz: airportByIata.get(dest)!.tz,
      legSeq: index,
    };
  });

  // D1 has no cross-statement transactions; batch() applies all statements
  // atomically so a trip can never be left stranded without its flights.
  const tripInsert = database.insert(schema.trips).values(tripRow);
  const flightInserts = flightRows.map((row) => database.insert(schema.flights).values(row));
  await database.batch([tripInsert, ...flightInserts]);

  return c.json({ ...tripRow, createdAt: Date.now(), flights: flightRows }, 201);
});

tripsRouter.delete("/trips/:id", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);
  const trip = await requireOwn(database, schema.trips, c.req.param("id"), user.id);
  if (!trip) return c.json({ error: "not found" }, 404);

  // flights cascade-delete via the FK's onDelete: "cascade".
  await database.delete(schema.trips).where(eq(schema.trips.id, c.req.param("id")));

  return c.body(null, 204);
});

tripsRouter.get("/airports/:iata", async (c) => {
  const database = db(c.env);
  const iata = c.req.param("iata").toUpperCase();
  const row = await database
    .select()
    .from(schema.airports)
    .where(eq(schema.airports.iata, iata))
    .limit(1);
  if (!row[0]) return c.json({ error: "not found" }, 404);
  return c.json(row[0], 200);
});
