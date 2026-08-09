import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import { seedAirports } from "../src/db/seed-airports";
import { seedSchedules } from "../src/db/seed-schedules";
import type { Env } from "../src/index";
import { refreshScheduleFromProviders } from "../src/schedule";
import { signInAs } from "./helpers";
// @ts-expect-error - ?raw has no type declaration in this project
import fr24Ek372Html from "./fixtures/fr24-ek372.html?raw";

beforeEach(async () => {
  const db = drizzle(env.DB, { schema });
  await seedAirports(db);
  await seedSchedules(db);
});

describe("GET /api/schedule/lookup", () => {
  // All fetches in this describe block share one synthetic test IP, so sign in once
  // (same pattern as trips.test.ts) rather than per-test, to stay under the
  // 3-per-60s-per-IP OTP rate limit.
  let cookie: string;
  beforeAll(async () => {
    cookie = await signInAs("schedule-lookup@example.com");
  });

  it("401s when unauthenticated", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK412&date=2026-08-20",
    );
    expect(res.status).toBe(401);
  });

  it("returns all legs for a known multi-leg flight number, ordered by leg_seq, with tz resolved", async () => {
    // 2026-08-20 is a Thursday; EK412 is seeded as daily ("1234567") so it always matches.
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK412&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      legs: Array<{
        legSeq: number;
        origin: string;
        dest: string;
        depLocal: string;
        arrLocal: string;
        dayOffset: number;
        originTz: string;
        destTz: string;
        confirmCount: number;
      }>;
    }>();
    expect(body.legs).toHaveLength(2);
    expect(body.legs[0]).toMatchObject({
      legSeq: 0,
      origin: "DXB",
      dest: "SYD",
      depLocal: "10:15",
      arrLocal: "06:00",
      dayOffset: 1,
      originTz: "Asia/Dubai",
      destTz: "Australia/Sydney",
      confirmCount: 0,
    });
    expect(body.legs[1]).toMatchObject({
      legSeq: 1,
      origin: "SYD",
      dest: "CHC",
    });
  });

  it("is case-insensitive on flight_no", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=ek412&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
  });

  it("404s with unknown_flight when the cache misses AND every provider misses (fetch returns 404)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response("not found", { status: 404 }));
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=XX999&date=2026-08-20",
        { headers: { Cookie: cookie } },
      );
      expect(res.status).toBe(404);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("unknown_flight");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("404s with not_scheduled_that_day when the date's weekday (origin tz) isn't in days_of_week", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.flightSchedules).values({
      flightNo: "EK777",
      legSeq: 0,
      origin: "DXB",
      dest: "LHR",
      depLocal: "09:00",
      arrLocal: "13:00",
      dayOffset: 0,
      // Only operates Mon (1) - excludes Thursday (4), 2026-08-20's ISO weekday.
      daysOfWeek: "1",
    });

    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK777&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not_scheduled_that_day");
  });

  it("respects the validity window (valid_from/valid_to)", async () => {
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.flightSchedules).values({
      flightNo: "EK888",
      legSeq: 0,
      origin: "DXB",
      dest: "LHR",
      depLocal: "09:00",
      arrLocal: "13:00",
      dayOffset: 0,
      daysOfWeek: "1234567",
      validFrom: "2026-09-01",
      validTo: "2026-09-30",
    });

    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=EK888&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(404);
  });

  it("400s on a malformed flight_no", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/lookup?flight_no=1234&date=2026-08-20",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(400);
  });

  // Plan 10 T2: cache-on-miss + stale-refresh. Kept in this describe block (reusing its
  // shared `cookie`/IP) rather than a separate describe with its own signInAs, to stay
  // under the 3-per-60s-per-IP OTP rate limit this test file already runs close to.
  it("EK372: cache miss -> provider chain -> resolves DXB->BKK (proving the purged seed wrong, the cache right)", async () => {
    // EK372 was seeded as DXB->TPE (WRONG, confirmed via live scrape - see task-1-report.md)
    // and purged by drizzle/0007_purge_unverified_seed_schedules.sql. Post-purge this is a
    // genuine cache miss that must fall through to the live provider chain. Mock the fr24
    // scraper's HTTP call (the chain's first provider) with the same fixture T1 verified
    // parses to DXB->BKK.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response(fr24Ek372Html));
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK372&date=2026-08-17",
        { headers: { Cookie: cookie } },
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ legs: Array<{ origin: string; dest: string; depLocal: string; arrLocal: string }> }>();
      expect(body.legs).toHaveLength(1);
      expect(body.legs[0]).toMatchObject({ origin: "DXB", dest: "BKK", depLocal: "09:40", arrLocal: "19:25" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    // The resolved leg must now be cached in D1 with live-scrape provenance.
    const row = await env.DB.prepare(
      "SELECT origin, dest, source, fetched_at, source_date_iso, confirm_count FROM flight_schedules WHERE flight_no = 'EK372' AND leg_seq = 0",
    ).first<{ origin: string; dest: string; source: string; fetched_at: number; source_date_iso: string; confirm_count: number }>();
    expect(row).toMatchObject({ origin: "DXB", dest: "BKK", source: "live-scrape", confirm_count: 0 });
    expect(row?.fetched_at).toBeGreaterThan(0);
    expect(row?.source_date_iso).toBe("2026-08-17");
  });

  it("second lookup for the same flight hits the cache - provider is NOT called again", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCallCount = 0;
    globalThis.fetch = () => {
      fetchCallCount++;
      return Promise.resolve(new Response(fr24Ek372Html));
    };
    try {
      const first = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK373&date=2026-08-17",
        { headers: { Cookie: cookie } },
      );
      expect(first.status).toBe(200);
      expect(fetchCallCount).toBe(1);

      const second = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK373&date=2026-08-17",
        { headers: { Cookie: cookie } },
      );
      expect(second.status).toBe(200);
      // Still 1 - the second call was served entirely from the D1 cache row the first
      // call wrote, with no provider fetch at all.
      expect(fetchCallCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("provider-null (all providers miss) -> 404 unknown_flight, client falls back to manual entry", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response("blocked", { status: 403 }));
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=XX111&date=2026-08-20",
        { headers: { Cookie: cookie } },
      );
      expect(res.status).toBe(404);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("unknown_flight");
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Nothing was written to the cache for a fully-missed flight.
    const row = await env.DB.prepare(
      "SELECT * FROM flight_schedules WHERE flight_no = 'XX111'",
    ).first();
    expect(row).toBeNull();
  });

  // Review fix: a live-resolved flight can touch an airport outside the 108-row seed
  // (providers return arbitrary real-world routes, unlike the old static seed). These
  // tests prove that reachable path degrades cleanly instead of 500ing.

  it("fr24-only resolve to an un-seeded airport (no tz metadata available) -> DEGRADES to 404, nothing cached", async () => {
    // ZAG (Zagreb) is not in scripts/airports-ek.json. fr24's HTML only ever carries
    // city+country TEXT for an airport (see ProviderLeg.originAirport doc comment for why
    // that's not safe to turn into an IANA tz) - so this is fr24's OWN un-learnable case,
    // not a fixture gap. Minimal synthetic row: two data-rows (parser only reads the
    // first) with DXB (seeded) -> ZAG (not seeded).
    const zagRowHtml = `<table id="tbl-datatable"><tbody>
      <tr class=" data-row">
        <td class="hidden-xs hidden-sm" data-timestamp="1786945200" data-offset="14400">9:40 AM</td>
        <td title="Dubai International Airport, United Arab Emirates" class="hidden-xs hidden-sm"> Dubai <a href="https://www.flightradar24.com/data/airports/dxb" class="fs-10 fbold">(DXB)</a></td>
        <td title="Zagreb Airport, Croatia" class="hidden-xs hidden-sm"> Zagreb <a href="https://www.flightradar24.com/data/airports/zag" class="fs-10 fbold">(ZAG)</a></td>
        <td class="hidden-xs hidden-sm" data-timestamp="1786945200" data-offset="14400">9:40 AM</td>
        <td class="hidden-xs hidden-sm" data-timestamp="1786958400" data-offset="7200">1:00 PM</td>
      </tr>
      <tr class=" data-row"><td class="hidden-xs hidden-sm" data-timestamp="1786858800" data-offset="14400">9:40 AM</td></tr>
    </tbody></table>`;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response(zagRowHtml));
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK779&date=2026-08-17",
        { headers: { Cookie: cookie } },
      );
      expect(res.status).toBe(404);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("unknown_flight");
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Nothing cached - a leg with an unresolvable airport is dropped, not served/cached
    // with a guessed tz.
    const scheduleRow = await env.DB.prepare(
      "SELECT * FROM flight_schedules WHERE flight_no = 'EK779'",
    ).first();
    expect(scheduleRow).toBeNull();
    const airportRow = await env.DB.prepare("SELECT * FROM airports WHERE iata = 'ZAG'").first();
    expect(airportRow).toBeNull();
  });

  it("AeroDataBox resolve to an un-seeded airport (real IANA tz available) -> self-warms airports, succeeds", async () => {
    // AeroDataBox's response DOES carry a genuine airport.timeZone, unlike fr24 - so this
    // is the case where self-warming is actually safe. fr24 is mocked to miss (403) so the
    // chain falls through to AeroDataBox (AERODATABOX_KEY is set in vitest.config.ts test
    // bindings); the same fetch mock branches by URL to serve each provider differently.
    const aeroDataBoxBody = JSON.stringify([
      {
        departure: {
          airport: { iata: "DXB", name: "Dubai International Airport", timeZone: "Asia/Dubai" },
          scheduledTime: { local: "2026-08-17 09:40+04:00" },
        },
        arrival: {
          airport: { iata: "ZAG", name: "Zagreb Airport", timeZone: "Europe/Zagreb" },
          scheduledTime: { local: "2026-08-17 13:00+02:00" },
        },
      },
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("flightradar24.com")) {
        return Promise.resolve(new Response("blocked", { status: 403 }));
      }
      return Promise.resolve(new Response(aeroDataBoxBody));
    };
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK778&date=2026-08-17",
        { headers: { Cookie: cookie } },
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ legs: Array<{ origin: string; dest: string; destTz: string }> }>();
      expect(body.legs[0]).toMatchObject({ origin: "DXB", dest: "ZAG", destTz: "Europe/Zagreb" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    // ZAG must now exist in `airports`, self-warmed with source='live-api'.
    const airportRow = await env.DB.prepare(
      "SELECT tz, source FROM airports WHERE iata = 'ZAG'",
    ).first<{ tz: string; source: string }>();
    expect(airportRow).toEqual({ tz: "Europe/Zagreb", source: "live-api" });
  });

  it("a stale hit (>90d old, confirm_count=0) is served immediately without waiting on the refresh", async () => {
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      `INSERT INTO flight_schedules
         (flight_no, leg_seq, origin, dest, dep_local, arr_local, day_offset, days_of_week, source, fetched_at, confirm_count)
       VALUES ('EK900', 0, 'DXB', 'TPE', '10:00', '20:00', 0, '1234567', 'live-scrape', ?, 0)`,
    )
      .bind(ninetyOneDaysAgo)
      .run();

    const originalFetch = globalThis.fetch;
    // A provider fetch that never resolves - if the route awaited the refresh before
    // responding, this test would hang/timeout. It passing proves the response returns
    // without waiting on the background refresh, exactly as `waitUntil` promises the
    // response.
    globalThis.fetch = () => new Promise<Response>(() => {});
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK900&date=2026-08-20",
        { headers: { Cookie: cookie } },
      );
      // Served immediately from the stale row - still the ORIGINAL (stale) data, since
      // the never-resolving refresh can't have overwritten it yet.
      expect(res.status).toBe(200);
      const body = await res.json<{ legs: Array<{ origin: string; dest: string }> }>();
      expect(body.legs[0]).toMatchObject({ origin: "DXB", dest: "TPE" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refreshScheduleFromProviders (the function waitUntil backgrounds) overwrites a stale row with fresh provider data", async () => {
    // Exercises the exact function the stale-hit branch hands to `c.executionCtx.waitUntil`
    // - waitUntil intentionally isn't awaited by the response, so it can't be observed via
    // an HTTP round-trip in a test; calling it directly proves the refresh logic itself
    // (provider chain -> cacheProviderLegs) is correct.
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      `INSERT INTO flight_schedules
         (flight_no, leg_seq, origin, dest, dep_local, arr_local, day_offset, days_of_week, source, fetched_at, confirm_count)
       VALUES ('EK903', 0, 'DXB', 'TPE', '10:00', '20:00', 0, '1234567', 'live-scrape', ?, 0)`,
    )
      .bind(ninetyOneDaysAgo)
      .run();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response(fr24Ek372Html));
    try {
      const database = drizzle(env.DB, { schema });
      await refreshScheduleFromProviders(database, env as unknown as Env, "EK903", "2026-08-20");

      const refreshed = await env.DB.prepare(
        "SELECT origin, dest, fetched_at FROM flight_schedules WHERE flight_no = 'EK903' AND leg_seq = 0",
      ).first<{ origin: string; dest: string; fetched_at: number }>();
      expect(refreshed).toMatchObject({ origin: "DXB", dest: "BKK" });
      expect(refreshed?.fetched_at).toBeGreaterThan(ninetyOneDaysAgo);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("a fresh hit (<90d old) does NOT trigger a background refresh", async () => {
    await env.DB.prepare(
      `INSERT INTO flight_schedules
         (flight_no, leg_seq, origin, dest, dep_local, arr_local, day_offset, days_of_week, source, fetched_at, confirm_count)
       VALUES ('EK901', 0, 'DXB', 'NRT', '10:00', '20:00', 0, '1234567', 'live-scrape', ?, 0)`,
    )
      .bind(Date.now() - 1000)
      .run();

    const originalFetch = globalThis.fetch;
    let fetchCallCount = 0;
    globalThis.fetch = () => {
      fetchCallCount++;
      return Promise.resolve(new Response(fr24Ek372Html));
    };
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK901&date=2026-08-20",
        { headers: { Cookie: cookie } },
      );
      expect(res.status).toBe(200);
      expect(fetchCallCount).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("a stale but confirm_count>0 (crowd-confirmed) hit does NOT trigger a background refresh", async () => {
    const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      `INSERT INTO flight_schedules
         (flight_no, leg_seq, origin, dest, dep_local, arr_local, day_offset, days_of_week, source, fetched_at, confirm_count)
       VALUES ('EK902', 0, 'DXB', 'NRT', '10:00', '20:00', 0, '1234567', 'crowd', ?, 3)`,
    )
      .bind(ninetyOneDaysAgo)
      .run();

    const originalFetch = globalThis.fetch;
    let fetchCallCount = 0;
    globalThis.fetch = () => {
      fetchCallCount++;
      return Promise.resolve(new Response(fr24Ek372Html));
    };
    try {
      const res = await SELF.fetch(
        "https://example.com/api/schedule/lookup?flight_no=EK902&date=2026-08-20",
        { headers: { Cookie: cookie } },
      );
      expect(res.status).toBe(200);
      expect(fetchCallCount).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("POST /api/schedule/confirm", () => {
  const confirmBody = {
    flightNo: "EK412",
    legSeq: 0,
    origin: "DXB",
    dest: "SYD",
    depLocal: "10:20",
    arrLocal: "06:05",
    dayOffset: 1,
  };

  let cookie: string;
  beforeAll(async () => {
    cookie = await signInAs("schedule-confirm@example.com");
  });

  it("401s when unauthenticated", async () => {
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmBody),
    });
    expect(res.status).toBe(401);
  });

  it("increments confirm_count and updates times for an existing row (update branch)", async () => {
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(confirmBody),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT confirm_count, dep_local, arr_local, last_confirmed_at FROM flight_schedules WHERE flight_no = 'EK412' AND leg_seq = 0",
    ).first<{
      confirm_count: number;
      dep_local: string;
      arr_local: string;
      last_confirmed_at: number | null;
    }>();
    expect(row?.confirm_count).toBe(1);
    expect(row?.dep_local).toBe("10:20");
    expect(row?.arr_local).toBe("06:05");
    expect(row?.last_confirmed_at).not.toBeNull();
  });

  it("inserts a new row with confirm_count=1 for an unknown flight/leg (insert branch)", async () => {
    const newLeg = {
      flightNo: "EK999",
      legSeq: 0,
      origin: "DXB",
      dest: "JFK",
      depLocal: "08:00",
      arrLocal: "14:00",
      dayOffset: 0,
    };
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(newLeg),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT confirm_count, days_of_week FROM flight_schedules WHERE flight_no = 'EK999' AND leg_seq = 0",
    ).first<{ confirm_count: number; days_of_week: string }>();
    expect(row?.confirm_count).toBe(1);
    // A crowd-inserted row with no prior schedule data defaults to "always match".
    expect(row?.days_of_week).toBe("1234567");
  });

  it("case-insensitive flight_no normalization on confirm", async () => {
    // EK384 is a distinct seeded flight from the update-branch test above (which
    // mutates EK412's confirm_count in this same describe block), so this stays
    // independent of test execution order / storage isolation semantics.
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...confirmBody, flightNo: "ek384", origin: "dxb", dest: "bkk" }),
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT confirm_count FROM flight_schedules WHERE flight_no = 'EK384' AND leg_seq = 0",
    ).first<{ confirm_count: number }>();
    expect(row?.confirm_count).toBe(1);
  });

  it("400s on an invalid body", async () => {
    const res = await SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ flightNo: "EK412" }),
    });
    expect(res.status).toBe(400);
  });

  async function postConfirm(body: unknown) {
    return SELF.fetch("https://example.com/api/schedule/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  it("400s on a malformed depLocal (not HH:MM)", async () => {
    const res = await postConfirm({ ...confirmBody, depLocal: "9am" });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed arrLocal (out-of-range hour)", async () => {
    const res = await postConfirm({ ...confirmBody, arrLocal: "24:00" });
    expect(res.status).toBe(400);
  });

  it("400s when origin equals dest", async () => {
    const res = await postConfirm({ ...confirmBody, origin: "DXB", dest: "DXB" });
    expect(res.status).toBe(400);
  });

  it("400s on a dayOffset outside [0,3]", async () => {
    const res = await postConfirm({ ...confirmBody, dayOffset: 4 });
    expect(res.status).toBe(400);
  });

  it("400s on a legSeq outside [0,5]", async () => {
    const res = await postConfirm({ ...confirmBody, legSeq: 6 });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed flightNo", async () => {
    const res = await postConfirm({ ...confirmBody, flightNo: "412" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/schedule/suggest", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await signInAs("schedule-suggest@example.com");
  });

  it("401s when unauthenticated", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/suggest?origin=CHC&date=2026-08-21&arrivedIso=2026-08-21T00:55:00.000Z",
    );
    expect(res.status).toBe(401);
  });

  it("400s on malformed params (bad origin)", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/suggest?origin=CH&date=2026-08-21&arrivedIso=2026-08-21T00:55:00.000Z",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(400);
  });

  it("400s on malformed arrivedIso", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/schedule/suggest?origin=CHC&date=2026-08-21&arrivedIso=not-a-date",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(400);
  });

  it("returns empty suggestions for an origin with no home-bound rows", async () => {
    // SYD only ever appears as EK412's leg-1 continuation (SYD->CHC) - no seeded
    // flight_no has its leg_seq-0 origin at SYD, so there is no candidate at all.
    const res = await SELF.fetch(
      "https://example.com/api/schedule/suggest?origin=SYD&date=2026-08-21&arrivedIso=2026-08-21T00:55:00.000Z",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ suggestions: unknown[] }>();
    expect(body.suggestions).toEqual([]);
  });

  it("ranks EK412's sibling EK413 first, with hand-verified layoverHours", async () => {
    // EK412 DXB->SYD (dep 10:15 dayOffset1, arr 06:00) -> SYD->CHC (dep 07:45 dayOffset0,
    // arr 12:55) lands the crew at CHC. Query date 2026-08-21 is the CHC-local arrival date;
    // arrivedIso is that 12:55 Pacific/Auckland arrival as a UTC instant.
    //
    // Pacific/Auckland is UTC+12 in August (NZ winter, no DST - NZDT starts late September),
    // so 2026-08-21T12:55 CHC-local = 2026-08-21T00:55:00.000Z. That's this test's arrivedIso.
    //
    // EK413's leg0 (CHC->SYD, dep 14:00 local, dayOffset0) is a same-day operating match
    // (daily schedule, "1234567") for the query date 2026-08-21, so its candidate departure
    // is 2026-08-21T14:00 Pacific/Auckland = 2026-08-21T02:00:00.000Z (same UTC+12 offset,
    // still August/winter, no DST transition between the two instants).
    //
    // layoverHours = (02:00:00Z - 00:55:00Z) = 1h05m = 1.0833... hours.
    const arrivedIso = "2026-08-21T00:55:00.000Z";
    const res = await SELF.fetch(
      `https://example.com/api/schedule/suggest?origin=CHC&date=2026-08-21&outbound=EK412&arrivedIso=${arrivedIso}`,
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      suggestions: Array<{
        flightNo: string;
        legs: Array<{ legSeq: number; origin: string; dest: string }>;
        layoverHours: number;
        sibling: boolean;
        dateIso: string;
      }>;
    }>();

    expect(body.suggestions.length).toBeGreaterThan(0);
    const ek413 = body.suggestions[0]!;
    expect(ek413.flightNo).toBe("EK413");
    expect(ek413.sibling).toBe(true);
    expect(ek413.legs).toHaveLength(2);
    expect(ek413.legs[0]).toMatchObject({ legSeq: 0, origin: "CHC", dest: "SYD" });
    expect(ek413.legs[1]).toMatchObject({ legSeq: 1, origin: "SYD", dest: "DXB" });
    expect(ek413.layoverHours).toBeCloseTo(1.0833333333333333, 6);
    // Same-day operating match (query date === resolved date), per the comment above.
    expect(ek413.dateIso).toBe("2026-08-21");
  });

  it("retries later operating days when the same-day connection is impossible (negative layover)", async () => {
    // Crew arrives CHC at 2026-08-21T03:00:00.000Z - AFTER EK413's same-day departure
    // (2026-08-21T02:00:00.000Z, i.e. 14:00 Pacific/Auckland, per the hand-verified
    // math in the sibling test above). That same-day candidate is a negative layover
    // (dep before arrival), so the endpoint must roll forward to EK413's NEXT
    // operating day (2026-08-22, daily schedule) rather than dropping EK413 entirely.
    //
    // EK413 leg0 dep 2026-08-22T14:00 Pacific/Auckland (still UTC+12, no DST in
    // August/winter) = 2026-08-22T02:00:00.000Z.
    // layoverHours = (2026-08-22T02:00:00.000Z - 2026-08-21T03:00:00.000Z) = 23h exactly.
    const arrivedIso = "2026-08-21T03:00:00.000Z";
    const res = await SELF.fetch(
      `https://example.com/api/schedule/suggest?origin=CHC&date=2026-08-21&outbound=EK412&arrivedIso=${arrivedIso}`,
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      suggestions: Array<{ flightNo: string; layoverHours: number; sibling: boolean; dateIso: string }>;
    }>();

    const ek413 = body.suggestions.find((s) => s.flightNo === "EK413");
    expect(ek413).toBeDefined();
    expect(ek413!.sibling).toBe(true);
    expect(ek413!.layoverHours).toBeCloseTo(23, 6);
    // Rolled forward one day from the query date (2026-08-21) since the same-day departure
    // was a negative layover, per the comment above.
    expect(ek413!.dateIso).toBe("2026-08-22");
  });

  it("ranks non-sibling candidates by layover ascending when no sibling is present", async () => {
    // Seed two DXB-home-bound candidates departing FCO (no ±1-numbered sibling involved
    // here since outbound is omitted): ZZ800 (short layover) should rank before a
    // later-departing same-route candidate. Both rows are seeded explicitly here (rather
    // than relying on scripts/ek-schedules.json, which Plan 10 T2 pruned to only the
    // live-verified rows) so this test doesn't depend on what the seed happens to contain.
    const db = drizzle(env.DB, { schema });
    await db.insert(schema.flightSchedules).values([
      {
        flightNo: "ZZ800",
        legSeq: 0,
        origin: "FCO",
        dest: "DXB",
        depLocal: "13:55",
        arrLocal: "21:35",
        dayOffset: 0,
        daysOfWeek: "1234567",
      },
      {
        flightNo: "ZZ900",
        legSeq: 0,
        origin: "FCO",
        dest: "DXB",
        depLocal: "23:00",
        arrLocal: "07:00",
        dayOffset: 1,
        daysOfWeek: "1234567",
      },
    ]);

    const res = await SELF.fetch(
      "https://example.com/api/schedule/suggest?origin=FCO&date=2026-08-21&arrivedIso=2026-08-21T00:00:00.000Z",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      suggestions: Array<{ flightNo: string; layoverHours: number; sibling: boolean }>;
    }>();

    const flightNos = body.suggestions.map((s) => s.flightNo);
    expect(flightNos).toContain("ZZ800");
    expect(flightNos).toContain("ZZ900");
    // ZZ800 departs FCO 13:55 local same day; ZZ900 departs FCO 23:00 local same day -
    // ZZ800 has the shorter layover from a 00:00Z arrival, so it ranks first.
    const idxZz800 = flightNos.indexOf("ZZ800");
    const idxZz900 = flightNos.indexOf("ZZ900");
    expect(idxZz800).toBeLessThan(idxZz900);
    // Layover values are non-decreasing across the ranked list.
    for (let i = 1; i < body.suggestions.length; i++) {
      expect(body.suggestions[i]!.layoverHours).toBeGreaterThanOrEqual(
        body.suggestions[i - 1]!.layoverHours,
      );
    }
  });

  it("caps raw suggestions at 8", async () => {
    const db = drizzle(env.DB, { schema });
    const extra = Array.from({ length: 10 }, (_, i) => ({
      flightNo: `ZZ${100 + i}`,
      legSeq: 0,
      origin: "SYD",
      dest: "DXB",
      depLocal: "10:00",
      arrLocal: "20:00",
      dayOffset: 0,
      daysOfWeek: "1234567",
    }));
    await db.insert(schema.flightSchedules).values(extra);

    const res = await SELF.fetch(
      "https://example.com/api/schedule/suggest?origin=SYD&date=2026-08-21&arrivedIso=2026-08-21T00:00:00.000Z",
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ suggestions: unknown[] }>();
    expect(body.suggestions.length).toBeLessThanOrEqual(8);
  });
});
