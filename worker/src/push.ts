import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import {
  NotificationPrefsSchema,
  PushSubscribeSchema,
  PushUnsubscribeSchema,
} from "@roaster/shared";
import type { PushConfig } from "@roaster/shared";
import * as schema from "./db/schema";
import { sendPush } from "./webpush";
import type { Env } from "./index";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const pushRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

const DEFAULT_PREFS = { enabled: true, leadMinutes: 120, arrivalEnabled: true };

pushRouter.get("/push/config", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);

  const [prefsRow] = await database
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, user.id))
    .limit(1);

  const subRows = await database
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, user.id))
    .limit(1);

  const body: PushConfig = {
    publicKey: c.env.VAPID_PUBLIC_KEY ?? "",
    enabled: prefsRow?.enabled ?? DEFAULT_PREFS.enabled,
    leadMinutes: prefsRow?.leadMinutes ?? DEFAULT_PREFS.leadMinutes,
    arrivalEnabled: prefsRow?.arrivalEnabled ?? DEFAULT_PREFS.arrivalEnabled,
    subscribed: subRows.length > 0,
  };

  return c.json(body);
});

/**
 * Sends a notification to the caller's own devices, right now.
 *
 * GET, and side-effecting, on purpose: the point is to check delivery on a phone, and opening
 * a URL is the only thing a phone can do without tooling. It can only ever reach the caller's
 * own subscriptions, so the usual argument against a side-effecting GET doesn't apply.
 */
pushRouter.get("/push/test", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const database = db(c.env);
  const subs = await database
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, user.id));

  if (subs.length === 0) {
    return c.json({ sent: 0, subscriptions: 0, hint: "no push subscription — enable it in Settings" });
  }

  const payload = {
    title: "roaster-me test",
    body: "Push is working on this device.",
    tag: "push-test",
  };

  let sent = 0;
  let expired = 0;
  const failures: number[] = [];
  for (const sub of subs) {
    const result = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload, c.env);
    if (result.ok) sent++;
    else if (result.expired) {
      await database.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
      expired++;
    } else {
      failures.push(result.status);
    }
  }

  return c.json({ sent, subscriptions: subs.length, expiredRemoved: expired, failedWithStatus: failures });
});

pushRouter.post("/push/subscribe", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = PushSubscribeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  const database = db(c.env);
  const { endpoint, keys } = parsed.data;

  // Upsert by endpoint: the same browser subscription can be re-POSTed (e.g. re-opting
  // in after toggling off) and must not accumulate duplicate rows.
  const [existing] = await database
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint))
    .limit(1);

  if (existing) {
    await database
      .update(schema.pushSubscriptions)
      .set({ userId: user.id, p256dh: keys.p256dh, auth: keys.auth })
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  } else {
    await database.insert(schema.pushSubscriptions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  }

  return c.body(null, 201);
});

pushRouter.delete("/push/subscribe", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = PushUnsubscribeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  const database = db(c.env);
  await database
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.endpoint, parsed.data.endpoint),
        eq(schema.pushSubscriptions.userId, user.id),
      ),
    );

  return c.body(null, 204);
});

pushRouter.put("/push/prefs", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = NotificationPrefsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  const database = db(c.env);
  const { enabled, leadMinutes } = parsed.data;
  // Absent means "client didn't send it", not "off" — keep whatever is stored.
  const arrivalEnabled = parsed.data.arrivalEnabled ?? DEFAULT_PREFS.arrivalEnabled;

  await database
    .insert(schema.notificationPrefs)
    .values({ userId: user.id, enabled, leadMinutes, arrivalEnabled })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set:
        parsed.data.arrivalEnabled === undefined
          ? { enabled, leadMinutes }
          : { enabled, leadMinutes, arrivalEnabled },
    });

  return c.body(null, 200);
});
