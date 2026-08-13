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

## 1. Email that actually reaches people — IN PROGRESS

**Why it matters:** crew sharing is live, but an invited person cannot sign in unless they use
Google. Production OTP mail only ever reached the Resend account owner's own address, because the
sender was `onboarding@resend.dev` (Resend test mode). Verified: a code sent to
`korlogan94@gmail.com` arrived; the same code to `korlogan94+crewa@gmail.com` never did.

| Step | State |
|---|---|
| Buy a domain | ✅ `danyeowa.com`, Cloudflare Registrar, $10.46/yr |
| Resend account for this app | ✅ separate free account (hellogenietour.com occupies the other one — free tier is 1 domain, 3,000/mo, 100/day) |
| DNS records | ✅ auto-added by the Resend↔Cloudflare integration. Confirmed live by `dig`: DKIM `resend._domainkey`, SPF + MX on `send` |
| Resend domain status | ⏳ was "Pending" at hand-off — confirm it flipped to Verified |
| `RESEND_API_KEY` secret | ✅ set as version `67833aa2` (not deployed — see the versions trap below) |
| `EMAIL_FROM` secret | ❌ set to `danyeowa <noreply@danyeowa.com>` |
| Deploy + prove delivery | ❌ send to a `+alias` address and read it in Gmail |

**The versions trap.** `wrangler secret put` fails with *"the latest version of your Worker isn't
currently deployed"* whenever a PR preview has uploaded a newer version (our CI does this on every
PR). Use `wrangler versions secret put <KEY>` instead — it stores the secret in a new,
undeployed version, and the next CI deploy carries it.

---

## 2. Stop storing OTPs in plaintext — NOT STARTED

`verification.value` holds the OTP as `616087:0`. Anyone with read access to production D1 can
sign in as any user. This is how the production crew test in this session was run at all, so treat
it as proven, not theoretical.

Fix: `emailOTP({ storeOTP: "hashed" })` — a first-class better-auth option (`plain` is the
default; `encrypted` and custom hashers also exist).

**Do this AFTER §1 delivers mail.** With hashed OTPs and no working email, nobody can sign in to
production at all except via Google.

---

## 3. Move the Worker to the `danyeowa` account — DECIDED, NOT STARTED

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

A backup of production D1 taken before any of this is in the session scratchpad
(`d1-backup-20260813-1933.sql`, 233 kB, 787 inserts, all 13 tables). Take a fresh one at cutover —
that one is a rehearsal artifact, not the cutover snapshot.

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
