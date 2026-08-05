# Plan 4: Production Polish + Trip Management UI + E2E Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App feels production-grade (motion, background depth, micro-interactions), trips are editable/deletable in the UI, and a committed Playwright e2e suite covers login → create → edit → delete.

**Architecture:** Design work is CSS-first (transitions, keyframes, `prefers-reduced-motion` respected) on the existing token system — no animation libraries. Edit/delete reuse existing PATCH `/api/flights/:id` + DELETE `/api/trips/:id`. E2E: `@playwright/test` in `e2e/` against local `wrangler dev`, OTP retrieved via a test-only route gated by an `E2E_TEST_MODE` var that exists ONLY in local dev config — never in `wrangler.jsonc` vars.

**Tech Stack:** existing + `@playwright/test` (devDep, root).

**User directive (binding):** "make it feel like a well-made app with proper design"; e2e must cover login, register/update/modify/delete rosters (share later, feature not built).

## Global Constraints

- Branch `feat/plan4-polish`. Never commit to main. Full gate every task end (`pnpm typecheck && pnpm test` + web build when web touched).
- Tokens only; amber stays time-critical/CTA; violation red still reserved.
- ALL motion respects `@media (prefers-reduced-motion: reduce)` — animations collapse to none/opacity-only.
- No animation/JS libraries — CSS transitions/keyframes + View element states only.
- E2E_TEST_MODE gating: the OTP-exposure route returns 404 unless `env.E2E_TEST_MODE === "true"`; that var appears ONLY in `.dev.vars`(gitignored) + e2e runner env + vitest bindings — grep wrangler.jsonc to prove absence, and add a worker test asserting the route 404s when var unset.
- Commit trailers as used on this branch.

---

### Task 1: Trip edit + delete UI

**Files:**
- Create: `web/src/TripDetail.tsx`, `web/src/TripDetail.test.tsx`
- Modify: `web/src/CrewHome.tsx` (rows clickable), `web/src/App.tsx` (view state), `web/src/api.ts` (patchFlight, deleteTrip helpers)

**Interfaces:**
- Consumes: PATCH /api/flights/:id (partial LegInput), DELETE /api/trips/:id (204), GET /api/trips.
- Produces: tapping an upcoming row (or next-duty card) opens TripDetail: per-leg display with Edit toggle → inline form (same field conventions as TripForm: wall-time inputs in airport-local tz via wallToUtc/formatLocal round-trip, report editable) → Save (PATCH) / Cancel; trip-level Delete button → inline confirm ("Delete trip? This can't be undone." confirm/cancel, confirm styled `bg-raised` + `text-ink-bright`, NOT violation red per token rules — red stays reserved) → DELETE → back to CrewHome refetched.

- [ ] **Step 1:** Failing RTL tests: row click → detail renders legs; edit → save calls patchFlight with UTC-converted changed fields only; delete confirm flow calls deleteTrip then onDone; cancel paths.
- [ ] **Step 2:** Implement; gate; commit `feat(web): trip detail with edit and delete`.

---

### Task 2: Design elevation — motion + depth

**Files:**
- Modify: `web/src/tokens.css` (motion tokens + keyframes), `web/src/styles.css`, touch component classNames as needed (`App.tsx`, `Landing.tsx`, `Login.tsx`, `CrewHome.tsx`, `TripForm.tsx`, `TripDetail.tsx`)

**Interfaces (the design spec — binding):**
- **Background depth:** ground gets a fixed, very subtle radial glow — `radial-gradient` amber at ~4% opacity from top center fading to ground by 40% viewport height (horizon-glow, instrument vibe) + a second cooler glow bottom-right at 2%. No images, no noise textures, pure CSS. Cards stay `bg-surface` — the glow lives on body only.
- **Entrance motion:** view containers (Landing, Login, CrewHome, TripForm, TripDetail) animate in once: `fade-rise` keyframes (opacity 0→1, translateY 8px→0, 240ms ease-out). Staggered children on CrewHome (status band → duty card → list: 60ms increments via animation-delay classes).
- **Micro-interactions:** buttons: 120ms transition on background/transform, `active:scale-[0.98]`; primary CTA hover brightens (`hover:bg-amber-num` acceptable — amber family stays on CTA); upcoming rows: `hover:bg-raised` + 120ms; inputs already have focus ring — add 120ms border transition.
- **Countdown tick:** next-report relative time gets a subtle change animation — when the minute flips, no jump-cut layout shift (fixed-width `.num` via `tabular-nums` already; just ensure min-width so text doesn't reflow).
- **Reduced motion:** single `@media (prefers-reduced-motion: reduce)` block kills transforms/animations (opacity-only or none).
- **PWA touches while in here:** `theme-color` meta `#121418`, favicon (simple SVG: amber dot + dark ground — inline data URI in index.html), `<meta name="description">`.

- [ ] **Step 1:** Implement motion tokens/keyframes + apply. No test-behavior changes expected — existing tests must stay green unmodified (animations are presentational). Add ONE test: reduced-motion media block exists in built CSS (string assert on dist CSS after build).
- [ ] **Step 2:** Visual checkup evidence (controller does final judgment): screenshots via Playwright at 390px (iPhone) and 1280px, both landing + crew home, attached paths in report.
- [ ] **Step 3:** Gate; commit `feat(web): motion system, background depth, pwa meta`.

---

### Task 3: Committed Playwright e2e suite

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/roster.spec.ts`, `e2e/helpers.ts`; Modify: root `package.json` (script `test:e2e`), `worker/src/index.ts` (test-only OTP route), `worker/test/e2e-route.test.ts`, `.dev.vars.example` (documented, committed — real `.dev.vars` stays gitignored)

**Interfaces:**
- Worker: `GET /api/__e2e/last-otp?email=` → `{ otp }` from the dev-fallback capture, ONLY when `env.E2E_TEST_MODE === "true"`, else 404. Unit test proves 404 when unset.
- `e2e/playwright.config.ts`: `webServer` = `pnpm --filter @roaster/web build && wrangler dev --port 8787` (reuse existing server if running), baseURL http://localhost:8787, chromium only, retries 1.
- `e2e/roster.spec.ts` flow (test account `e2e@local.test`): landing renders → CTA → email OTP sign-in (fetch OTP from __e2e route) → empty state → create 1-leg trip (DXB→LHR fixture) → crew home shows report time (assert exact expected local times computed from fixture) → open detail → edit dep time +1h → save → assert updated report → delete trip → confirm → empty state → sign out → landing.
- Root script: `"test:e2e": "playwright test -c e2e"`. NOT part of `pnpm test` (worker/web unit gates stay fast); CI: separate job, non-blocking initially (`continue-on-error: true`), flips blocking later.

- [ ] **Step 1:** Worker route + unit tests (404 unset / 200 set via test binding) — TDD.
- [ ] **Step 2:** Playwright config + spec; run locally headless until green twice consecutively (flake check).
- [ ] **Step 3:** CI job addition; gate; commit `feat(e2e): playwright suite covering auth + roster lifecycle`.
