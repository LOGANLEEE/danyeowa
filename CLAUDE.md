# roaster-me

Cabin-crew roster PWA. A crew member types a flight number; the app resolves the schedule,
shows report time first, and (eventually) shares the roster with family.

**Read `docs/DECISIONS.md` before proposing UI or data-model changes.** It records what was
chosen, what was rejected, and why — including things deliberately not built.

## Stack

React 19 + Vite + Tailwind v4 (`web/`) · Hono + Cloudflare Workers + D1 + Drizzle (`worker/`) ·
shared types and time helpers (`shared/`) · better-auth (email OTP + Google) · Vitest unit tests ·
Playwright e2e (`e2e/`) · deployed by GitHub Actions to Cloudflare.

⚠️ `docs/rules/*` describes Expo/Supabase/Jest and is **stale** — a previous incarnation of this
project. Ignore it. `docs/superpowers/plans/*` is accurate but stops at Plan 10 (2026-08-09).

## Workflow — follow this for any feature or fix

1. **Build it.**
2. **Verify it works in a real browser**, with Playwright, against a locally built server — not
   only unit tests. Every UI bug that reached the user this project was invisible to tests:
   a duration label colliding at 390px, a calendar shrink-wrapping, an input triggering iOS zoom.
3. **Write/extend tests** for what you just proved.
4. **Open a PR.** CI runs typecheck, unit tests, e2e, and posts a **preview URL** per PR.
5. **Merge on the user's go.** Merging to `main` auto-deploys to production.

Do not skip step 2 because the tests are green. Green tests have never once caught the class of
bug that actually shipped here.

## Verification discipline

- **Measure, don't eyeball.** Assert widths, computed styles, counts. A screenshot is how the
  calendar-width bug came back three times.
- **Prove the instrument before trusting a negative result.** Two real examples: `boundingBox()`
  ignores clipping by an ancestor's `overflow:hidden`, so a collapsed element still reports its
  full height; and a bundle fetched mid-deploy returns the *previous* hash, which looks exactly
  like a failed deploy. Both produced confident, wrong "it's broken" reports.
- When a check comes back empty/zero/not-found, first ask whether the instrument could see it
  at all.

## Local development

```bash
pnpm dev            # builds web, runs wrangler dev on :8787
pnpm test           # unit (vitest, all packages)
pnpm test:e2e       # playwright — starts its own server
pnpm -r typecheck
```

- **Sign in locally with `logan@example.com` / code `123123`.** Fixed dev OTP, gated on
  `DEV_OTP_FALLBACK` + `DEV_FIXED_OTP_EMAIL` in `.dev.vars`; unreachable in production. Any other
  address gets a random code, readable at `/api/__e2e/last-otp?email=…` or in the wrangler log.
- **Google sign-in does not work on localhost** (redirect URI isn't registered) and cannot work on
  per-PR preview URLs (each gets a new hostname; Google requires exact URIs).
- **Stale `wrangler dev` is a recurring trap.** A dead server keeps the port and serves an *old
  bundle*, so your change appears not to exist. `workerd` can respawn after its parent dies —
  kill the parent, then the child, and confirm the port is free before restarting.

## Layout invariants (each of these has broken at least once)

- The calendar grid must be exactly as wide as the column containing it, in **every** branch —
  including the no-upcoming-duty branch, which is the one that keeps regressing.
- Nothing may scroll horizontally at 390px.
- Every form control must compute to ≥16px, or iOS zooms on focus and wrecks the layout.
  Note a Tailwind `text-sm` on an input **beats** the global 16px floor in `tokens.css`.
- Animate `grid-template-rows` / `transform` / `opacity`. Never `height`, `max-height`, or
  `background-color` — they hit layout or full-surface repaint every frame.

## Conventions

- Semantic colour tokens only (`text-ink`, `bg-card`, `border-edge`, `text-report`…). No raw hex
  outside `tokens.css`, except the departure-board panel, which is deliberately dark in both themes.
- `.num` for anything with digits (tabular figures).
- Touch targets ≥44px.
- Comment only where the *why* isn't obvious. Match surrounding density; this codebase explains
  reasoning, not mechanics.
