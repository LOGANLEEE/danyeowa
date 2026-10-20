import { desc, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { UsageBatchSchema } from "@danyeowa/shared";
import type { UsageResponse, UsageUserSummary } from "@danyeowa/shared";
import * as schema from "./db/schema";
import type { Env } from "./index";

type Variables = {
  user: { id: string; email: string; name: string | null } | null;
};

export const usageRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Unset or empty means nobody — the page 404s for every account, which is the safe default. */
export function canViewUsage(env: Env, email: string): boolean {
  const viewers = (env.USAGE_VIEWER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return viewers.includes(email.trim().toLowerCase());
}

usageRouter.post("/events", async (c) => {
  const user = c.var.user;
  if (!user) return c.json({ error: "unauthenticated" }, 401);

  const parsed = UsageBatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  const database = drizzle(c.env.DB, { schema });
  // One statement per row, batched: a single multi-row INSERT of 20 events binds 120 values,
  // past D1's 100-parameter limit, and fails.
  const [first, ...rest] = parsed.data.events.map((e) =>
    database.insert(schema.usageEvents).values({
      userId: user.id,
      sessionId: parsed.data.sessionId,
      name: e.name,
      props: JSON.stringify(e.props),
      at: e.at,
    }),
  );
  await database.batch([first!, ...rest]);
  return c.body(null, 204);
});

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function summarise(email: string, rows: (typeof schema.usageEvents.$inferSelect)[]): UsageUserSummary {
  const s: UsageUserSummary = {
    email,
    sessions: new Set(rows.map((r) => r.sessionId)).size,
    appOpened: { standalone: 0, browser: 0 },
    funnel: {
      addFormOpened: 0,
      flightLookup: { found: 0, unknown: 0, error: 0 },
      manualEntryOpened: 0,
      tripSaved: { autofill: 0, manual: 0 },
      tripSaveFailed: 0,
    },
    medianMsToSave: null,
    tabViewed: {},
    recent: [],
  };
  const msToSave: number[] = [];
  // Props were validated against the shared schema on the way in, so these reads are safe.
  for (const row of rows) {
    const p = row.props ? JSON.parse(row.props) : {};
    switch (row.name) {
      case "app_opened":
        s.appOpened[p.standalone ? "standalone" : "browser"]++;
        break;
      case "tab_viewed":
        s.tabViewed[p.tab] = (s.tabViewed[p.tab] ?? 0) + 1;
        break;
      case "add_form_opened":
        s.funnel.addFormOpened++;
        break;
      case "flight_lookup":
        s.funnel.flightLookup[p.result as "found" | "unknown" | "error"]++;
        break;
      case "manual_entry_opened":
        s.funnel.manualEntryOpened++;
        break;
      case "trip_saved":
        s.funnel.tripSaved[p.path as "autofill" | "manual"]++;
        msToSave.push(p.msSinceOpen);
        break;
      case "trip_save_failed":
        s.funnel.tripSaveFailed++;
        break;
    }
  }
  s.medianMsToSave = median(msToSave);
  s.recent = rows.slice(0, 30).map((r) => ({
    name: r.name,
    props: r.props ? JSON.parse(r.props) : null,
    at: r.at,
  }));
  return s;
}

usageRouter.get("/usage", async (c) => {
  const user = c.var.user;
  // 404, not 403: the page should not admit to existing for anyone who is not a viewer.
  if (!user || !canViewUsage(c.env, user.email)) return c.notFound();

  const asked = Number(c.req.query("days"));
  const days = Number.isInteger(asked) && asked > 0 && asked <= 365 ? asked : 30;
  const since = Date.now() - days * 86_400_000;

  const database = drizzle(c.env.DB, { schema });
  // ponytail: whole window in one read, aggregated here; fine for a handful of users, move the
  // counts into SQL GROUP BY if this ever serves more than that.
  const rows = await database
    .select({ event: schema.usageEvents, email: schema.user.email })
    .from(schema.usageEvents)
    .innerJoin(schema.user, eq(schema.user.id, schema.usageEvents.userId))
    .where(gte(schema.usageEvents.at, since))
    .orderBy(desc(schema.usageEvents.at));

  const byEmail = new Map<string, (typeof schema.usageEvents.$inferSelect)[]>();
  for (const { event, email } of rows) {
    byEmail.set(email, byEmail.get(email) ?? []);
    byEmail.get(email)!.push(event);
  }
  const body: UsageResponse = {
    days,
    users: [...byEmail].map(([email, events]) => summarise(email, events)),
  };
  return c.json(body);
});
