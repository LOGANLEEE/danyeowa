# Plan 9: Notifications (Web Push + report-time reminders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crew gets a push notification before report time ("Report 08:45 in 2h — DXB → SYD, leave home by 07:50"). Web Push (VAPID) from the Worker, Cron Trigger scans upcoming flights. Spec §7. No third-party service.

**Architecture:** `push_subscriptions` table (spec §2). Service worker gains a `push` listener + `notificationclick` (vite-plugin-pwa NOT installed — check: is there a service worker at all yet? Plan 4's PWA polish added meta only. This plan introduces the SW: minimal hand-rolled `web/public/sw.js` registered from main.tsx — precache NOT in scope, push-only SW keeps it simple; offline caching remains backlog). VAPID keys: generated once, private as Worker secret, public in wrangler vars. Cron Trigger (`*/15 * * * *`) scans flights with report_utc in [now, now+2h15m) not yet notified (notified_at stamp table or column) → web-push to that user's subscriptions. Web-push on Workers: no Node lib — use a Workers-compatible implementation (research current 2026 state: `@block65/webcrypto-web-push` or hand-rolled VAPID JWT + aes128gcm; implementer verifies via context7/docs and picks, documenting choice).

**Spec:** docs/superpowers/specs/2026-08-05-pwa-rework-design.md §7, §2 (push_subscriptions, notification_prefs — prefs SIMPLIFIED v1: single toggle + lead minutes, stored per user).

## Global Constraints

- Branch `feat/plan9-notifications`. Full gate each task. Tokens/theming discipline. e2e: push can't be e2e'd headless — unit + integration coverage only; existing e2e stays green untouched (OTP ceiling).
- Secrets: VAPID_PRIVATE_KEY via wrangler secret ONLY (controller/user runs the put; implementer generates keypair with a script, prints PUBLIC key only, NEVER writes private key to any file — pipe directly); VAPID_PUBLIC_KEY as wrangler.jsonc var + exposed via /api/push/config.
- iOS reality documented in UI: push requires Add to Home Screen (Settings screen hint when unsupported).
- Cron idempotent: a flight notifies at most once per lead window (stamp before send attempt; failed sends don't retry forever — mark + move on, log count).
- Dead subscription cleanup: 404/410 from push service → delete subscription row.

---

### Task 1: push_subscriptions + prefs schema, VAPID plumbing, subscribe API

**Files:** worker/src/db/push-schema.ts (+migration), worker/src/push.ts (+mount, +tests), shared types, scripts/generate-vapid.mjs

**Interfaces:**
- Tables: `push_subscriptions(id pk uuid, user_id →user cascade, endpoint TEXT unique, p256dh TEXT, auth TEXT, created_at)`; `notification_prefs(user_id pk →user cascade, enabled INTEGER default 1, lead_minutes INTEGER default 120)`.
- `GET /api/push/config` (auth) → { publicKey, enabled, leadMinutes, subscribed: boolean }.
- `POST /api/push/subscribe` (auth, zod: endpoint url + keys) → 201; upsert by endpoint. `DELETE /api/push/subscribe` body {endpoint} → 204.
- `PUT /api/push/prefs` {enabled, leadMinutes 30..360} → 200.
- scripts/generate-vapid.mjs: prints public key to stdout + pipes private to `wrangler secret put VAPID_PRIVATE_KEY` when run with --put (implementer runs it; public key → wrangler.jsonc vars).
- [ ] TDD (subscribe upsert, dedupe by endpoint, unauth 401s, prefs bounds). Migrations local+remote. Full gate. Commit `feat(worker): push subscriptions, prefs, vapid plumbing`.

---

### Task 2: web-push sender + cron scan

**Files:** worker/src/webpush.ts (+tests), worker/src/index.ts (scheduled handler), wrangler.jsonc (triggers.crons), worker/src/db (notified stamp: add `report_notified_at INTEGER nullable` to flights via migration)

**Interfaces:**
- `sendPush(sub, payloadJson, env)` — VAPID auth + aes128gcm encryption, Workers-webcrypto based (library or hand-rolled per research; unit tests mock fetch to push endpoint, assert JWT header shape + encryption params present; do NOT test against real push services).
- `scheduled()`: query flights joined users+prefs where enabled, report_utc between now and now+lead+cron-slack, report_notified_at null → stamp first (UPDATE ... WHERE report_notified_at IS NULL returning affected — race-safe) → send to each user sub; payload {title: "Report HH:MM — ORG → DST", body: "leave home by HH:MM", tag: flightId}; 404/410 → delete sub.
- Per-user lead_minutes honored; cron `*/15`.
- [ ] TDD via direct scheduled-handler invocation in vitest-pool-workers (fixture flights/subs; fetch mocked; assert stamp idempotency on double-run). Full gate. Commit `feat(worker): web push sender + report-time cron`.

---

### Task 3: SW + Settings UI + deploy

**Files:** web/public/sw.js, web/src/main.tsx (SW registration), web/src/SettingsView.tsx (+tests), api.ts helpers

**Interfaces:**
- sw.js: `push` → showNotification(payload.title, {body, tag, icon}); `notificationclick` → focus/open '/'.
- Settings section "Notifications": unsupported (no Notification API/iOS-not-installed) → muted hint "Install to Home Screen to enable"; supported: toggle (permission request → subscribe flow: getRegistration→pushManager.subscribe with publicKey→POST) + lead-minutes select (30m/1h/2h/3h); unsubscribe on toggle-off. States tested with mocked Notification/pushManager.
- Deploy; prod sanity: /api/push/config 401 unauth; cron registered (wrangler deployments/triggers output in report). Controller UI pass + real-device note for user.
- [ ] TDD; full gate; deploy. Commit `feat(web): push notification opt-in + service worker`.
