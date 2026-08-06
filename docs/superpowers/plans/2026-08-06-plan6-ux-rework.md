# Plan 6: UX Rework (tabs · calendar home · day-sheet rapid entry · system theming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the front end to the user-approved v3 design: bottom-tab app with the month calendar as home, trips added through a chaining day sheet (rapid entry with recent-flight chips), light-first theming that follows the system. User's core pain: day-to-day roster entry must feel effortless.

**Architecture:** Front-end restructure only — every API, the autofill engine, tz math, and e2e-tested logic stay. Theme becomes two token sets on the existing Tailwind v4 `@theme` variables (CSS custom properties swap under `prefers-color-scheme` + a `data-theme` override persisted in localStorage). App shell becomes a 5-slot tab bar (Calendar · Trips · + · Share · Settings). The Plan-5 stepper's lookup/preview/save logic is extracted into a reusable `useTripEntry` hook consumed by the new DaySheet.

**Design source (binding):** approved v3 mockups — artifact "UX Rework v3". Tokens: light ground #fafafa · card #ffffff · ink #1b1d22 · muted #6a7078 · accent #2f6fed · trip-tint #e8f0fe · ok #1e9e6a · edge #ececea; dark ground #15171c · card #1d2027 · ink #e8ebf1 · accent #7ea6f5 · trip-tint #223047 · edge #2a2e37 · amber #ffd57e ONLY for report-time numerals in dark. Rounded-friendly (cards 14px, sheet 22px top radius), soft shadows in light, hairlines in dark.

## Global Constraints

- Branch `feat/plan6-ux-rework`. Full gate every task (`pnpm typecheck && pnpm test` + web build; e2e when flows change). Commit trailers as on this branch.
- NO worker/API changes except where a task explicitly says so. Shared utils only extended, never broken.
- Semantic token names replace the old palette-named classes progressively — a task may not leave the app half-themed: each task's end state renders coherently in BOTH themes.
- Every screen keyboard-accessible; sheet dismissible via scrim tap + Escape; `prefers-reduced-motion` honored on sheet/tab transitions (reuse existing motion tokens, re-timed if needed).
- Existing test suites updated honestly; e2e final rewrite happens in T6 — interim tasks may adjust e2e minimally to stay green.

---

### Task 1: Theme system — semantic tokens, light-first, system + manual override

**Files:** `web/src/tokens.css` (rewrite), `web/index.html` (theme-color both schemes), `web/src/theme.ts` (new: getTheme/setTheme/applyTheme, localStorage "roster-theme": "system"|"light"|"dark"), `web/src/theme.test.ts`, touch every component's classes to semantic names.

**Interfaces:** Semantic tokens (both themes): `--color-ground, -card, -raised, -ink, -ink-muted, -accent, -accent-soft (trip tint), -ok, -edge, -danger` + dark-only `--color-report (#ffd57e; in light = accent)`. Utilities `.num`, `.hairline` kept. `applyTheme()` sets `data-theme` on `<html>`; CSS: light values on `:root`, dark under `@media (prefers-color-scheme: dark)` when data-theme absent/system, and explicit `[data-theme="dark"]` / `[data-theme="light"]` overrides winning both directions.
- [ ] Failing test: theme.ts store logic (system default, override persist, applyTheme attribute). Built-CSS test updated: both theme blocks present.
- [ ] Implement + recolor ALL existing components to semantic classes (mechanical sweep; report-time numerals use `text-report`). Both themes visually coherent (describe both in report). Gate. Commit `feat(web): light-first semantic theme system with system/manual switching`.

---

### Task 2: Tab shell + Settings + Share placeholder

**Files:** `web/src/TabBar.tsx` (+test), `web/src/SettingsView.tsx` (+test), `web/src/ShareView.tsx` (placeholder), `web/src/App.tsx` (signed-in layout = active view + TabBar)

**Interfaces:** Tabs: calendar | trips | add (center, accent square button — behavior in T4: opens day sheet for today/next free day) | share | settings. Active state accent; localStorage NOT used for tab (always open on calendar). SettingsView: email, theme picker (System/Light/Dark radio via theme.ts), home base display (DXB, read-only note), Sign out. ShareView: friendly "Invite family — coming soon" card. TabBar fixed bottom, safe-area padded, hidden when signed out.
- [ ] Failing tests: tab switching renders correct view; settings theme picker calls setTheme; sign-out still works from settings.
- [ ] Implement; CrewHome temporarily becomes the "calendar" tab content unchanged (T3 rebuilds it). Old header slims (wordmark only; email moves to Settings). Gate. Commit `feat(web): bottom tab shell, settings, share placeholder`.

