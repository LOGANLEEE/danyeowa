# Roadmap

What is decided, what is pending, and what each pending thing is blocked on. Newest decisions
live in `DECISIONS.md`; what exists today is in `FEATURES.md`. This file is only for **work not
yet done**, so a new session can pick up without re-deriving the context.

Last updated 2026-08-13.

---

## Who this is for (the thing every decision below serves)

The app was built because **one partner is cabin crew and the other is not**. Her airline forbids
screenshotting the roster app, so today the schedule reaches him as a few dates typed into
WhatsApp — which he misses or forgets. He needs to know: when she reports, when she lands (he
picks her up), and which days are free, so dates can be planned. The roster updates **once a
month**.

So the primary reader of this data is **the partner, not the crew member**. Anything that only
serves the crew member is secondary. If a feature makes the partner's question harder to answer,
it is wrong regardless of how good it looks.

Later, possibly: the same pain for any shift worker's household. Not scoped, not designed, not
promised — do not build for it yet.

---

## 1. Email that actually reaches people — DONE 2026-08-13

**Why it matters:** crew sharing is live, but an invited person cannot sign in unless they use
Google. Production OTP mail only ever reached the Resend account owner's own address, because the
sender was `onboarding@resend.dev` (Resend test mode). Verified: a code sent to
`korlogan94@gmail.com` arrived; the same code to `korlogan94+crewa@gmail.com` never did.

| Step | State |
|---|---|
| Buy a domain | ✅ `danyeowa.com`, Cloudflare Registrar, $10.46/yr |
| Resend account for this app | ✅ separate free account (hellogenietour.com occupies the other one — free tier is 1 domain, 3,000/mo, 100/day) |
| DNS records | ✅ auto-added by the Resend↔Cloudflare integration. Confirmed live by `dig`: DKIM `resend._domainkey`, SPF + MX on `send` |
| Resend domain status | ✅ **Verified** (region Tokyo `ap-northeast-1`) |
| `RESEND_API_KEY` secret | ✅ set as version `67833aa2` (not deployed — see the versions trap below) |
| `EMAIL_FROM` secret | ✅ `danyeowa <noreply@danyeowa.com>`, version `e69c5f84` |
| Deploy + prove delivery | ✅ PR #46 merged (`c43bafa`), CI deployed. OTP to `korlogan94+danyeowa1@gmail.com` arrived from `noreply@danyeowa.com` — the alias that got nothing for 7 days |

**A plain `wrangler deploy` keeps the secrets.** `versions secret put` writes the secret into a
new, undeployed version; the CI deploy that follows uploads its own version from source and
inherits every existing secret. Confirmed: `wrangler secret list` shows all six, and the OTP mail
sent after the deploy used the `EMAIL_FROM` value.

**The versions trap.** `wrangler secret put` fails with *"the latest version of your Worker isn't
currently deployed"* whenever a PR preview has uploaded a newer version (our CI does this on every
PR). Use `wrangler versions secret put <KEY>` instead — it stores the secret in a new,
undeployed version, and the next CI deploy carries it.

---

## 2. Stop storing OTPs in plaintext — DONE 2026-08-13

`verification.value` holds the OTP as `616087:0`. Anyone with read access to production D1 can
sign in as any user. This is how the production crew test in this session was run at all, so treat
it as proven, not theoretical.

Fixed by `emailOTP({ storeOTP: "hashed" })` in `worker/src/auth.ts` — a first-class better-auth
option (`plain` is the default; `encrypted` and custom hashers also exist), available in the
1.6.26 already installed.

Guarded by a test that was **proven failing first**: it read `verification.value` straight out of
D1 and asserted the plaintext code was not in it — `expected '981077:0' not to contain '981077'`
before the change, green after. The same test signs in with the plain-text code afterwards,
because hashed storage is only worth having if verification still works.

Ordering held: §1 delivered mail before this landed, so email sign-in was never the only casualty.
Nothing reads `verification.value` outside better-auth — the dev and e2e OTP paths read
`getLastDevOtp()` from Worker memory, not the database, so both still work.

---

## 3. Move the Worker to the `danyeowa` account — DONE 2026-08-14

Today the Worker + D1 sit in **Logan personal account**; `danyeowa.com` sits in a separate
**danyeowa** account created by the domain purchase. A Workers custom domain needs the zone and
the Worker in the same account.

