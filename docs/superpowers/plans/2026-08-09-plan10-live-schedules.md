# Plan 10: Live Schedule Fetch + Self-Warming Cache + Flight-Code-Only Entry

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing a flight code is the entire input. Real schedule data comes from a live source on first request and is cached in D1 forever; the app gets more accurate the more it's used. Wrong guessed seed data is purged. The "Report (local)" field disappears from entry (still displayed on crew screens, still stored, always derived).

**User statements driving this (2026-08-09):** "EK372 is actually DXB to Bangkok instead of Taipei" (seed is wrong) · "fetch real data and save/caching them, service side, if it is first time … then we're gonna have more cache the data with corrected version" · "completely remove Report (local)" · "ultimately just get the user gonna just put the flight code. That's it."

**Architecture:** `flight_schedules` becomes a CACHE, not a seed table. Lookup miss (or stale row) → `resolveSchedule(flightNo, date)` → provider chain: (1) scraper provider (flightradar24 / FlightAware flight page via existing scrape tooling patterns, parsed server-side), (2) API provider (AeroDataBox via RapidAPI) when `AERODATABOX_KEY` secret exists, (3) give up → client shows manual entry. Successful resolution writes rows with `source='live'`, `fetched_at`, `confirm_count=0`. Existing crowd-confirm still upgrades rows. Seeded-but-unverified rows are DELETED (they are actively wrong); the ~20 live-source-verified rows stay as `source='seed-verified'`.

**Spec:** supersedes spec §5 seeding strategy (crowdsource + one-time scrape) with cache-on-demand. Update the spec file in T1.

## Global Constraints

- Branch `feat/plan10-live-schedules`. Full gate each task; e2e at OTP ceiling — no new sign-ins.
- Provider calls happen ONLY on cache miss, server-side, never from the browser. Hard timeout 6s per provider, total budget 10s; on timeout → treat as miss (client falls back to manual entry) — NEVER block the sheet indefinitely.
- Cache rows carry `source` ('live-scrape' | 'live-api' | 'seed-verified' | 'crowd') and `fetched_at`; a row older than 90 days with confirm_count=0 is treated as stale → re-fetch in background (best-effort, don't block the response; serve the stale row immediately).
- Scraper: respect robots-ish etiquette — single request per miss, cached forever after; no bulk crawling; User-Agent identifies the app. If a source blocks, fail soft to next provider.
- NEVER store provider API keys in files; `AERODATABOX_KEY` via `wrangler secret put` (user-supplied later; code must work without it).
- Report time: remove from ALL entry UI (add + edit + manual fallback). `report_utc` still computed server-side as `dep_utc − 90m` on create when absent, still editable via PATCH API (kept for a future settings-level "my report lead" pref), still rendered on crew home/day detail/trips.
- Tests must not hit the network: provider layer is an injectable interface; unit tests use fixtures; ONE integration test may hit the real provider behind an env-gated skip (default skipped in CI).

---

### Task 1: Provider interface + scraper + API fallback (server, no wiring)

**Files:** `worker/src/schedule-providers/index.ts` (interface + chain), `.../scrape-fr24.ts`, `.../aerodatabox.ts`, tests + fixtures (`worker/test/fixtures/fr24-ek372.html`, `aerodatabox-ek372.json`), shared types

**Interfaces:**
- `type ProviderLeg = { origin, dest, depLocal 'HH:MM', arrLocal 'HH:MM', dayOffset, daysOfWeek? }`
- `interface ScheduleProvider { name: string; fetchFlight(flightNo: string, dateIso: string, signal: AbortSignal): Promise<ProviderLeg[] | null> }`
- `resolveFromProviders(flightNo, dateIso, env, deps?)`: tries scraper then API (if key), 6s each, returns `{ legs, source } | null`. Deps injectable for tests.
- Scraper: fetch flight page, parse route + times. Implementer MUST verify the real page shape live (use firecrawl/crawl4ai to fetch one page, save as fixture, write parser against it) — EK372 is the canonical fixture and MUST parse to DXB→BKK (proving the seed wrong and the parser right).
- API provider: AeroDataBox schedule endpoint shape (implementer verifies current docs via context7/web); returns null without key.
- [ ] Failing tests from fixtures → implement → gate. Commit `feat(worker): schedule provider chain (scrape + api fallback)`.

---

### Task 2: Cache-on-miss wiring + stale refresh + bad-seed purge

**Files:** `worker/src/schedule.ts` (lookup path), `worker/src/db/schedule-schema.ts` (+migration: `source TEXT`, `fetched_at INTEGER`), `scripts/ek-schedules.json` (prune), `scripts/seed-schedules.sql` (regen), migration to DELETE unverified rows, tests

**Interfaces:**
- `GET /api/schedule/lookup` on miss → `resolveFromProviders` → insert rows (`source`, `fetched_at=now`, `confirm_count=0`) → return them exactly like a cache hit (client sees no difference except latency).
- Hit path unchanged; if hit row is stale (>90d, confirm_count=0) → return immediately + `ctx.waitUntil` background refresh.
- Seed pruning: keep ONLY the 20 rows the T1-of-plan5 report listed as live-verified (read that report; if list unavailable, keep rows whose flight numbers appear in that report's verified list — implementer must enumerate them in their report). All others deleted via migration (`DELETE FROM flight_schedules WHERE source IS NULL OR source='seed-approx'`) after marking kept ones `source='seed-verified'`.
- EK372 specifically: must resolve DXB→BKK after purge+live fetch (integration-style test with mocked provider returning the fixture).
- [ ] Failing tests (miss→fetch→cached→second call hits cache without provider; stale refresh; purge migration leaves only verified) → implement → migrate local+remote → gate. Commit `feat(worker): cache-on-miss schedule resolution, purge guessed seed`.

---

### Task 3: Flight-code-only entry (remove report from UI)

**Files:** `web/src/DaySheet.tsx`, `web/src/TripForm.tsx`, `web/src/useTripEntry.ts`, `web/src/TripDetail.tsx`, tests

**Interfaces:**
- Add flow: flight code input → autofill card shows route + times (editable) — NO report field, NO report chip. Save posts without `reportUtc`; server derives.
- Manual fallback: origin/dest/dep/arr only (no report row).
- Edit (TripDetail + sheet edit mode): times editable, report row REMOVED from the form; report still shown read-only in the summary line.
- Crew home / day detail / trips list: report display UNCHANGED (still the hero number).
- Loading state during live fetch: flight input shows a subtle "checking schedule…" muted line (provider latency up to ~6s); Add disabled until resolved or fallback shown.
- [ ] Failing tests (no report input rendered anywhere in entry; payload omits reportUtc; server-derived report still displays; loading state) → implement → gate + e2e updates (specs currently assert report editing in entry — update honestly). Commit `feat(web): flight-code-only entry, report removed from forms`.

---

### Task 4: Deploy + live verification + docs

- [ ] Deploy; live-verify on prod with a REAL flight the seed never had (e.g. EK372): sign in, add via flight code only, confirm route is DXB→BKK and cached (second lookup fast, D1 row present with source='live-*'). Curl-level evidence in report + controller UI pass.
- [ ] Update spec §5 to describe cache-on-demand (supersede the seed strategy paragraph). Commit `docs: schedule cache supersedes seed strategy` + `feat(e2e): flight-code-only entry coverage` if e2e changes land here.
