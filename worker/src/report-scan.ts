import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { formatLocal } from "@roaster/shared";
import * as schema from "./db/schema";
import { sendPush } from "./webpush";
import type { Env } from "./index";

// Upper bound on how far ahead a flight's report time can be and still be pulled into
// the candidate set, regardless of any individual user's lead_minutes preference (max
// allowed lead is 360 per NotificationPrefsSchema) plus one cron period of slack so a
// flight landing right at the edge of a 15-minute scan window is never missed.
const MAX_LEAD_MINUTES = 360;
const CRON_SLACK_MINUTES = 15;
const MAX_WINDOW_MS = (MAX_LEAD_MINUTES + CRON_SLACK_MINUTES) * 60 * 1000;

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

/**
 * Race-safe "claim" of a flight for notification: only succeeds (returns true) if this
 * call is the one that flips report_notified_at from NULL to `stampMs`. A second
 * concurrent/overlapping cron invocation racing on the same flight id will see
 * `changes === 0` and skip sending - this is what makes double-run idempotent even
 * without a lock.
 */
async function claimFlightForNotification(
  database: ReturnType<typeof db>,
  flightId: string,
  stampMs: number,
): Promise<boolean> {
  const result = await database
    .update(schema.flights)
    .set({ reportNotifiedAt: stampMs })
    .where(and(eq(schema.flights.id, flightId), isNull(schema.flights.reportNotifiedAt)))
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Same claim-before-send trick as report alerts, on the arrival stamp.
 */
async function claimFlightForArrival(
  database: ReturnType<typeof db>,
  flightId: string,
  stampMs: number,
): Promise<boolean> {
  const result = await database
    .update(schema.flights)
    .set({ arrivalNotifiedAt: stampMs })
    .where(and(eq(schema.flights.id, flightId), isNull(schema.flights.arrivalNotifiedAt)))
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * "Her flight lands in an hour" — the alert for whoever is meeting a flight rather than working
 * it, keyed on arrival instead of report time.
 *
 * It reuses the user's existing lead_minutes rather than adding a second preference: the
 * question it answers ("how much warning do you want") is the same one, and one dial the user
 * already understands beats two they have to reconcile.
 */
export async function runArrivalScan(env: Env, nowMs: number): Promise<ReportScanResult> {
  const database = db(env);
  const nowIso = new Date(nowMs).toISOString();
  const windowEndIso = new Date(nowMs + MAX_WINDOW_MS).toISOString();

  const candidates = await database
    .select({
      id: schema.flights.id,
      userId: schema.flights.userId,
      flightNo: schema.flights.flightNo,
      origin: schema.flights.origin,
      dest: schema.flights.dest,
      arrUtc: schema.flights.arrUtc,
    })
    .from(schema.flights)
    .where(
      and(
        gte(schema.flights.arrUtc, nowIso),
        lte(schema.flights.arrUtc, windowEndIso),
        isNull(schema.flights.arrivalNotifiedAt),
      ),
    );

  const result: ReportScanResult = {
    scanned: candidates.length,
    notified: 0,
    skippedOutsideLead: 0,
    expiredSubscriptionsRemoved: 0,
  };
  if (candidates.length === 0) return result;

  const userIds = [...new Set(candidates.map((f) => f.userId))];
  const destCodes = [...new Set(candidates.map((f) => f.dest))];

  const [prefsRows, airportRows] = await Promise.all([
    database.select().from(schema.notificationPrefs).where(inArray(schema.notificationPrefs.userId, userIds)),
    database.select().from(schema.airports).where(inArray(schema.airports.iata, destCodes)),
  ]);
  const prefsByUser = new Map(prefsRows.map((p) => [p.userId, p]));
  const airportByIata = new Map(airportRows.map((a) => [a.iata, a]));

  for (const flight of candidates) {
    const prefs = prefsByUser.get(flight.userId) ?? { enabled: true, leadMinutes: 120 };
    if (!prefs.enabled) {
      result.skippedOutsideLead++;
      continue;
    }

    const minutesUntilArrival = (Date.parse(flight.arrUtc) - nowMs) / 60_000;
    if (minutesUntilArrival > prefs.leadMinutes) {
      result.skippedOutsideLead++;
      continue;
    }

    const claimed = await claimFlightForArrival(database, flight.id, nowMs);
    if (!claimed) continue;

    // Local time AT THE DESTINATION: the person waiting is standing in the arrivals hall.
    const destTz = airportByIata.get(flight.dest)?.tz ?? "UTC";
    const arrivalLocal = formatLocal(flight.arrUtc, destTz);

    const payload = {
      title: `${flight.flightNo} lands ${arrivalLocal}`,
      body: `${flight.origin} → ${flight.dest}, in ${Math.max(0, Math.round(minutesUntilArrival))} min`,
      tag: `arrival-${flight.id}`,
    };

    const subs = await database
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, flight.userId));

    let sentAny = false;
    for (const sub of subs) {
      const sendResult = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        env,
      );
      if (sendResult.ok) sentAny = true;
      else if (sendResult.expired) {
        await database.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
        result.expiredSubscriptionsRemoved++;
      }
    }
    if (sentAny) result.notified++;
  }

  return result;
}