---

### Task 3: Calendar home rebuild

**Files:** `web/src/CalendarHome.tsx` (+test) replacing CrewHome as calendar tab; `web/src/CrewHome.tsx` content reduced/absorbed; TripsCalendar restyled (trip-tint day pills per mock, accent bar, today ring accent)

**Interfaces:** Layout per mock: month header w/ chevrons → weekday row → grid (trip days: accent-soft bg + bar; today: accent ring) → compact next-duty card (route+dates line, flight/trip-length muted line, report line "Report **08:45** · leave home 07:50 · in 13d 15h" — report numeral `text-report`) → tab bar. Status band retired (its info lives in the next-duty card line). List content moves wholly to Trips tab (T2 already routes it — this task moves the component).
- [ ] Failing tests: renders month + next-duty card from trips fixture; day with trip shows marker; tap trip day → onOpenDay(iso) fired (sheet arrives T4).
- [ ] Implement; Trips tab = old list (upcoming rows + TripDetail flow intact). Gate. Commit `feat(web): calendar home with next-duty card`.

---

### Task 4: Day sheet (view + add on any day)

**Files:** `web/src/DaySheet.tsx` (+test), `web/src/useTripEntry.ts` (extracted from TripForm stepper logic, +test), App wiring; TripForm demoted to manual-entry fallback rendered INSIDE sheet when lookup misses

**Interfaces:** Bottom sheet (fixed, translate-y animation, scrim, Escape/scrim dismiss, 22px top radius): opened by tapping any calendar day OR center + (defaults today→next free day). Content: day WITH trip → trip summary + Edit (inline TripDetail essentials) + Delete-with-confirm; day WITHOUT → add flow: flight-no input (autofocus) → autofill preview card (compact per mock: route line, legs line, report line) → "Add to roster" accent CTA; miss → manual fields inline. All reusing useTripEntry (lookup debounce, legDatesFromPicked, wallToUtc save, confirmSchedule fire-and-forget — logic identical to Plan 5, verified by keeping its tests running against the hook).
- [ ] Failing tests: sheet open/dismiss; add flow happy path posts same payload as old stepper (reuse existing fixture expectations — payload must be byte-identical); existing-trip day shows summary+edit+delete.
- [ ] Implement. Gate. Commit `feat(web): day sheet for viewing and adding trips`.

---

### Task 5: Rapid entry chaining + recent chips

**Files:** `web/src/DaySheet.tsx`, `web/src/useRecentFlights.ts` (+test; derive from GET /api/trips client-side — distinct flight_nos by recency, max 4; NO new API)

**Interfaces:** After successful Add: sheet stays; header flips to "✓ Added <date> · next: <next date>" (next = following day skipping days that now have trips; header date tappable → mini inline date strip to adjust); flight-no field clears + refocuses; recent-flight chips row (tap chip = fills field + triggers lookup immediately); "Done for now" outline button dismisses + calendar refetches once at dismiss (not per add — keep adds snappy; optimistic day marking locally).
- [ ] Failing tests: post-add state (header, cleared input, chips render from fixture, chip tap triggers lookup, next-date skip logic, Done dismisses + single refetch).
- [ ] Implement. Gate. Commit `feat(web): rapid roster entry chaining with recent-flight chips`.

---

### Task 6: E2E rewrite + deploy + visual pass

**Files:** `e2e/roster.spec.ts`, `e2e/autofill.spec.ts` rewritten for new flows

- [ ] E2E: sign-in → calendar home renders → tap day → sheet → EK412 autofill → Add → rapid state → chip re-add on next date → Done → both days marked → Trips tab shows both → detail edit → delete both → sign out. Manual-fallback path retained. Green x2. OTP-budget constraint respected (≤3 sign-ins/60s across suite).
- [ ] Full gate; `pnpm run deploy`; report notes controller does the final visual pass (both themes, 390px) after deploy.
