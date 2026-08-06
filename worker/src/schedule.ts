import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { ScheduleConfirmSchema, isoWeekday } from "@roaster/shared";
import type { ScheduleLookupResponse } from "@roaster/shared";
import * as schema from "./db/schema";
import type { Env } from "./index";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const scheduleRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

const flightNoQuerySchema = /^[A-Z]{2}\d{1,4}$/i;

scheduleRouter.get("/schedule/lookup", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const flightNoRaw = c.req.query("flight_no");
  const date = c.req.query("date");
  if (!flightNoRaw || !date || !flightNoQuerySchema.test(flightNoRaw)) {
    return c.json({ error: "flight_no and date are required; flight_no must match [A-Z]{2}\\d{1,4}" }, 400);
  }
  const flightNo = flightNoRaw.toUpperCase();

  const database = db(c.env);

  const legRows = await database
    .select()
    .from(schema.flightSchedules)
    .where(eq(schema.flightSchedules.flightNo, flightNo))
    .orderBy(asc(schema.flightSchedules.legSeq));

  if (legRows.length === 0) {
    return c.json({ error: "unknown_flight" }, 404);
  }

  // Resolve every leg's origin/dest tz from the airports table up front. Seed data
  // guarantees airport coverage for every flight_schedules row, so a missing airport
  // here means the reference data is broken — fail loud with a 500 rather than
  // silently dropping legs.
  const iatas = [...new Set(legRows.flatMap((leg) => [leg.origin, leg.dest]))];
  const airportRows = await database
    .select()
    .from(schema.airports)
    .where(inArray(schema.airports.iata, iatas));
  const airportByIata = new Map(airportRows.map((a) => [a.iata, a]));

  for (const leg of legRows) {
    for (const code of [leg.origin, leg.dest]) {
      if (!airportByIata.has(code)) {
        return c.json(
          { error: `schedule reference data error: unknown airport ${code} for flight ${flightNo}` },
          500,
        );
      }
    }
  }

  // Weekday filter applies to leg 0's origin day only (days_of_week refers to the
  // local departure day at the flight's origin); continuation legs ride along once
  // leg 0 matches.
  const leg0 = legRows[0]!;
  const weekday = isoWeekday(date);
  const leg0MatchesDay = leg0.daysOfWeek.includes(String(weekday));
  const leg0MatchesValidity =
    (leg0.validFrom === null || date >= leg0.validFrom) &&
    (leg0.validTo === null || date <= leg0.validTo);

  if (!leg0MatchesDay || !leg0MatchesValidity) {
    return c.json({ error: "not_scheduled_that_day" }, 404);
  }

  const body: ScheduleLookupResponse = {
    legs: legRows.map((leg) => ({
      legSeq: leg.legSeq,
      origin: leg.origin,
      dest: leg.dest,
      depLocal: leg.depLocal,
      arrLocal: leg.arrLocal,
      dayOffset: leg.dayOffset,
      originTz: airportByIata.get(leg.origin)!.tz,
      destTz: airportByIata.get(leg.dest)!.tz,
      confirmCount: leg.confirmCount,
    })),
  };

  return c.json(body);
});

scheduleRouter.post("/schedule/confirm", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = ScheduleConfirmSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
  const input = parsed.data;

  const flightNo = input.flightNo.toUpperCase();
  const origin = input.origin.toUpperCase();
  const dest = input.dest.toUpperCase();
  const now = Date.now();

  const database = db(c.env);

  await database
    .insert(schema.flightSchedules)
    .values({
      flightNo,
      legSeq: input.legSeq,
      origin,
      dest,
      depLocal: input.depLocal,
      arrLocal: input.arrLocal,
      dayOffset: input.dayOffset,
      // A crowd-inserted row (no prior schedule entry) has no known operating-day
      // pattern yet, so it defaults to "always match" until a seed/future confirm
      // narrows it.
      daysOfWeek: "1234567",
      confirmCount: 1,
      lastConfirmedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.flightSchedules.flightNo, schema.flightSchedules.legSeq],
      set: {
        origin,
        dest,
        depLocal: input.depLocal,
        arrLocal: input.arrLocal,
        dayOffset: input.dayOffset,
        confirmCount: sql`${schema.flightSchedules.confirmCount} + 1`,
        lastConfirmedAt: now,
      },
    });

  return c.json({ ok: true }, 200);
});
