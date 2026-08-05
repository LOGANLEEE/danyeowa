# Roaster Me — PWA Rework Design

**Date:** 2026-08-05
**Status:** Approved (brainstorm complete)
**Scope:** Full rework of the existing Expo/React-Native + Supabase app into a web PWA with a Cloudflare backend. Same product: cabin crew manage flight rosters and share them with family/friends.

## Decisions log

| Topic | Decision |
|---|---|
| Product scope | Same product, new stack (roster manage, share, countdown, timezone; notifications parked) |
| Backend | Full Cloudflare: Workers + D1 + Drizzle, better-auth. No Supabase |
| Frontend | Vite + React SPA, TanStack Router/Query, Tailwind, vite-plugin-pwa |
| Repo strategy | Wipe in place on branch `rework/pwa`; git history preserved |
| Brand name | Keep "Roaster Me" for now; rename decision deferred to design workshop |
| Visual design | Fresh brief from scratch; old DESIGN_BRIEF.md ignored; separate design workshop phase |
| Roster input | Manual entry + autofill/suggestion from EK schedule reference data |
| Schedule data | One-time modern scrape as seed + crowdsourced freshness from user entries. Old EK_timetable.pdf (Dec 2007 edition, verified via pdfinfo CreationDate 2007-10-17) discarded as data source — usable only as parser test fixture. No current official EK PDF timetable exists; the c.ekstatic.net "emirates-schedule.pdf" is a March 2026 disruption destination list (no times/flight numbers), useful only to validate seed route coverage |
| Notifications | Web Push (VAPID), NOT webhooks. Parked — designed but built last |

## 1. Architecture

Single Worker serving both the built SPA (static assets binding) and the API (`/api/*` via Hono). One deploy, no CORS, one domain.

```
roaster-me/
├── web/          # Vite + React SPA (PWA)
├── worker/       # Hono API on Cloudflare Worker
│   ├── src/
│   └── drizzle/  # D1 migrations
├── shared/       # zod schemas + types shared web↔worker
├── scripts/      # seed scrape, timetable parsing
└── wrangler.jsonc
```

- **D1** (SQLite) + Drizzle ORM for all data.
- **Auth:** better-auth with email OTP plugin, D1 adapter, httpOnly session cookies.
- **Email:** Resend for OTP mail (free tier 3k/mo).
- **Notifications:** Web Push (VAPID) sent from Worker; Cron Trigger scans upcoming flights.
- **Timezones:** flights stored UTC + IANA tz for both ends; client renders local.

## 2. Data model (D1 + Drizzle)

```
users               id, email, name, home_base (default DXB), created_at
(better-auth)       session, account, verification tables — generated
trips               id, user_id, label, created_at              -- pairing/trip grouping
flights             id, trip_id, user_id, flight_no, origin, dest,
                    dep_utc, arr_utc, dep_tz, arr_tz, source(manual|autofill), notes
connections         id, owner_id, viewer_id, status(pending|accepted)
share_invites       id, owner_id, token, expires_at             -- family joins via link
push_subscriptions  id, user_id, endpoint, p256dh, auth
notification_prefs  user_id, event(departure|arrival|reminder), lead_minutes, enabled
flight_schedules    flight_no, leg_seq, origin, dest, dep_local, arr_local,
                    day_offset, days_of_week, valid_from, valid_to,
                    confirm_count, last_confirmed_at            -- reference + crowd layer
airports            iata, city, name, tz
```

- Viewers are users too — family signs up via invite link (email OTP), gets auto-connection.
- `leg_seq` models multi-sector flight numbers (e.g. DXB→SYD→CHC under one EK number).
- Crowd layer: when a user confirms or corrects autofilled times, `flight_schedules` is upserted and `confirm_count` incremented. The suggestion engine reads only this table.

## 3. Auth + sharing

**Auth:** better-auth email OTP (6-digit code, no passwords). Session = httpOnly secure cookie, 30-day rolling. Rate limit 3 OTP requests / 10 min / email. Passkeys optional later, not v1.

**Sharing flow:**
1. Crew taps "Invite family" → `share_invites` row: random 128-bit token, 7-day expiry, single-use → share link `https://app/join/<token>`.
2. Family opens link → invite screen + email OTP signup.
3. On signup the invite is consumed → `connections` row `accepted`.
4. Viewer home: read-only rosters of connected crew (next-flight countdown, calendar). Multiple crew connections supported.
5. Crew can list viewers and revoke a connection anytime; access ends instantly.

