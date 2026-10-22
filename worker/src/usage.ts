import { desc, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { UsageBatchSchema } from "@danyeowa/shared";
import type { UsageFormTimeline, UsageResponse, UsageUserSummary } from "@danyeowa/shared";
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

type Row = typeof schema.usageEvents.$inferSelect;
const propsOf = (row: Row) => (row.props ? JSON.parse(row.props) : {});

/** The label a form timeline shows for an event, or null for one that is not part of a form. */
function stepLabel(row: Row, p: Record<string, unknown>): string | null {
  switch (row.name) {
    case "add_form_opened":
      return "opened";
    case "form_step":
      return String(p.step);
    case "flight_lookup":
      return `lookup_${p.result}`;
    case "trip_saved":
      return "saved";
    case "trip_save_failed":
      return "save_failed";
    case "form_left":
      return `left_${p.reason}`;
    case "form_resumed":
      return "resumed";
    default:
      return null;
  }
}

/**
 * Splits each session into forms: one starts at add_form_opened and takes every form event after
 * it until a save, a close, or the next open. Events carry no form id; this works because only
 * one add form is opened at a time (it opens on her first keystroke in it).
 */
function formTimelines(asc: Row[]): UsageFormTimeline[] {
  const forms: UsageFormTimeline[] = [];
  const openBySession = new Map<string, { form: UsageFormTimeline; lastAt: number }>();
  for (const row of asc) {
    const p = propsOf(row);
    const label = stepLabel(row, p);
    if (label === null) continue;
    if (row.name === "add_form_opened") {
      const form: UsageFormTimeline = {
        openedAt: row.at,
        entry: p.entry ?? "unrecorded",
        outcome: "open",
        steps: [{ label, gapMs: 0, longest: false }],
      };
      forms.push(form);
      openBySession.set(row.sessionId, { form, lastAt: row.at });
      continue;
    }
    const current = openBySession.get(row.sessionId);
    if (!current) continue;
    current.form.steps.push({ label, gapMs: row.at - current.lastAt, longest: false });
    current.lastAt = row.at;
    if (row.name === "trip_saved" || (row.name === "form_left" && p.reason === "closed")) {
      current.form.outcome = row.name === "trip_saved" ? "saved" : "left";
      openBySession.delete(row.sessionId);
    }
  }
  for (const form of forms) {
    const working = form.steps.filter((s) => s.label !== "resumed" && s.gapMs > 0);
    const longest = working.reduce<(typeof working)[number] | null>(
      (best, s) => (best === null || s.gapMs > best.gapMs ? s : best),
      null,
    );
    if (longest) longest.longest = true;
  }
  return forms.reverse().slice(0, 10);
}

function sittings(asc: Row[]): UsageUserSummary["sittings"] {
  const bySession = new Map<string, { startedAt: number; saves: number[] }>();
  for (const row of asc) {
    const s = bySession.get(row.sessionId) ?? { startedAt: row.at, saves: [] };
    bySession.set(row.sessionId, s);
    if (row.name === "trip_saved") s.saves.push(row.at);
  }
  return [...bySession.values()]
    .filter((s) => s.saves.length > 0)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10)
    .map((s) => ({
      startedAt: s.startedAt,
      saved: s.saves.length,
      medianGapMs: median(s.saves.slice(1).map((at, i) => at - s.saves[i]!)),
    }));
}

function summarise(email: string, rows: Row[]): UsageUserSummary {
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
    missingFlights: [],
    timeEdits: { legsEdited: 0, legsAutofilled: 0 },
    entries: {},
    formLeft: { closed: {}, hidden: {} },
    sittings: [],
    forms: [],
    recent: [],
  };
  const msToSave: number[] = [];
  const missing = new Map<string, { flightNo: string; unknown: number; error: number }>();
  const bump = (counts: Record<string, number>, key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  // Props were validated against the shared schema on the way in, so these reads are safe.
  for (const row of rows) {
    const p = propsOf(row);
    switch (row.name) {
      case "app_opened":
        s.appOpened[p.standalone ? "standalone" : "browser"]++;
        break;
      case "tab_viewed":
        bump(s.tabViewed, p.tab);
        break;
      case "add_form_opened":
        s.funnel.addFormOpened++;
        bump(s.entries, p.entry ?? "unrecorded");
        break;
      case "flight_lookup":
        s.funnel.flightLookup[p.result as "found" | "unknown" | "error"]++;
        if (p.flightNo && p.result !== "found") {
          const m = missing.get(p.flightNo) ?? { flightNo: p.flightNo, unknown: 0, error: 0 };
          missing.set(p.flightNo, m);
          m[p.result as "unknown" | "error"]++;
        }
        break;
      case "manual_entry_opened":
        s.funnel.manualEntryOpened++;
        break;
      case "trip_saved":
        s.funnel.tripSaved[p.path as "autofill" | "manual"]++;
        msToSave.push(p.msSinceOpen);
        if (p.legsEdited !== undefined) {
          s.timeEdits.legsEdited += p.legsEdited;
          s.timeEdits.legsAutofilled += p.legs;
        }
        break;
      case "trip_save_failed":
        s.funnel.tripSaveFailed++;
        break;
      case "form_left":
        bump(s.formLeft[p.reason as "closed" | "hidden"], p.lastStep);
        break;
    }
  }
  s.medianMsToSave = median(msToSave);
  s.missingFlights = [...missing.values()].sort(
    (a, b) => b.unknown + b.error - (a.unknown + a.error),
  );
  // Rows arrive newest first; timelines read forwards. Ties keep insertion order (the client
  // makes `at` strictly increasing within a page, so a tie is two pages, not two steps).
  const asc = [...rows].sort((a, b) => a.at - b.at);
  s.sittings = sittings(asc);
  s.forms = formTimelines(asc);
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
