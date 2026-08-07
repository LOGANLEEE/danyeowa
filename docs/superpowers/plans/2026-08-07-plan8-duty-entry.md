# Plan 8: Complete Duty Entry (return suggestion + turnaround chaining) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One sheet session captures a whole duty: after adding an outbound, the sheet offers the return flight with layover badges (one tap appends into the same trip); before saving, a "+ add flight" control chains a second flight number (turnarounds become one entry).

**Architecture:** New `GET /api/schedule/suggest?origin=&date=&home=` (auth) implementing spec §5.2: schedule rows departing `origin` whose dest == home base (DXB default), ranked: flight_no±1 sibling of the just-added outbound first, then by layover length ascending buckets; response includes computed layover hours vs a supplied `arrivedIso`. Client: `useTripEntry` gains `appendFlight(flightNo)` (second lookup merged into legs with correct date chaining via existing `legDatesFromPicked` continuation + roll-forward) — trip payload stays ONE trip with combined legs (leg_seq continues). DaySheet: return-suggestion chips render in the rapid "added" state when the just-added trip ends away from home; "+ add flight" inline control in the preview state before save.

**User decisions (2026-08-07):** return suggestion + turnaround selected; duty types (training/standby) explicitly future; edit-surface unification not selected (backlog).

**Spec:** docs/superpowers/specs/2026-08-05-pwa-rework-design.md §5.2 (suggest), §5.3 (one confirm saves whole trip).

## Global Constraints

- Branch `feat/plan8-duty-entry` from post-#12 main. Full gate each task; e2e respects the 3-signin/60s OTP ceiling (suite is AT ceiling — new spec must reuse an existing signed-in session inside share/roster specs OR consolidate; do NOT add a 4th sign-in).
- Suggest endpoint auth'd; zod query validation; 200 with `{ suggestions: [...] }` possibly empty — never 404 (empty = UI hides section).
- Payloads remain byte-compatible with existing POST /api/trips (combined legs, leg_seq sequential, report rules unchanged: leg-0 report editable, continuation legs no report).
- Return chip ranking: sibling flight_no (±1, zero-padded aware: EK412→EK413) pinned first when present; then layover ascending. Max 4 chips. Layover badge text: "24h"/"2d 3h" style via shared helpers.
- Tokens/theming discipline; both themes; 44px targets.

---

### Task 1: /api/schedule/suggest

**Files:** worker/src/schedule.ts (+tests), shared/src/index.ts (SuggestResponse types)

**Interfaces:** `GET /api/schedule/suggest?origin=SYD&date=2026-08-21&outbound=EK412&arrivedIso=2026-08-21T17:45:00.000Z` → `{ suggestions: [{ flightNo, legs: [ScheduleLeg...], layoverHours (from arrivedIso to suggestion's first dep as UTC — compute via schedule local times + origin tz + date resolution: candidate dep date = first date >= `date` matching days_of_week), sibling: boolean }] }`. Candidates: schedule rows leg0 origin == origin AND final-leg dest == home (multi-leg allowed). date window: search up to 7 days forward for each candidate's next operating day. Auth 401; zod on all params; empty OK.
- [ ] TDD: EK413 SYD→DXB sibling-pinned for outbound EK412 with layoverHours computed vs fixture arrivedIso (hand-verifiable value in test comment); non-sibling ranking by layover; empty for origin with no home-bound rows; 401; malformed params 400. Full gate. Commit `feat(worker): return-flight suggestion endpoint`.

---

### Task 2: useTripEntry.appendFlight + "+ add flight" (turnaround path)

**Files:** web/src/useTripEntry.ts (+tests), web/src/DaySheet.tsx (+tests), web/src/api.ts (suggestReturns helper)

**Interfaces:** `appendFlight(flightNo)` — second lookup; merged legs list: appended flight's legs dated via continuation rules (first appended leg's date = last existing leg's arrival local date, roll-forward guard applies); preview shows combined chain with per-leg cards (existing UI pattern); removing appended flight (small ✕ on its card) reverts. Save = one POST (combined legs). "+ add flight" muted control under the preview card (preview state only). testids: append-flight, appended-card, remove-appended.
- [ ] TDD incl. payload assertion: EK097 DXB→FCO + appended EK098 FCO→DXB same date → one trip, 2 legs, leg dates correct (recompute expected UTC in test comments); revert path. Full gate. Commit `feat(web): chain second flight into one trip`.

---

### Task 3: Return-suggestion chips in rapid state

**Files:** web/src/DaySheet.tsx (+tests), api.ts

**Interfaces:** In "added" state, when saved trip's final dest ≠ home base: fire suggestReturns(dest, nextDayIso, outboundFlightNo, lastArrIso); render "↩ Return" chip row ABOVE recent chips: "↩ EK413 · Sat 23 · 2d 3h layover" (max 3). Tap → opens add-mode prefilled on the suggestion's operating date with flightNo set + lookup fired (reuses existing flow — the suggestion date REPLACES banner next-date for this add). Suggestions hidden when empty/error (fire-and-forget fetch, catch → hide). testid: return-chip-<flightNo>.
- [ ] TDD: chips render from mocked suggest; tap → sheet lands in add-mode with date+flight prefilled; hidden on empty; hidden when trip ends at home. Full gate. Commit `feat(web): return-flight chips after outbound add`.

---

### Task 4: E2E + deploy

**Files:** extend e2e/autofill.spec.ts (NO new sign-in — weave into existing signed-in flow)

- [ ] Scenario add: within existing autofill spec session — add EK412 → rapid state shows ↩ EK413 chip with computed layover text → tap → autofill card for EK413 on correct date → save → calendar shows both spans; turnaround: day sheet EK097 → + add flight EK098 → one trip two legs verified via Trips tab row count. Green x2; full gate; deploy; prod sanity (auth'd endpoints 401 unauth). Controller UI pass after. Commit `feat(e2e): return suggestion + turnaround coverage`.
