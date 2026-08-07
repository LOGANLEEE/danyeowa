# Plan 7: Family Sharing (tokenized read-only links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crew shares a link from the Share tab; family opens it — no account, no app — and sees a friendly "when are they home" view of the roster. Crew can revoke any link instantly.

**Architecture:** Per spec §3 (revised 2026-08-05): `share_links` D1 table (128-bit token, per-link revocation). Public viewer endpoint `GET /api/shared/:token` (no auth) returns a REDUCED projection (no notes, no report times — family doesn't need crew-legal data; plain-language fields). Viewer page served by same SPA at `/share/<token>` route (App inspects location.pathname on load — first real route; keep hash-free, assets binding already SPA-fallbacks). Share tab: create link, list active links (label + created), copy/native-share buttons, revoke. Optional-account upgrade + push = LATER plan (notifications); this plan is link-only per user's chosen compromise.

**Design:** existing semantic tokens both themes. Family view voice per UX research §3: plain language, viewer-local times + "their time", "Home in N days" as the one number, rolling list of away/home spans. NO aviation jargon (no report/FDP/flight numbers beyond small muted line).

**Spec:** docs/superpowers/specs/2026-08-05-pwa-rework-design.md §3 (family access, revised), §2 (share_invites → implement as share_links), UX research §3 hierarchy.

## Global Constraints

- Branch `feat/plan7-sharing`. Full gate each task; commit trailers as on branch. Semantic tokens only; both themes.
- SECURITY: token = crypto.randomUUID×2 or 32 random bytes base64url (≥128-bit entropy); constant lookup by token (indexed); revoked/unknown → 404 identical shape (no existence oracle); public endpoint returns ONLY: crew display name (first name from user.name, fallback "Your crew member"), trips as {label-free spans: fromIso, toIso, awayCity (dest city of last outbound leg), homeIso}, plus per-trip legs reduced to {date, fromCity, toCity} — NO ids, NO email, NO report times, NO notes. Rate limit note: public read is cache-friendly; add `Cache-Control: private, max-age=60`.
- Viewer page works logged-out in a clean browser (e2e proves).
- Share links survive account sign-out; deleting a trip reflects on next viewer load.

---

### Task 1: share_links table + public API

**Files:** worker/src/db/share-schema.ts (+schema.ts re-export, drizzle migration), worker/src/share.ts (+mount), worker/test/share.test.ts, shared/src/index.ts (SharedView types)

**Interfaces:**
- Table: `share_links(id TEXT pk $defaultFn uuid, user_id TEXT notNull →user.id cascade, token TEXT notNull unique, label TEXT, created_at INTEGER epoch-ms $defaultFn, revoked_at INTEGER nullable)`.
- Auth'd: `POST /api/share-links {label?}` → 201 {id, token, label, createdAt}; `GET /api/share-links` → mine, incl. revoked flag; `POST /api/share-links/:id/revoke` → 204 (requireOwn pattern).
- Public: `GET /api/shared/:token` → 200 `SharedView { crewName, generatedAt, trips: [{ fromIso, toIso, awayCity, legs: [{dateIso, fromCity, toCity}] }] }` (cities from airports table; future + current trips only, sorted) | 404 (unknown OR revoked — identical body).
- TDD: token entropy/uniqueness, owner isolation, revoke → 404, projection contains NO forbidden fields (assert absent keys explicitly), unauth on private routes.

- [ ] Failing tests per above → implement → migrate local+remote → full gate. Commit `feat(worker): share links with reduced public projection`.

---

### Task 2: Share tab (crew side)

**Files:** web/src/ShareView.tsx (replace placeholder), web/src/api.ts (helpers), tests

**Interfaces:** Empty state: explainer + "Create share link" accent CTA (optional label prompt inline, e.g. "For Mom"). List: label, created date, actions: Copy (clipboard + ✓ feedback), Share (navigator.share when available, fallback copy), Revoke (inline confirm, muted danger). Revoked links shown struck/muted with "revoked" tag (history) — or hidden? Show, muted. Link format: `${location.origin}/share/${token}`.
- [ ] Failing tests (create → appears; copy calls clipboard; revoke confirm → API + state; navigator.share fallback) → implement → gate. Commit `feat(web): share tab with link management`.

---

### Task 3: Family viewer page

**Files:** web/src/SharedViewer.tsx (+test), web/src/App.tsx (path routing: /share/:token renders viewer WITHOUT auth/tab chrome), web/src/api.ts (getSharedView)

**Interfaces (UX research §3 hierarchy, binding):**
1. Header: "✈️-free" wordmark small + crew first name ("Isis's roster" style → "<crewName>'s schedule").
2. Hero: current status plain-language — away: "In <awayCity> — home <weekday>" + big "Home in N days" (.num, accent); home now: "Home — next trip <date>". Times in VIEWER's local tz via Intl default; day math via shared helpers with viewer tz.
3. Rolling list: away spans as cards "<fromCity> trip · <date range> · away N days" + home gaps implied; next 8 weeks.
4. Footer: "Shared via Roaster Me" muted + revoked/expired handling: friendly "This link is no longer active."
5. NO login UI, NO tabs, NO api/me call on this route (verify no 401 console noise). Both themes (follows system; no toggle).
- [ ] Failing tests (renders from SharedView fixture: away-now hero math vs fixed now; home-now variant; inactive link message; no auth fetch fired) → implement → gate. Commit `feat(web): family viewer page`.

---

### Task 4: E2E + deploy + share e2e (completes the old goal's "share" item)

**Files:** e2e/share.spec.ts

- [ ] Spec: crew signs in → creates trip (chip/autofill fast path) → Share tab → create link (label "For Mom") → copy URL → NEW browser context (no cookies) opens /share/<token> → sees crewName + away span + "Home in" figure (computed from fixture) → crew revokes → fresh viewer load shows inactive message. Respect OTP budget (1 sign-in). Green x2.
- [ ] Full gate; deploy; prod sanity: create+fetch+revoke roundtrip via curl with session? (needs auth — note controller does UI-level prod pass); unauth /api/share-links → 401; random token → 404. Commit `feat(e2e): family share lifecycle`.
