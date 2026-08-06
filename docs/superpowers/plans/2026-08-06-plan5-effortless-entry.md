# Plan 5: Effortless Trip Entry (calendar-first + schedule autofill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adding a known flight takes two typed characters groups (flight no + confirm), not six fields: calendar picks the day, the schedule reference fills origin/dest/times, report auto-derives. User complaint driving this: "adding trips is very uncomfortable, requires many many depths."

**Architecture:** New D1 table `flight_schedules` (reference layer per spec §5) seeded from a committed JSON of EK schedule patterns; `GET /api/schedule/lookup?flight_no=&date=` resolves a flight number + date to legs (times local per airport, converted client-side for display); user save = existing POST /api/trips unchanged; confirmed entries upsert the reference (crowd layer, spec §5.2). TripForm becomes a stepper: day (from calendar context) → flight no (autofill fires) → confirm/adjust → save.

**Tech Stack:** existing. Seed data: committed JSON built from public schedule sources (accuracy = best-effort seed; crowd layer corrects — per spec §5 "degrades gracefully").

**Spec:** docs/superpowers/specs/2026-08-05-pwa-rework-design.md §5 (autofill + suggestion + crowd), §2 (flight_schedules shape)

## Global Constraints

- Branch `feat/plan5-effortless-entry`. Full gate every task (`pnpm typecheck && pnpm test` + web build + e2e when flows touched). Tokens/amber discipline unchanged. Commit trailers as on this branch.
- Autofill NEVER blocks manual entry: unknown flight number → form expands to full manual fields exactly as today (graceful degradation, spec §5.4).
- Reference times are LOCAL wall times + day offsets per airport (that's how schedules are published); conversion to UTC uses existing wallToUtc + airports.tz at save time.
- Seed accuracy: EK flight numbers/routes are stable; exact times drift by season. Seed marks rows `confirm_count=0`; UI shows autofilled times as editable prefills, never locked values.
- report_utc rule unchanged (dep − 90m default, editable).

---

### Task 1: flight_schedules table + seed

**Files:**
- Create: `worker/src/db/schedule-schema.ts` (re-export via schema.ts), new migration in `drizzle/`, `scripts/ek-schedules.json`, `scripts/seed-schedules.sql` generator note, `worker/test/schedule-schema.test.ts`
- Modify: `worker/src/db/schema.ts`

**Interfaces:**
- Table per spec §2: `flight_schedules(flight_no TEXT, leg_seq INTEGER default 0, origin TEXT(3), dest TEXT(3), dep_local TEXT /*HH:MM*/, arr_local TEXT, day_offset INTEGER default 0, days_of_week TEXT /*"1234567" subset*/, valid_from TEXT nullable, valid_to TEXT nullable, confirm_count INTEGER default 0, last_confirmed_at INTEGER nullable, PRIMARY KEY(flight_no, leg_seq))`.
- Seed JSON: ≥80 EK mainline patterns covering the 108 seeded airports' trunk routes (EK001/002 LHR, EK011/012 LGW, EK029/030 MAN, EK043/044 DME, EK073/074 CDG, EK087/088 ZRH, EK141/142 AMS, EK203/204 JFK, EK211/212 IAH, EK215/216 LAX, EK241/242 YYZ, EK261/262 GRU, EK318/319 NRT, EK322/323 ICN(via?)... EK384/385 HKG, EK404/405 MEL, EK412/413 SYD, EK418/419 BKK?, EK432/433 BNE, EK448/449 AKL, EK500/501 BOM, EK524/525 HYD, EK568/569 BLR?, EK612/613 KHI, EK652/653 CMB, EK706/707 SEZ, EK720/721 CAI?, EK760/761 JNB, EK772/773 CPT, EK800/801 BAH?, EK862/863 AMM?, EK958/959 BEY? — implementer: verify flight-number↔route pairs against current public sources (firecrawl flightradar24/flightconnections route pages; fallback: mark uncertain rows days_of_week "1234567" and approximate times; accuracy note per Global Constraints — seed is a prefill starting point, crowd corrects). Times as local HH:MM + day_offset. Multi-leg numbers (e.g. DXB→SYD→CHC style) use leg_seq.
- Seed applied local + remote (same wrangler d1 execute file pattern as airports).

- [ ] **Step 1:** Failing schema test (table exists, PK composite, seed loaded: EK412 row origin DXB dest SYD).
- [ ] **Step 2:** Schema + drizzle-kit migration + seed build + apply local/remote; tests green; full gate. Commit `feat(worker): flight_schedules reference table + EK seed`.

---

### Task 2: lookup + confirm API

**Files:**
- Create: `worker/src/schedule.ts`, `worker/test/schedule.test.ts`; Modify: `worker/src/index.ts` (mount), `shared/src/index.ts` (types)

**Interfaces:**
- `GET /api/schedule/lookup?flight_no=EK412&date=2026-08-20` (auth required) → `{ legs: [{ legSeq, origin, dest, depLocal, arrLocal, dayOffset, originTz, destTz, confirmCount }] } | 404 {error:"unknown_flight"}`. Date used for days_of_week filter (weekday in ORIGIN airport tz) + validity window; tz resolved from airports table.
- `POST /api/schedule/confirm` (auth) body `{ flightNo, legSeq, origin, dest, depLocal, arrLocal, dayOffset }` → upsert: matching row → confirm_count+1 + last_confirmed_at + times updated; new → insert confirm_count=1. Called by client after successful trip save that used/edited autofill. Zod-validated.
- Case-insensitive flight_no normalization (EK412 = ek412), zod flight-no regex reused.

- [ ] **Step 1:** Failing tests: lookup known (EK412 Thu → legs w/ tz), unknown → 404, wrong-weekday flight → 404 or legs-empty (pick 404, document), confirm upsert both branches, unauth 401.
- [ ] **Step 2:** Implement; green; full gate. Commit `feat(worker): schedule lookup + crowd confirm endpoints`.

---

### Task 3: TripForm rebuilt as calendar-first stepper

**Files:**
- Modify: `web/src/TripForm.tsx`, `web/src/TripForm.test.tsx`, `web/src/App.tsx`, `web/src/CrewHome.tsx`, `web/src/api.ts` (lookupSchedule, confirmSchedule helpers)

**Interfaces (the UX spec — binding):**
- "Add trip" (from ANY entry point incl. list view) → step 1 = compact month calendar (reuse TripsCalendar in picker mode — add `mode?: "picker"` prop: no trip markers needed, just day pick) defaulting to current month; tapping a day from the main calendar view SKIPS step 1 (date already known).
- Step 2 = single prominent input: "Flight number" (autofocus, .num, uppercase) + muted hint "e.g. EK412". On valid pattern + debounce (400ms) → lookupSchedule(flightNo, date).
  - HIT: show autofill card per leg — route (DXB → SYD), dep/arr LOCAL times prefilled + editable inline, report chip ("Report 08:45 · tap to edit" — expands to time input, amber .num), "+N day" arrival marker. Multi-leg hits render all legs. One amber CTA "Add trip". Muted line: "times from schedule — edit if your roster differs".
  - MISS (404): inline muted "unknown flight — enter details" + expand to today's full manual fields (origin/dest/dep/arr/report) prefilled with picked date.
- Save path: convert to UTC exactly as today (wallToUtc + airport tz — tz comes from lookup response or airport fetch on manual path); after 201, if autofill was used, fire-and-forget confirmSchedule (edited times win — send what was saved).
- Old multi-leg "Add leg" preserved on the manual path only; autofill path derives legs from lookup.
- data-testids: flightno-input, autofill-card, autofill-dep, autofill-arr, report-chip, manual-expand.

- [ ] **Step 1:** Failing RTL tests: date-picked → flight input focus; mock lookup hit → card with prefilled times + save posts correct UTC payload + confirm called with saved times; mock 404 → manual expand; report chip edit.
- [ ] **Step 2:** Implement; all existing tests updated honestly; full gate. Commit `feat(web): calendar-first stepper with schedule autofill`.

---

### Task 4: E2E + deploy + live verify

**Files:**
- Modify: `e2e/roster.spec.ts` (or new `e2e/autofill.spec.ts`)

- [ ] **Step 1:** E2E: signed in → calendar → tap day → type EK412 → autofill card appears (local wrangler dev has seeded schedules) → save → crew home shows trip with schedule-derived report time; second spec: unknown flight (XX999) → manual expand path still works end-to-end.
- [ ] **Step 2:** Green x2; full gate; `pnpm run deploy`; live verify: lookup endpoint on prod returns EK412 legs (curl with session), UI autofill works (controller does Playwright pass). Commit `feat(e2e): autofill + manual fallback coverage`.
