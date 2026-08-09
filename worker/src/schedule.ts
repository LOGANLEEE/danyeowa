import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import {
  ScheduleConfirmSchema,
  ScheduleSuggestQuerySchema,
  isoWeekday,
  addDaysIso,
  wallToUtc,
} from "@roaster/shared";
import type { ScheduleLookupResponse, ScheduleLeg, ScheduleSuggestion, ProviderLeg } from "@roaster/shared";
import * as schema from "./db/schema";
import type { Env } from "./index";
import { resolveFromProviders } from "./schedule-providers";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const scheduleRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

const flightNoQuerySchema = /^[A-Z]{2}\d{1,4}$/i;

/** A row older than this with no crowd confirmation is treated as stale — served
 * immediately, but refreshed in the background on the next hit (plan §Global Constraints). */
const STALE_MS = 90 * 24 * 60 * 60 * 1000;

/** How long a `schedule_lookup_misses` entry shadows the provider chain for its flight
 * number. Keeps a junk/typo'd code (e.g. repeated attempts while typing) from paying a
 * fresh scrape/API round-trip on every request, while letting a flight that's genuinely
 * added to a provider's data later stop being shadowed after a day. */
const MISS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** True when `flightNo` was recorded as a provider miss within the last `MISS_CACHE_TTL_MS`. */
async function isRecentlyMissed(
  database: DrizzleD1Database<typeof schema>,
  flightNo: string,
): Promise<boolean> {
  const [row] = await database
    .select({ missedAt: schema.scheduleLookupMisses.missedAt })
    .from(schema.scheduleLookupMisses)
    .where(eq(schema.scheduleLookupMisses.flightNo, flightNo))
    .limit(1);
  return row !== undefined && Date.now() - row.missedAt < MISS_CACHE_TTL_MS;
}

/** Records (or refreshes) a provider-chain miss for `flightNo` so subsequent lookups within
 * `MISS_CACHE_TTL_MS` 404 immediately instead of re-querying every provider. */
async function recordMiss(database: DrizzleD1Database<typeof schema>, flightNo: string): Promise<void> {
  await database
    .insert(schema.scheduleLookupMisses)
    .values({ flightNo, missedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.scheduleLookupMisses.flightNo,
      set: { missedAt: Date.now() },
    });
}

/** Inserts (or upserts) provider-resolved legs into `flight_schedules` as a freshly-warmed
 * cache entry: `confirmCount` always resets to 0 (a live fetch is not a crowd confirmation),
 * `daysOfWeek` defaults to "1234567" when the provider couldn't derive a pattern from a
 * single fetch (same convention as POST /schedule/confirm), and `sourceDateIso` is stored
 * as-is (including `null`) so a nearest-date scrape is never presented as date-specific. */
async function cacheProviderLegs(
  database: DrizzleD1Database<typeof schema>,
  flightNo: string,
  legs: ProviderLeg[],
  source: "live-scrape" | "live-api",
  fetchedAt: number,
): Promise<void> {
  for (const [legSeq, leg] of legs.entries()) {
    await database
      .insert(schema.flightSchedules)
      .values({
        flightNo,
        legSeq,
        origin: leg.origin,
        dest: leg.dest,
        depLocal: leg.depLocal,
        arrLocal: leg.arrLocal,
        dayOffset: leg.dayOffset,
        daysOfWeek: leg.daysOfWeek ?? "1234567",
        source,
        fetchedAt,
        sourceDateIso: leg.sourceDateIso ?? null,
        confirmCount: 0,
      })
      .onConflictDoUpdate({
        target: [schema.flightSchedules.flightNo, schema.flightSchedules.legSeq],
        set: {
          origin: leg.origin,
          dest: leg.dest,
          depLocal: leg.depLocal,
          arrLocal: leg.arrLocal,
          dayOffset: leg.dayOffset,
          daysOfWeek: leg.daysOfWeek ?? "1234567",
          source,
          fetchedAt,
          sourceDateIso: leg.sourceDateIso ?? null,
          confirmCount: 0,
        },
      });
  }
}

/**
 * Ensures every origin/dest IATA code referenced by `legs` exists in the `airports`
 * table, self-warming it from the RESOLVED PROVIDER LEG's own airport metadata when
 * possible. Returns the set of codes that are STILL missing after the attempt (empty =
 * fully resolved, safe to cache/serve).
 *
 * Only ever writes a row when a leg carries `originAirport`/`destAirport` with a real
 * IANA `tz` (currently: AeroDataBox only - see `ProviderLeg.originAirport` doc comment
 * for why the fr24 scraper can never safely supply this: it only has city+country TEXT,
 * and neither a country name nor a raw UTC offset is sufficient to derive a correct IANA
 * zone - many countries span multiple zones, and an offset alone silently breaks across
 * DST boundaries `wallToUtc` handles for every other airport in this table). A leg with
 * no usable metadata for a missing code is left unresolved rather than guessed.
 */