The domain **cannot** move for now: Cloudflare blocks account transfer for 10 days after
registration (the Settings page says so outright, button disabled) — eligible **after
2026-08-23**. Moving the *Worker* instead is possible today, and is the chosen direction.

**Target URL: `danyeowa.com` (apex).** Shortest to say, one string for site and email, and the
PWA is the whole product so there is nothing else to put on the apex. Cost: if a marketing page
ever wants the apex, the app moves to a subdomain and URLs break again — accepted.

### What breaks, and who must fix it

1. **All sessions log out** — cookies are host-bound.
2. **All push subscriptions die** — subscriptions are origin-bound. Rows in `push_subscriptions`
   become dead; everyone re-subscribes on the new origin.
3. **Every share link already sent breaks** — the token survives in D1, the host does not.
4. ~~Google sign-in breaks until the redirect URI is added~~ — **done 2026-08-13.** The OAuth
   client now lists all three: the workers.dev URL, `http://localhost:8787`, and
   `https://danyeowa.com/api/auth/callback/google`. The old workers.dev entry was kept on
   purpose, so the old Worker can stay up as a redirector and so a failed cutover has a way back.
5. **CI deploy breaks until `CLOUDFLARE_API_TOKEN`** in GitHub is swapped for a danyeowa-account
   token. **User task.**
6. **The local harvester breaks** — `~/.config/roaster-me/env` and the launchd plists point at
   `roaster-me.logan-lee.workers.dev`. **User task.**
7. ~~wrangler CLI cannot see the danyeowa account~~ — **done 2026-08-13**, `wrangler login`
   re-run with that account granted. Confirm with `wrangler whoami` before relying on it.

### Sequence

**Prep (no downtime)** — merge the rename PR first so production is current; grant CLI access to
the new account; create the D1 there and apply migrations; export/import once as a rehearsal.