**Authorization rule (single spot):** every roster read checks `flights.user_id = me OR accepted connection(owner = flights.user_id, viewer = me)`. Implemented once as Hono middleware/helper; all endpoints use it. This replaces Supabase RLS.

No public no-login share link in v1 (roster = crew location data). Expiring read-only link possible later.

## 4. API surface

All under `/api`, zod-validated with schemas from `shared/`:

```
POST   /auth/*                                better-auth handlers
GET    /me                                    profile + prefs
GET    /trips?from&to                         my trips + flights
POST   /trips                                 create trip (flights[] inline)
PATCH  /flights/:id                           edit leg
DELETE /trips/:id
GET    /schedule/lookup?flight_no&date        autofill: legs for that flight/date
GET    /schedule/suggest?origin&arrived_at    return-flight candidates (layover buckets)
POST   /schedule/confirm                      crowd upsert on user confirm/correct
POST   /invites                               create share invite
POST   /invites/:token/accept                 join + connect
GET    /connections                           my viewers / my crew
DELETE /connections/:id                       revoke
GET    /shared/:userId/trips                  viewer reads crew roster
POST   /push/subscribe · DELETE /push/subscribe
```

## 5. Schedule autofill + trip suggestion

1. **Leg autofill** — user types flight number + date → `/schedule/lookup` returns sectors (times, airports, tz) from `flight_schedules`.
2. **Trip suggestion** — after a leg lands at outstation X, engine suggests: the onward sector when the same flight number continues, and return candidates from X ranked by layover buckets (24/48/72h — crew patterns). EK convention (return usually flight_no ± 1) used as a ranking hint, not a rule.
3. One confirm saves the whole trip — user skips typing intermediate/return legs.
4. Degrades gracefully: unknown flight → plain manual entry.

**Seeding:** one-time local scrape of a modern source (emirates.com flight-schedules pages or FR24/FlightConnections route data) → JSON committed to repo → seeded into D1. No recurring scrape, no runtime external dependency. Crowdsourcing keeps data fresh thereafter.

## 6. PWA / offline

- Precache app shell (vite-plugin-pwa/Workbox) → instant load, offline shell.
- Roster data: TanStack Query + persistQueryClient → IndexedDB; last-synced roster readable offline with "synced Xh ago" banner (plane mode use case).
- Offline writes: v1 blocks with an "offline" toast. No mutation queue (YAGNI); revisit if painful.
- Installable manifest, standalone display. iOS coaching screen for Add to Home Screen (required for iOS push anyway).
- SW autoUpdate + "new version" toast → reload.

## 7. Notifications (parked — build last)

Web Push API (not webhooks): service worker + VAPID keypair; Worker Cron Trigger scans upcoming flights and pushes "departure in 2h" style events per `notification_prefs`, to crew and connected viewers.

Support: Android/desktop full; iOS ≥16.4 only when installed to home screen. Zero third-party service.

## 8. Testing + deploy

- Worker: Vitest + `@cloudflare/vitest-pool-workers` (real D1 bindings). Cover auth guard, invite consumption, schedule lookup/suggest, crowd upsert.
- Web: Vitest + React Testing Library for entry form + suggestion UI. Timezone/countdown utils are pure functions with heavy unit tests (DST edges).
- E2E: later, not a v1 gate.
- Deploy: `wrangler deploy`; D1 via `wrangler d1 migrations apply`. GitHub Actions: PR → typecheck + test; main → deploy. Secrets (VAPID, Resend, better-auth) via `wrangler secret`. `preview` + `production` environments.

## 9. Design workshop (separate phase)

After spec, before UI build: moodboard + 2–3 direction mockups → pick direction → design tokens (color/type/spacing) → key screens (entry form with suggestion flow, crew home, viewer home). Rebrand name decision happens here.

## 10. Build order

1. Scaffold: wipe on `rework/pwa`, monorepo layout, Worker+SPA hello world, CI, deploy
2. Auth (better-auth OTP) + profile
3. Trips/flights CRUD + manual entry UI + timezone/countdown
4. Seed scrape script → `flight_schedules` + `airports`
5. Autofill + trip suggestion engine + crowd confirm
6. Sharing (invites, connections, viewer views)
7. PWA polish (offline cache, install flow, manifest)
8. Notifications (web push + cron)
9. Design pass applied throughout per workshop tokens