async function learnAirportsForLegs(
  database: DrizzleD1Database<typeof schema>,
  legs: ProviderLeg[],
): Promise<Set<string>> {
  const allCodes = new Set(legs.flatMap((leg) => [leg.origin, leg.dest]));
  const existing = await database
    .select({ iata: schema.airports.iata })
    .from(schema.airports)
    .where(inArray(schema.airports.iata, [...allCodes]));
  const known = new Set(existing.map((a) => a.iata));

  // Collect learnable {iata -> {name, tz}} pairs from whichever leg happens to carry
  // metadata for a still-missing code (a multi-leg response might only annotate some legs).
  const learnable = new Map<string, { name: string; tz: string }>();
  for (const leg of legs) {
    if (!known.has(leg.origin) && leg.originAirport && !learnable.has(leg.origin)) {
      learnable.set(leg.origin, leg.originAirport);
    }
    if (!known.has(leg.dest) && leg.destAirport && !learnable.has(leg.dest)) {
      learnable.set(leg.dest, leg.destAirport);
    }
  }

  for (const [iata, meta] of learnable) {
    await database
      .insert(schema.airports)
      .values({ iata, city: meta.name, name: meta.name, tz: meta.tz, source: "live-api" })
      .onConflictDoNothing();
    known.add(iata);
  }

  return new Set([...allCodes].filter((code) => !known.has(code)));
}

/**
 * Re-resolves `flightNo` via the live provider chain and overwrites its cached rows if
 * successful; a provider miss (or an unresolvable airport - see `learnAirportsForLegs`)
 * leaves the (stale) cached rows untouched rather than deleting them - a stale-but-present
 * row is still better than none. Exported (rather than inlined in the route handler) so
 * it's directly `await`-able from tests: the real route only ever invokes it via
 * `c.executionCtx.waitUntil`, which by design does not block the response and isn't
 * synchronously observable from a black-box HTTP test.
 */
