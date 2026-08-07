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
import type { Env } from "./index";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const pushRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

function db(env: Env) {
  return drizzle(env.DB, { schema });
}

const DEFAULT_PREFS = { enabled: true, leadMinutes: 120 };

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
    subscribed: subRows.length > 0,
  };

  return c.json(body);
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

  await database
    .insert(schema.notificationPrefs)
    .values({ userId: user.id, enabled, leadMinutes })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { enabled, leadMinutes },
    });

  return c.body(null, 200);
});
