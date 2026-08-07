import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { ShareLinkCreateSchema, localDateKey } from "@roaster/shared";
import type { SharedView, SharedViewTrip } from "@roaster/shared";
import * as schema from "./db/schema";
import type { Env } from "./index";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const shareRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

/** 32 random bytes, base64url-encoded without padding — ~192 bits of entropy. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

shareRouter.post("/share-links", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = ShareLinkCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  const database = db(c.env);
  const row = {
    id: crypto.randomUUID(),
    userId: user.id,
    token: generateToken(),
    label: parsed.data.label ?? null,
  };
  await database.insert(schema.shareLinks).values(row);

  return c.json({ id: row.id, token: row.token, label: row.label, createdAt: Date.now() }, 201);
});

shareRouter.get("/share-links", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);
  const rows = await database
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.userId, user.id));

  const links = rows.map((row) => ({
    id: row.id,
    token: row.token,
    label: row.label,
    createdAt: row.createdAt,
    revoked: row.revokedAt !== null,
  }));

  return c.json({ links });
});

shareRouter.post("/share-links/:id/revoke", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);
  const id = c.req.param("id");
  const rows = await database
    .select()
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.id, id), eq(schema.shareLinks.userId, user.id)))
    .limit(1);
  if (!rows[0]) return c.json({ error: "not found" }, 404);

  // Repeats the ownership predicate from the SELECT above in the write itself, so the
  // write can never revoke someone else's link even if the read/write ever drifted
  // apart (e.g. future refactor drops the pre-check) — defense in depth, not just relying
  // on the earlier lookup.
  await database
    .update(schema.shareLinks)
    .set({ revokedAt: Date.now() })
    .where(and(eq(schema.shareLinks.id, id), eq(schema.shareLinks.userId, user.id)));

  return c.body(null, 204);
});

/**
 * Builds the reduced public projection for one user's current & future trips.
 *
 * awayCity rule: dest city of the first leg (the outbound destination) — this is the
 * "where they've gone" city family cares about. For a trip that returns partway home
 * and heads back out again (multi-leg beyond a simple there-and-back), that would
 * undercount the real destination, so the rule instead walks legs and takes the dest
 * city of the LAST leg whose destination isn't the trip's home base (the first leg's
 * origin) — for a simple round trip (DXB->AKL->DXB) that's still the first leg's dest.
 */
async function buildSharedView(
  database: ReturnType<typeof db>,
  userId: string,
  crewName: string,
  nowMs: number,
): Promise<SharedView> {
  const tripRows = await database.select().from(schema.trips).where(eq(schema.trips.userId, userId));
  const tripIds = tripRows.map((t) => t.id);

  const flightRows =
    tripIds.length > 0
      ? await database
          .select()
          .from(schema.flights)
          .where(inArray(schema.flights.tripId, tripIds))
          .orderBy(asc(schema.flights.legSeq))
      : [];

  const flightsByTrip = new Map<string, (typeof flightRows)[number][]>();
  for (const flight of flightRows) {
    const list = flightsByTrip.get(flight.tripId) ?? [];
    list.push(flight);
    flightsByTrip.set(flight.tripId, list);
  }

  const iatas = [...new Set(flightRows.flatMap((f) => [f.origin, f.dest]))];
  const airportRows =
    iatas.length > 0
      ? await database.select().from(schema.airports).where(inArray(schema.airports.iata, iatas))
      : [];
  const cityByIata = new Map(airportRows.map((a) => [a.iata, a.city]));

  const trips: SharedViewTrip[] = [];
  for (const trip of tripRows) {
    const legs = flightsByTrip.get(trip.id) ?? [];
    if (legs.length === 0) continue;

    // Any unparseable arrUtc excludes the whole trip from the public projection rather
    // than trying to work around the bad value: Date.parse returns NaN for a malformed
    // date, and NaN comparisons are always false, so `NaN < nowMs` would otherwise fail
    // OPEN (a corrupt trip silently treated as "still upcoming", forever). Corrupt data
    // shouldn't get partial trust on a public, unauthenticated endpoint.
    const arrTimesMs = legs.map((leg) => Date.parse(leg.arrUtc));
    if (arrTimesMs.some((ms) => !Number.isFinite(ms))) continue;

    // Latest actual arrival, not the last leg by legSeq / array position — legSeq is
    // trusted for display ordering but must not be trusted for "is this trip over" (a
    // mis-sequenced or edited roster could otherwise hide an in-progress trip or expose
    // one that already ended).
    const lastArrMs = Math.max(...arrTimesMs);
    if (lastArrMs < nowMs) continue; // past trip

    const lastLeg = legs[arrTimesMs.indexOf(lastArrMs)]!;
    const firstLeg = legs[0]!;
    const homeBase = firstLeg.origin;
    // Last leg whose dest isn't home base; falls back to the first leg's dest for a
    // simple round trip.
    const awayLeg = [...legs].reverse().find((leg) => leg.dest !== homeBase) ?? firstLeg;

    trips.push({
      fromIso: localDateKey(firstLeg.depUtc, firstLeg.depTz),
      toIso: localDateKey(lastLeg.arrUtc, lastLeg.arrTz),
      awayCity: cityByIata.get(awayLeg.dest) ?? awayLeg.dest,
      legs: legs.map((leg) => ({
        dateIso: localDateKey(leg.depUtc, leg.depTz),
        fromCity: cityByIata.get(leg.origin) ?? leg.origin,
        toCity: cityByIata.get(leg.dest) ?? leg.dest,
      })),
    });
  }

  trips.sort((a, b) => a.fromIso.localeCompare(b.fromIso));

  return {
    crewName,
    generatedAt: new Date(nowMs).toISOString(),
    trips,
  };
}

const CREW_NAME_FALLBACK = "Your crew member";
const CREW_NAME_MAX_LENGTH = 40;

/**
 * First token of `name` split on whitespace, per the product rule ("crewName: first
 * token of user.name split by space; fallback 'Your crew member'"). Falls back instead
 * of taking the raw token whenever that token isn't safely a first name: no whitespace
 * to split on at all can mean the whole string (e.g. a bare email address someone set
 * as their display name) would otherwise pass straight through to this public,
 * unauthenticated endpoint — same for anything containing "@" or implausibly long.
 */
function deriveCrewName(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return CREW_NAME_FALLBACK;

  const firstToken = trimmed.split(/\s+/)[0]!;
  if (firstToken.includes("@") || firstToken.length > CREW_NAME_MAX_LENGTH) {
    return CREW_NAME_FALLBACK;
  }
  return firstToken;
}

shareRouter.get("/shared/:token", async (c) => {
  const database = db(c.env);
  const token = c.req.param("token");

  const rows = await database
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.token, token))
    .limit(1);
  const link = rows[0];
  // Unknown token and revoked token 404 identically — no existence oracle.
  if (!link || link.revokedAt !== null) {
    return c.json({ error: "not found" }, 404);
  }

  const [userRow] = await database
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, link.userId))
    .limit(1);
  const crewName = deriveCrewName(userRow?.name ?? null);

  const view = await buildSharedView(database, link.userId, crewName, Date.now());

  c.header("Cache-Control", "private, max-age=60");
  return c.json(view, 200);
});
