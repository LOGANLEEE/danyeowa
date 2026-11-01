import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import { activePairing, senderLabel } from "./crew";
import { sendPush } from "./webpush";
import type { Env } from "./index";

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

/**
 * A roster's identity: the worked sectors' flight number, route and times, hashed. Ids, leg order
 * and notes are left out on purpose — an edit is delete + create, so the same content under new
 * ids must give the same fingerprint or every edit-to-nothing would push.
 */
async function rosterFingerprint(
  database: ReturnType<typeof db>,
  userId: string,
): Promise<string> {
  const rows = await database
    .select({
      flightNo: schema.flights.flightNo,
      origin: schema.flights.origin,
      dest: schema.flights.dest,
      depUtc: schema.flights.depUtc,
      arrUtc: schema.flights.arrUtc,
      reportUtc: schema.flights.reportUtc,
    })
    .from(schema.flights)
    .where(and(eq(schema.flights.userId, userId), eq(schema.flights.operating, true)))
    .orderBy(asc(schema.flights.depUtc), asc(schema.flights.flightNo));
  const text = rows
    .map((r) => [r.flightNo, r.origin, r.dest, r.depUtc, r.arrUtc, r.reportUtc].join("|"))
    .join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type RosterWatchScanResult = { notified: number; baselined: number };

/**
 * Pushes the watcher once per changed roster, from the same 15-minute cron as the other scans, so
 * an edit (delete + create) and a bulk month entry each read as one change.
 *
 * The fingerprint advances only by a claim made before sending, and goes back if no device took
 * the message — the shape report-scan uses — so a failed send is retried next cron rather than
 * lost. A watcher with no subscription is skipped without advancing, so a dead device ends up
 * as a quiet skip (its expired row is deleted on the failing send) rather than a loop.
 */
export async function runRosterWatchScan(env: Env, _nowMs: number): Promise<RosterWatchScanResult> {
  const database = db(env);
  const result: RosterWatchScanResult = { notified: 0, baselined: 0 };

  const watches = await database
    .select()
    .from(schema.rosterWatches)
    .where(eq(schema.rosterWatches.enabled, true));

  for (const watch of watches) {
    const { watcherUserId, watchedUserId } = watch;

    if (!(await activePairing(database, watcherUserId, watchedUserId))) {
      await database
        .delete(schema.rosterWatches)
        .where(
          and(
            eq(schema.rosterWatches.watcherUserId, watcherUserId),
            eq(schema.rosterWatches.watchedUserId, watchedUserId),
          ),
        );
      continue;
    }

    const fingerprint = await rosterFingerprint(database, watchedUserId);
    if (watch.lastFingerprint === fingerprint) continue;

    const claim = async (from: string | null, to: string | null) => {
      const res = await database
        .update(schema.rosterWatches)
        .set({ lastFingerprint: to })
        .where(
          and(
            eq(schema.rosterWatches.watcherUserId, watcherUserId),
            eq(schema.rosterWatches.watchedUserId, watchedUserId),
            from === null
              ? isNull(schema.rosterWatches.lastFingerprint)
              : eq(schema.rosterWatches.lastFingerprint, from),
          ),
        )
        .run();
      return (res.meta.changes ?? 0) > 0;
    };

    if (watch.lastFingerprint === null) {
      if (await claim(null, fingerprint)) result.baselined++;
      continue;
    }

    const subs = await database
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, watcherUserId));
    if (subs.length === 0) continue;

    if (!(await claim(watch.lastFingerprint, fingerprint))) continue;

    const [watched] = await database
      .select({ name: schema.user.name, email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, watchedUserId))
      .limit(1);
    const payload = {
      title: senderLabel(watched?.name, watched?.email),
      body: "updated their roster",
      tag: `roster-${watchedUserId}`,
    };

    let sentAny = false;
    for (const sub of subs) {
      const sent = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        env,
      );
      if (sent.ok) sentAny = true;
      else if (sent.expired) {
        await database.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
      }
    }
    if (sentAny) result.notified++;
    else await claim(fingerprint, watch.lastFingerprint);
  }

  return result;
}