export type ReportScanResult = {
  scanned: number;
  notified: number;
  skippedOutsideLead: number;
  expiredSubscriptionsRemoved: number;
};

/**
 * Core report-time notification scan, factored out of the `scheduled` handler so it
 * can be invoked directly in tests (vitest-pool-workers' scheduled-handler test
 * support is awkward to set up reliably; a plain async function is trivial to call
 * with fixture data and a fixed `nowMs`).
 *
 * Candidates: flights with report_utc in [now, now + MAX_LEAD_MINUTES + cron slack)
 * that haven't been notified yet, joined to their owning user's notification prefs.
 * Each candidate is then filtered by that user's OWN lead_minutes (default 120,
 * disabled users skipped entirely) before a stamp-then-send attempt.
 */
export async function runReportScan(env: Env, nowMs: number): Promise<ReportScanResult> {
  const database = db(env);
  const nowIso = new Date(nowMs).toISOString();
  const windowEndIso = new Date(nowMs + MAX_WINDOW_MS).toISOString();

  const candidates = await database
    .select({
      id: schema.flights.id,
      userId: schema.flights.userId,
      flightNo: schema.flights.flightNo,
      origin: schema.flights.origin,
      dest: schema.flights.dest,
      reportUtc: schema.flights.reportUtc,
      reportNotifiedAt: schema.flights.reportNotifiedAt,
    })
    .from(schema.flights)
    .where(
      and(
        gte(schema.flights.reportUtc, nowIso),
        lte(schema.flights.reportUtc, windowEndIso),
        isNull(schema.flights.reportNotifiedAt),
      ),
    );

  const result: ReportScanResult = {
    scanned: candidates.length,
    notified: 0,
    skippedOutsideLead: 0,
    expiredSubscriptionsRemoved: 0,
  };

  if (candidates.length === 0) return result;

  const userIds = [...new Set(candidates.map((f) => f.userId))];
  const originCodes = [...new Set(candidates.map((f) => f.origin))];

  const [prefsRows, airportRows] = await Promise.all([
    database.select().from(schema.notificationPrefs).where(inArray(schema.notificationPrefs.userId, userIds)),
    database.select().from(schema.airports).where(inArray(schema.airports.iata, originCodes)),
  ]);
  const prefsByUser = new Map(prefsRows.map((p) => [p.userId, p]));
  const airportByIata = new Map(airportRows.map((a) => [a.iata, a]));

  for (const flight of candidates) {
    // Default prefs (enabled, 120min lead) mirror push.ts's DEFAULT_PREFS: a user who
    // never touched settings still gets notified.
    const prefs = prefsByUser.get(flight.userId) ?? { enabled: true, leadMinutes: 120 };
    if (!prefs.enabled) {
      result.skippedOutsideLead++;
      continue;
    }

    const minutesUntilReport = (Date.parse(flight.reportUtc) - nowMs) / 60_000;
    if (minutesUntilReport > prefs.leadMinutes) {
      result.skippedOutsideLead++;
      continue;
    }

    const claimed = await claimFlightForNotification(database, flight.id, nowMs);
    if (!claimed) continue; // already claimed by another (overlapping) scan run

    const originTz = airportByIata.get(flight.origin)?.tz ?? "UTC";
    const reportLocal = formatLocal(flight.reportUtc, originTz);
    const leaveByLocal = formatLocal(
      new Date(Date.parse(flight.reportUtc) - prefs.leadMinutes * 60_000).toISOString(),
      originTz,
    );

    const payload = {
      title: `Report ${reportLocal} — ${flight.origin} → ${flight.dest}`,
      body: `leave home by ${leaveByLocal}`,
      tag: flight.id,
    };

    const subs = await database
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, flight.userId));

    let sentAny = false;
    for (const sub of subs) {
      const sendResult = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        env,
      );
      if (sendResult.ok) {
        sentAny = true;
      } else if (sendResult.expired) {
        await database.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
        result.expiredSubscriptionsRemoved++;
      }
    }
    if (sentAny) result.notified++;
  }

  return result;
}
