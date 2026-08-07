import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import {
  ScheduleConfirmSchema,
  ScheduleSuggestQuerySchema,
  isoWeekday,
  addDaysIso,
  wallToUtc,
} from "@roaster/shared";
import type { ScheduleLookupResponse, ScheduleLeg, ScheduleSuggestion } from "@roaster/shared";
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

/**
 * Splits a flight number into its alpha prefix and numeric part, preserving the
 * numeric part's original zero-padded width (e.g. "EK097" -> { prefix: "EK", num: 97,
 * width: 3 }) so a sibling comparison can reconstruct the same padding EK convention
 * uses (EK412 <-> EK413, not EK412 <-> EK413 vs "EK413" as separate widths).
 */
function splitFlightNo(flightNo: string): { prefix: string; num: number; width: number } | null {
  const match = /^([A-Z]{2})(\d{1,4})$/i.exec(flightNo);
  if (!match) return null;
  return { prefix: match[1]!.toUpperCase(), num: Number(match[2]), width: match[2]!.length };
}

/** True when `candidate`'s flight number is `outbound`'s numeric part +/-1, same alpha prefix. */
function isSibling(outbound: string, candidate: string): boolean {
  const a = splitFlightNo(outbound);
  const b = splitFlightNo(candidate);
  if (!a || !b) return false;
  return a.prefix === b.prefix && Math.abs(a.num - b.num) === 1;
}

const MAX_RAW_SUGGESTIONS = 8;
const OPERATING_DAY_SEARCH_WINDOW = 7;

scheduleRouter.get("/schedule/suggest", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const query = {
    origin: c.req.query("origin"),
    date: c.req.query("date"),
    outbound: c.req.query("outbound") ?? undefined,
    arrivedIso: c.req.query("arrivedIso"),
    home: c.req.query("home") ?? undefined,
  };
  const parsed = ScheduleSuggestQuerySchema.safeParse(query);
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
  const { origin, date, outbound, arrivedIso, home } = parsed.data;
  const originUpper = origin.toUpperCase();
  const homeUpper = home.toUpperCase();
  const outboundUpper = outbound?.toUpperCase();

  const database = db(c.env);

  // All schedule rows whose leg_seq 0 departs `origin` - candidates are grouped by
  // flight_no below, then filtered to those whose FINAL leg lands at `home`.
  const originRows = await database
    .select()
    .from(schema.flightSchedules)
    .where(eq(schema.flightSchedules.origin, originUpper))
    .orderBy(asc(schema.flightSchedules.legSeq));

  const leg0FlightNos = [...new Set(originRows.filter((r) => r.legSeq === 0).map((r) => r.flightNo))];
  if (leg0FlightNos.length === 0) {
    return c.json({ suggestions: [] });
  }

  const allLegRows = await database
    .select()
    .from(schema.flightSchedules)
    .where(inArray(schema.flightSchedules.flightNo, leg0FlightNos))
    .orderBy(asc(schema.flightSchedules.legSeq));

  const legsByFlightNo = new Map<string, (typeof allLegRows)[number][]>();
  for (const row of allLegRows) {
    const list = legsByFlightNo.get(row.flightNo) ?? [];
    list.push(row);
    legsByFlightNo.set(row.flightNo, list);
  }

  // Keep only candidates whose leg 0 actually departs `origin` (guards against a
  // flight_no collision where a later leg happens to depart origin but leg 0 doesn't)
  // and whose FINAL leg lands at `home`.
  const candidates = [...legsByFlightNo.entries()].filter(([, legs]) => {
    const sorted = [...legs].sort((a, b) => a.legSeq - b.legSeq);
    const leg0 = sorted[0]!;
    const finalLeg = sorted[sorted.length - 1]!;
    return leg0.origin === originUpper && finalLeg.dest === homeUpper;
  });

  if (candidates.length === 0) {
    return c.json({ suggestions: [] });
  }

  // Resolve airport tz for every origin/dest referenced by any candidate leg.
  const iatas = [...new Set(candidates.flatMap(([, legs]) => legs.flatMap((l) => [l.origin, l.dest])))];
  const airportRows = await database
    .select()
    .from(schema.airports)
    .where(inArray(schema.airports.iata, iatas));
  const airportByIata = new Map(airportRows.map((a) => [a.iata, a]));

  const arrivedMs = Date.parse(arrivedIso);

  const suggestions: ScheduleSuggestion[] = [];

  for (const [flightNo, rawLegs] of candidates) {
    const sorted = [...rawLegs].sort((a, b) => a.legSeq - b.legSeq);
    const leg0 = sorted[0]!;

    // Find the first operating date >= `date` (search up to 7 days forward) whose
    // weekday matches leg0's days_of_week and falls within its validity window.
    let operatingDate: string | null = null;
    for (let offset = 0; offset <= OPERATING_DAY_SEARCH_WINDOW; offset++) {
      const candidateDate = addDaysIso(date, offset);
      const weekday = isoWeekday(candidateDate);
      const matchesDay = leg0.daysOfWeek.includes(String(weekday));
      const matchesValidity =
        (leg0.validFrom === null || candidateDate >= leg0.validFrom) &&
        (leg0.validTo === null || candidateDate <= leg0.validTo);
      if (matchesDay && matchesValidity) {
        operatingDate = candidateDate;
        break;
      }
    }
    if (operatingDate === null) continue;

    const originTz = airportByIata.get(leg0.origin)?.tz;
    if (!originTz) continue; // reference data gap - skip rather than 500 a suggestion list.

    const depUtc = wallToUtc(`${operatingDate}T${leg0.depLocal}:00`, originTz);
    const hours = (Date.parse(depUtc) - arrivedMs) / (60 * 60 * 1000);
    if (hours < 0) continue; // dep before arrival - not a viable connection for this date.

    const legs: ScheduleLeg[] = sorted.map((leg) => ({
      legSeq: leg.legSeq,
      origin: leg.origin,
      dest: leg.dest,
      depLocal: leg.depLocal,
      arrLocal: leg.arrLocal,
      dayOffset: leg.dayOffset,
      originTz: airportByIata.get(leg.origin)?.tz ?? "",
      destTz: airportByIata.get(leg.dest)?.tz ?? "",
      confirmCount: leg.confirmCount,
    }));

    suggestions.push({
      flightNo,
      legs,
      layoverHours: hours,
      sibling: outboundUpper ? isSibling(outboundUpper, flightNo) : false,
    });
  }

  // Sibling(s) pinned first, then ascending layover.
  suggestions.sort((a, b) => {
    if (a.sibling !== b.sibling) return a.sibling ? -1 : 1;
    return a.layoverHours - b.layoverHours;
  });

  return c.json({ suggestions: suggestions.slice(0, MAX_RAW_SUGGESTIONS) });
});
