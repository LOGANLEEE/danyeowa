import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Me, UsageResponse } from "@danyeowa/shared";
import * as schema from "../src/db/schema";
import { signInAs } from "./helpers";

// vitest.config.ts binds USAGE_VIEWER_EMAILS to " Usage-Viewer@Example.com , other@example.com",
// so this address also proves the list is trimmed and compared case-insensitively.
const VIEWER = "usage-viewer@example.com";
const CREW = "usage-crew@example.com";

let viewerCookie = "";
let crewCookie = "";

beforeAll(async () => {
  viewerCookie = await signInAs(VIEWER);
  crewCookie = await signInAs(CREW);
});

beforeEach(async () => {
  await drizzle(env.DB, { schema }).delete(schema.usageEvents);
});

function postEvents(cookie: string | null, body: unknown) {
  return SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function getUsage(cookie: string, query = "") {
  return SELF.fetch(`https://example.com/api/usage${query}`, { headers: { Cookie: cookie } });
}

const now = Date.now();
const ev = (name: string, props: Record<string, unknown>, at = now) => ({ name, props, at });

describe("POST /api/events", () => {
  it("401s without a session", async () => {
    const res = await postEvents(null, { sessionId: "s1", events: [ev("add_form_opened", {})] });
    expect(res.status).toBe(401);
  });

  it("400s on an event name it does not know", async () => {
    const res = await postEvents(crewCookie, { sessionId: "s1", events: [ev("clicked_ad", {})] });
    expect(res.status).toBe(400);
  });

  it("400s on a batch of more than 20 events", async () => {
    const events = Array.from({ length: 21 }, () => ev("add_form_opened", {}));
    const res = await postEvents(crewCookie, { sessionId: "s1", events });
    expect(res.status).toBe(400);
  });

  it("400s when an event's props are over 1KB", async () => {
    const res = await postEvents(crewCookie, {
      sessionId: "s1",
      events: [ev("tab_viewed", { tab: "x".repeat(1100) })],
    });
    expect(res.status).toBe(400);
  });

  it("stores a valid batch against the signed-in user and answers 204", async () => {
    const res = await postEvents(crewCookie, {
      sessionId: "s1",
      events: [ev("app_opened", { standalone: true }), ev("add_form_opened", {})],
    });
    expect(res.status).toBe(204);
    const rows = await drizzle(env.DB, { schema }).select().from(schema.usageEvents);
    expect(rows.map((r) => r.name).sort()).toEqual(["add_form_opened", "app_opened"]);
    expect(rows.every((r) => r.sessionId === "s1")).toBe(true);
    expect(JSON.parse(rows.find((r) => r.name === "app_opened")!.props!)).toEqual({ standalone: true });
  });
});

describe("GET /api/usage", () => {
  it("404s for a signed-in user who is not on the viewer list", async () => {
    expect((await getUsage(crewCookie)).status).toBe(404);
  });

  it("404s for everyone, the viewer included, when the list is unset", async () => {
    const bindings = env as unknown as { USAGE_VIEWER_EMAILS?: string };
    const saved = bindings.USAGE_VIEWER_EMAILS;
    delete bindings.USAGE_VIEWER_EMAILS;
    try {
      expect((await getUsage(viewerCookie)).status).toBe(404);
    } finally {
      bindings.USAGE_VIEWER_EMAILS = saved;
    }
    expect((await getUsage(viewerCookie)).status).toBe(200);
  });

  it("tells /api/me who may see it", async () => {
    const asViewer = (await (await SELF.fetch("https://example.com/api/me", { headers: { Cookie: viewerCookie } })).json()) as Me;
    const asCrew = (await (await SELF.fetch("https://example.com/api/me", { headers: { Cookie: crewCookie } })).json()) as Me;
    expect(asViewer.canViewUsage).toBe(true);
    expect(asCrew.canViewUsage).toBe(false);
  });

  it("summarises each user's funnel for the viewer", async () => {
    await postEvents(crewCookie, {
      sessionId: "s1",
      events: [
        ev("app_opened", { standalone: true }),
        ev("tab_viewed", { tab: "calendar" }),
        ev("add_form_opened", {}),
        ev("flight_lookup", { result: "found", ms: 120 }),
        ev("trip_saved", { path: "autofill", legs: 1, msSinceOpen: 4000 }),
        ev("add_form_opened", {}),
        ev("flight_lookup", { result: "unknown", ms: 300 }),
        ev("manual_entry_opened", {}),
        ev("trip_save_failed", { path: "manual", status: 400 }),
        ev("trip_saved", { path: "manual", legs: 2, msSinceOpen: 30000 }),
      ],
    });
    await postEvents(crewCookie, {
      sessionId: "s2",
      events: [
        ev("app_opened", { standalone: false }),
        ev("trip_saved", { path: "autofill", legs: 1, msSinceOpen: 9000 }),
        // Outside a 7-day window, inside the default 30.
        ev("add_form_opened", {}, now - 10 * 86_400_000),
      ],
    });

    const res = await getUsage(viewerCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as UsageResponse;
    expect(body.days).toBe(30);
    const crew = body.users.find((u) => u.email === CREW)!;
    expect(crew.sessions).toBe(2);
    expect(crew.appOpened).toEqual({ standalone: 1, browser: 1 });
    expect(crew.funnel).toEqual({
      addFormOpened: 3,
      flightLookup: { found: 1, unknown: 1, error: 0 },
      manualEntryOpened: 1,
      tripSaved: { autofill: 2, manual: 1 },
      tripSaveFailed: 1,
    });
    // 4000, 9000, 30000 -> 9000
    expect(crew.medianMsToSave).toBe(9000);
    expect(crew.tabViewed).toEqual({ calendar: 1 });
    expect(crew.recent).toHaveLength(13);
    expect(crew.recent[crew.recent.length - 1]!.name).toBe("add_form_opened");

    const week = (await (await getUsage(viewerCookie, "?days=7")).json()) as UsageResponse;
    expect(week.users.find((u) => u.email === CREW)!.funnel.addFormOpened).toBe(2);
  });

  it("averages the middle two for an even count", async () => {
    await postEvents(crewCookie, {
      sessionId: "s1",
      events: [
        ev("trip_saved", { path: "autofill", legs: 1, msSinceOpen: 1000 }),
        ev("trip_saved", { path: "autofill", legs: 1, msSinceOpen: 3000 }),
      ],
    });
    const body = (await (await getUsage(viewerCookie)).json()) as UsageResponse;
    expect(body.users.find((u) => u.email === CREW)!.medianMsToSave).toBe(2000);
  });

  it("accepts the old shapes and the new props, and 400s on an unknown step or a bad flight no", async () => {
    const ok = await postEvents(crewCookie, {
      sessionId: "s1",
      events: [
        ev("add_form_opened", {}),
        ev("add_form_opened", { entry: "plus" }),
        ev("flight_lookup", { result: "found", ms: 1 }),
        ev("flight_lookup", { result: "unknown", ms: 1, flightNo: "EK9999" }),
        ev("trip_saved", { path: "autofill", legs: 2, msSinceOpen: 5, legsEdited: 1 }),
        ev("form_step", { step: "time_edited", msSinceOpen: 5 }),
        ev("form_left", { lastStep: "lookup_unknown", msSinceOpen: 5, reason: "hidden" }),
        ev("form_resumed", { awayMs: 5 }),
      ],
    });
    expect(ok.status).toBe(204);
    for (const bad of [
      ev("form_step", { step: "clicked_ad", msSinceOpen: 5 }),
      ev("flight_lookup", { result: "unknown", ms: 1, flightNo: "ek 12; drop" }),
      ev("flight_lookup", { result: "unknown", ms: 1, flightNo: "EK1234567" }),
      ev("add_form_opened", { entry: "billboard" }),
      ev("form_left", { lastStep: "opened", msSinceOpen: 5, reason: "bored" }),
    ]) {
      expect((await postEvents(crewCookie, { sessionId: "s1", events: [bad] })).status).toBe(400);
    }
  });

  it("summarises missing flights, time edits, entries, abandons, sittings and form timelines", async () => {
    const t = now - 100_000;
    await postEvents(crewCookie, {
      sessionId: "a",
      events: [
        // Form 1: opened from a day tap, a time edited, saved.
        ev("add_form_opened", { entry: "day" }, t),
        ev("flight_lookup", { result: "found", ms: 100, flightNo: "EK001" }, t + 1000),
        ev("form_step", { step: "time_edited", msSinceOpen: 9000 }, t + 9000),
        ev("form_step", { step: "submit_pressed", msSinceOpen: 10000 }, t + 10000),
        ev("trip_saved", { path: "autofill", legs: 2, msSinceOpen: 10500, legsEdited: 1 }, t + 10500),
        // Form 2: the blank form after the save; an unknown flight, hidden, back, closed.
        ev("add_form_opened", { entry: "after_save" }, t + 20000),
        ev("flight_lookup", { result: "unknown", ms: 100, flightNo: "EK999" }, t + 21000),
        ev("form_left", { lastStep: "lookup_unknown", msSinceOpen: 2000, reason: "hidden" }, t + 22000),
        ev("form_resumed", { awayMs: 60000 }, t + 82000),
        ev("flight_lookup", { result: "error", ms: 100, flightNo: "EK999" }, t + 83000),
        ev("form_left", { lastStep: "lookup_error", msSinceOpen: 64000, reason: "closed" }, t + 84000),
        // Form 3: an old page, no entry; saved.
        ev("add_form_opened", {}, t + 90000),
        ev("trip_saved", { path: "manual", legs: 1, msSinceOpen: 5000 }, t + 95000),
      ],
    });
    await postEvents(crewCookie, {
      sessionId: "b",
      events: [ev("flight_lookup", { result: "unknown", ms: 1, flightNo: "EK777" }, t - 50_000)],
    });

    const crew = ((await (await getUsage(viewerCookie)).json()) as UsageResponse).users.find(
      (u) => u.email === CREW,
    )!;
    expect(crew.missingFlights).toEqual([
      { flightNo: "EK999", unknown: 1, error: 1 },
      { flightNo: "EK777", unknown: 1, error: 0 },
    ]);
    // The manual save carries no legsEdited and counts on neither side.
    expect(crew.timeEdits).toEqual({ legsEdited: 1, legsAutofilled: 2 });
    expect(crew.entries).toEqual({ day: 1, after_save: 1, unrecorded: 1 });
    expect(crew.formLeft).toEqual({ closed: { lookup_error: 1 }, hidden: { lookup_unknown: 1 } });
    // Saves at t+10500 and t+95000 in session a; b saved nothing.
    expect(crew.sittings).toEqual([{ startedAt: t, saved: 2, medianGapMs: 84500 }]);

    expect(crew.forms.map((f) => [f.entry, f.outcome])).toEqual([
      ["unrecorded", "saved"],
      ["after_save", "left"],
      ["day", "saved"],
    ]);
    const first = crew.forms[2]!;
    expect(first.steps.map((s) => [s.label, s.gapMs])).toEqual([
      ["opened", 0],
      ["lookup_found", 1000],
      ["time_edited", 8000],
      ["submit_pressed", 1000],
      ["saved", 500],
    ]);
    expect(first.steps.filter((s) => s.longest).map((s) => s.label)).toEqual(["time_edited"]);
    // The 60s away is shown, but the longest WORKING gap is the 1s ones around it.
    const second = crew.forms[1]!;
    expect(second.steps.map((s) => s.label)).toEqual([
      "opened",
      "lookup_unknown",
      "left_hidden",
      "resumed",
      "lookup_error",
      "left_closed",
    ]);
    expect(second.steps.find((s) => s.label === "resumed")!.gapMs).toBe(60000);
    expect(second.steps.find((s) => s.longest)!.label).not.toBe("resumed");
  });

  it("caps recent events at 30", async () => {
    const events = Array.from({ length: 20 }, () => ev("tab_viewed", { tab: "share" }));
    await postEvents(crewCookie, { sessionId: "s1", events });
    await postEvents(crewCookie, { sessionId: "s1", events });
    const body = (await (await getUsage(viewerCookie)).json()) as UsageResponse;
    expect(body.users.find((u) => u.email === CREW)!.recent).toHaveLength(30);
  });
});