export async function refreshScheduleFromProviders(
  database: DrizzleD1Database<typeof schema>,
  env: Env,
  flightNo: string,
  dateIso: string,
): Promise<void> {
  const resolved = await resolveFromProviders(flightNo, dateIso, env);
  if (!resolved) return;

  const stillMissing = await learnAirportsForLegs(database, resolved.legs);
  if (stillMissing.size > 0) return; // can't safely refresh - leave the stale row as-is.

  await cacheProviderLegs(database, flightNo, resolved.legs, resolved.source, Date.now());
}

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

  let legRows = await database
    .select()
    .from(schema.flightSchedules)
    .where(eq(schema.flightSchedules.flightNo, flightNo))
    .orderBy(asc(schema.flightSchedules.legSeq));

  if (legRows.length === 0) {
    // A flight number the provider chain already missed on recently (junk code, typo, or
    // genuinely not scheduled) 404s immediately without re-querying every provider - see
    // `schedule_lookup_misses` doc comment.
    if (await isRecentlyMissed(database, flightNo)) {
      return c.json({ error: "unknown_flight" }, 404);
    }

    // Cache miss: fall through to the live provider chain (scraper, then API fallback).
    // A provider miss (network failure, blocked, not found, no key) is a normal outcome —
    // respond 404 exactly as before so the client falls back to manual entry, never a 500.
    const resolved = await resolveFromProviders(flightNo, date, c.env);
    if (!resolved) {
      await recordMiss(database, flightNo);
      return c.json({ error: "unknown_flight" }, 404);
    }

    // A resolved leg can touch an airport outside our seeded set (providers return
    // arbitrary real-world routes) - attempt to self-warm it, and if that's not possible
    // (see learnAirportsForLegs doc comment), DEGRADE to the same 404 a provider miss
    // gets, rather than caching/serving a leg whose tz we can't safely resolve. This is a
    // deliberate choice over the alternative (guess a tz, e.g. fall back to UTC): every
    // downstream consumer of `airports.tz` (wallToUtc, report-time calc, ...) assumes a
    // real IANA name and would silently compute wrong times for a fabricated one - the
    // same "never present a guess with false confidence" reasoning behind the Task 2 seed
    // purge. The client's existing manual-entry fallback already handles this response.
    const stillMissing = await learnAirportsForLegs(database, resolved.legs);
    if (stillMissing.size > 0) {
      await recordMiss(database, flightNo);
      return c.json({ error: "unknown_flight" }, 404);
    }

    await cacheProviderLegs(database, flightNo, resolved.legs, resolved.source, Date.now());

    legRows = await database
      .select()
      .from(schema.flightSchedules)
      .where(eq(schema.flightSchedules.flightNo, flightNo))
      .orderBy(asc(schema.flightSchedules.legSeq));
  } else {
    // Cache hit: a row older than STALE_MS with no crowd confirmation is served as-is
    // (never block the response on a re-fetch) but kicks off a best-effort background
    // refresh via waitUntil, so the NEXT lookup benefits from fresher data.
    const leg0 = legRows[0]!;
    const isStale = leg0.confirmCount === 0 && leg0.fetchedAt !== null && Date.now() - leg0.fetchedAt > STALE_MS;
    if (isStale) {
      c.executionCtx.waitUntil(refreshScheduleFromProviders(database, c.env, flightNo, date));
    }
  }

  // Resolve every leg's origin/dest tz from the airports table up front. Seed rows are
  // guaranteed coverage at seed time, and a fresh provider-resolved miss above already
  // learned (or degraded to 404 for) every code it introduced via learnAirportsForLegs -
  // but a row can still reference an unresolvable airport if it predates that fix, was
  // crowd-inserted via POST /schedule/confirm with a typo'd/foreign code, or a background
  // refresh (refreshScheduleFromProviders) failed to learn one after this row was already
  // cached. In every one of those cases a 500 is never the right response to a client -
  // degrade to the same unknown_flight 404 a cache miss gets, so the client falls back to
  // manual entry instead of crashing.
  const iatas = [...new Set(legRows.flatMap((leg) => [leg.origin, leg.dest]))];
  const airportRows = await database
    .select()
    .from(schema.airports)
    .where(inArray(schema.airports.iata, iatas));
  const airportByIata = new Map(airportRows.map((a) => [a.iata, a]));

  for (const leg of legRows) {
    for (const code of [leg.origin, leg.dest]) {
      if (!airportByIata.has(code)) {
        return c.json({ error: "unknown_flight" }, 404);
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
      source: "crowd",
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
 * Splits a flight number into its alpha prefix and numeric part (e.g. "EK097" ->
 * { prefix: "EK", num: 97 }). The numeric comparison in `isSibling` is zero-pad
 * agnostic by construction - "EK097" and "EK98" compare as 97 vs 98 regardless of
 * how each was zero-padded in its source string.
 */
function splitFlightNo(flightNo: string): { prefix: string; num: number } | null {
  const match = /^([A-Z]{2})(\d{1,4})$/i.exec(flightNo);
  if (!match) return null;
  return { prefix: match[1]!.toUpperCase(), num: Number(match[2]) };
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

    const originTz = airportByIata.get(leg0.origin)?.tz;
    if (!originTz) continue; // reference data gap - skip rather than 500 a suggestion list.

    // Find the first operating date >= `date` (search up to 7 days forward) whose
    // weekday matches leg0's days_of_week, falls within its validity window, AND whose
    // departure is not before `arrivedIso` (a same-day match with a dep time earlier
    // than the crew's arrival is not a viable connection - keep searching later
    // operating days within the window rather than dropping the candidate outright).
    let operatingDate: string | null = null;
    let hours = 0;
    for (let offset = 0; offset <= OPERATING_DAY_SEARCH_WINDOW; offset++) {
      const candidateDate = addDaysIso(date, offset);
      const weekday = isoWeekday(candidateDate);
      const matchesDay = leg0.daysOfWeek.includes(String(weekday));
      const matchesValidity =
        (leg0.validFrom === null || candidateDate >= leg0.validFrom) &&
        (leg0.validTo === null || candidateDate <= leg0.validTo);
      if (!matchesDay || !matchesValidity) continue;

      const depUtc = wallToUtc(`${candidateDate}T${leg0.depLocal}:00`, originTz);
      const candidateHours = (Date.parse(depUtc) - arrivedMs) / (60 * 60 * 1000);
      if (candidateHours < 0) continue; // dep before arrival - try the next operating day.

      operatingDate = candidateDate;
      hours = candidateHours;
      break;
    }
    if (operatingDate === null) continue;

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
      dateIso: operatingDate,
    });
  }

  // Sibling(s) pinned first, then ascending layover.
  suggestions.sort((a, b) => {
    if (a.sibling !== b.sibling) return a.sibling ? -1 : 1;
    return a.layoverHours - b.layoverHours;
  });

  return c.json({ suggestions: suggestions.slice(0, MAX_RAW_SUGGESTIONS) });
});