**Cutover (~10 min)** — re-export production D1 (`wrangler d1 export … --remote`, 258 kB, ~800
rows) and import into the new one; set all five secrets (`BETTER_AUTH_SECRET`,
`GOOGLE_CLIENT_SECRET`, `INGEST_TOKEN`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`); update
`wrangler.jsonc` with the new `database_id`, an explicit `account_id`, and
`BETTER_AUTH_URL: "https://danyeowa.com"`; deploy; attach the custom domain; then the four user
tasks above.

**After** — decide whether the old Worker stays a few days as a redirect to the new domain (saves
old share links and installed PWAs) or is deleted outright. Delete the old D1 only after the new
one is verified through the API, not by looking at row counts.

### Prep done 2026-08-13 (no downtime, nothing cut over)

Backups now live in `~/.local/share/danyeowa-backups/`, not a session scratchpad — the previous
one was written somewhere a later session could not reach. Current: `d1-prod-20260813-2030.sql`,
233 kB, 788 inserts, 13 app tables plus `d1_migrations`. **Still take a fresh one at cutover.**

`danyeowa-db` exists in the danyeowa account, id `2569ddab-ffe2-4734-931e-234a294e6a07`, loaded
from that export and verified against production by row count — `user=8 account=3 session=16
trips=10 flights=12 flight_schedules=568 airports=149 crew_invites=3 share_links=1
push_subscriptions=1`, identical on both sides.

**A D1 export does not import back into D1 as-is.** Three things bite, all found by doing it:

1. The export orders `account` before `user` and `flights` before `trips`, and D1 ignores the
   `PRAGMA defer_foreign_keys=TRUE` the export writes on line 1. A straight
   `d1 execute --file <export>` dies with `no such table: main.user`, then with
   `FOREIGN KEY constraint failed` once the tables exist. Split the file into schema and data,
   then load the data parents-first: `user` before `account`/`session`/`trips`/`share_links`/
   `notification_prefs`/`push_subscriptions`/`crew_invites`, and `trips` before `flights`.
2. `d1 execute --json --file` returns `{"error":{"text":"{\"D1_RESET_DO\":true}"}}`. Use
   `--file` for bulk load, `--command` for anything whose output you want to read.
3. D1 caps compound SELECT terms: a ten-way `UNION ALL` of `COUNT(*)` fails with
   `too many terms in compound SELECT [code: 7500]`. Use scalar subqueries in one SELECT instead.

### The secrets are write-only — this is the real cutover blocker

A new Worker in a new account needs all five secrets re-supplied, and Cloudflare will not read
them back. Where each one actually comes from:

**There are SIX, not five.** This list said five and the sixth cost a debugging cycle: with
`EMAIL_FROM` unset, `sendOtpEmail` silently falls back to `DEFAULT_FROM`
(`danyeowa <onboarding@resend.dev>`) — Resend test mode, which delivers only to the Resend
account owner's own address. That is the §1 bug exactly, reintroduced by the move. Count the
old Worker's `wrangler secret list` before trusting any list in a document, including this one.

| Secret | Source | Who |
|---|---|---|
| `RESEND_API_KEY` | **nowhere on disk.** Must be re-created in the Resend dashboard | **user** |
| `EMAIL_FROM` | `danyeowa <noreply@danyeowa.com>` — a plain string, not a credential | either |
| `GOOGLE_CLIENT_SECRET` | `.dev.vars` (same OAuth client as production) | either |
| `INGEST_TOKEN` | `~/.config/roaster-me/env` — must keep the same value or the harvester breaks | either |
| `BETTER_AUTH_SECRET` | regenerate; sessions die in the move anyway | either |
| `VAPID_PRIVATE_KEY` | regenerate via `scripts/generate-vapid.mjs --put`; the public half goes in `wrangler.jsonc`, and push subscriptions die in the move anyway | either |

### Diagnosing a send that goes nowhere

`POST /api/auth/email-otp/send-verification-otp` returns **200 whatever happens** — better-auth
swallows the transport error, and `wrangler tail` shows `outcome: ok` with an empty `exceptions`
array. Neither is evidence of delivery. Two instruments that actually see it:

- **Resend → Logs.** One row per API call. *No row at all* means the Worker's request never
  authenticated against that account — a dead or foreign key — rather than a rejected send.
- **The recipient's inbox.** The only proof. Prove the search itself first: query
  `from:noreply@danyeowa.com newer_than:2d` and confirm it finds a mail you know arrived, before
  reading an empty result as a failure.

Plus the two GitHub secrets: `CLOUDFLARE_API_TOKEN` (a danyeowa-account token, **user**) and
`CLOUDFLARE_ACCOUNT_ID` → `08d39249abaa892047690aa4c0c34b3a`.

---

## 4. The partner cannot see times — THE ACTUAL PRODUCT GAP

`/share/:token` returns crew name, dates and **city names only — no clock times**. The privacy
design is deliberate, but it means the person waiting cannot tell when to leave for the airport,
which is the reason this app exists.

Crew sharing (shipped) does not solve it: that is crew-to-crew, requires an account, and the
partner is meant to be account-less.

Three pieces, in order:

1. **Times on the share view** — report time and landing time. She typed them in herself; passing
   them to the person collecting her is not a leak of airline data.
2. **Landing alert to the partner** — push today goes only to the crew member's own devices. The
   partner is the one who needs "she lands in 60 minutes".
3. **A "next days off" view** — dates get planned around free days, and free days are currently
   something you infer by looking at gaps in a month grid.

---

## 5. Smaller open items

- **KIPRIS trademark check for 다녀와 is unverified.** The search page is a JS SPA; a scrape
  returned zero results, which is indistinguishable from the query never running. Matters only if
  the mark is ever filed — the domain itself is fine.
- **Cloudflare Email Sending needs Workers Paid ($5/mo).** Both accounts are on Workers Free
  (checked). Revisit only if Resend's free tier stops fitting; the native `send_email` binding is
  nicer (no API key) but not worth $60/yr at this volume.
- **Stale worktrees and branches** — `roster-me-worktrees/{designer,developer,planner,tester}`
  (all at 27e4df5, 8 months old, clean), a prunable `~/.cursor/worktrees/roaster-me/myk`, and
  merged branches `fix/flightno-normalisation`, `fix/scroll-expand-polish`. Left alone on purpose;
  delete only on the user's say-so.
- **`RoasterMeBot/1.0`** is still the scraper's user-agent (`scrape-fr24.ts`). Cosmetic, and
  changing it changes the fingerprint we present to fr24, so it was left as is.
