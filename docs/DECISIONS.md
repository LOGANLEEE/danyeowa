# Decisions

Why things are the way they are — so a new session (or a future you) doesn't re-litigate settled
questions or re-break fixed ones. Newest first. Plans 1–10 are in `docs/superpowers/plans/`.

A decision belongs here when reversing it would need a reason, or when the *rejected* option looks
obviously better until you know what's underneath it.

---

## 2026-08-13 (latest)

### The internal identifiers get the new name too

The rename entry below drew the line at user-visible strings and left `@roaster/*`, the repo, the
Worker and the D1 database alone, on the grounds that renaming them breaks the deployment URL and
Google's redirect URI for no user-visible gain. That line was moved deliberately: a codebase whose
every import reads `@roaster/shared` keeps teaching the wrong name to whoever opens it next, and
the breakage it avoids is breakage §3 of `ROADMAP.md` was going to cause anyway.

**Renamed with no runtime effect** (this change): `@roaster/{web,worker,shared}` →
`@danyeowa/*` across 50 files, the root package name, the README and CLAUDE.md headings, and the
fr24 scraper's user-agent (`RoasterMeBot/1.0` → `DanyeowaBot/1.0`).

`ROASTER_API` became `DANYEOWA_API`, but the old name is **still read as a fallback** — that
variable is set in `~/.config/roaster-me/env` on a machine this repo cannot edit, and a rename
that silently repoints the harvester at the default URL is worse than an alias that never expires.

**Deliberately still `roaster`:** `docs/rules/*` and `docs/superpowers/{plans,specs}/*` are a
frozen archive. Rewriting a historical document to say something it did not say makes it useless
as a record.

The user-agent was previously left alone because changing it changes the fingerprint fr24 sees.
That is still true; it was accepted because the string is self-identifying either way, and a
scraper announcing a name the project no longer uses is its own kind of wrong.

---

## 2026-08-13 (later)

### The app is called danyeowa

`roaster·me` was a misspelling. The word for a cabin-crew monthly schedule is **roster**; a
roaster roasts coffee. Fixing the spelling was considered and rejected: `rosterme.com` is taken,
and **RosterMe** (rosterme.au) is a live Australian security-guard rostering product — moving to
the correct spelling meant moving into a more crowded name, not out of one.

**danyeowa** (다녀와) is the Korean send-off to someone leaving: *go, and come back*. English
"goodbye" carries no promise of return; 다녀와 does. That is the whole product — the partner of a
cabin crew member, tracking when she goes and when she is back.

Checked before buying: no app, service or company of that name (Korean or English search, both
app stores), all of `danyeowa.com/.kr/.co.kr` unregistered, and Revised Romanisation gives exactly
one spelling, so the name survives being heard and typed. `danyeowa.com` registered 2026-08-13.

**Rejected, with reasons worth keeping:**
- `vaivem.app` — "vai e vem" describes the product exactly, but Brazil already has 8+ ride-hailing
  and taxi apps called Vaivem / Vai Vem, in the same app stores our first users browse.
- `pouso.app` — landing, and a resting place. Clean on the stores, but "Pouso Alegre" (a city in
  Minas Gerais) owns 70-80% of search results for the word.
- `saudade` — every good TLD taken, and it names absence where this app is about return.

**Renamed:** wordmark, `<title>`, PWA manifest name/short_name, the push fallback title, the
share-view footer, the install banner, and the email From. **Not renamed:** the repo, the Worker
(`roaster-me`), the D1 database (`roaster-me-db`), and the `@roaster/*` package names — internal
identifiers whose rename would break the deployment URL, Google's registered redirect URI, and
every installed PWA, for zero user-visible gain.

**The wordmark is one text node.** It was briefly `danyeo<span>wa</span>` to keep the old two-tone
treatment, which made the accessible name compute as "danyeo wa" — two words to a screen reader.
Splitting a word mid-token is not the same as splitting `roaster` / `·me` at a boundary. Do not
reintroduce it.

---

## 2026-08-13

### The Trips tab is gone, and the trip detail screen with it

The tab listed every upcoming duty as **one row per leg**, so a two-leg pairing was two rows and a
roster of three trips read as a ranked chart of things that have no ranking. Everything on it —
next duty, the legs, report time, edit, delete — the calendar already showed, one tap away.

Deleted: `TripsView.tsx`, `TripDetail.tsx`, both test files, the tab itself. The calendar is now
the only roster surface: the month grid is the overview, the day card is the detail.

**What went with it, deliberately:** `TripDetail` was the only entry point to leg-level time
editing, so editing one leg's departure by hand is gone. The day card's pencil re-runs the whole
lookup-and-create pipeline instead, which replaces the trip rather than nudging one leg. If
per-leg editing is wanted again, it belongs on the day card, not on a resurrected screen.

`PATCH /api/flights/:id` was left in place at first, then deleted the same day once it was clear
nothing called it — the app never did again, and the harvester's arrival corrections go through
`/api/ingest/*`. `LegPatchSchema` went with it. Reinstating per-leg editing means a new route and
a new schema; that is the right cost for a feature nobody is asking for yet.

**What this cost the e2e suite, and what it bought.** Three specs used the Trips tab to count
duties and to clear leftovers between runs. Counting rendered rows could never tell one four-leg
trip from two two-leg trips — precisely the distinction the turnaround tests exist to prove — so
those assertions now read `/api/trips` directly (`rosterTrips` in `e2e/helpers.ts`). Cleanup was a
loop that clicked a row, a delete and a confirm up to five times with every timeout swallowed; a
cleanup that quietly failed surfaced later as an unrelated assertion failing. `clearRoster` deletes
through the API and throws if the roster is not actually empty.

Edit coverage would otherwise have dropped to zero — the deleted leg edit was the only edit path
under test — so `roster.spec.ts` now drives the day card's pencil instead.

---

## 2026-08-12

### Crew sharing: one table, and read-only by construction

A crew member invites another by email; once accepted, each can open the other's calendar and
neither can change it. Badges above the grid switch whose roster is on screen.

**One table, not two.** `crew_invites` carries `acceptedAt` / `acceptedByUserId` / `revokedAt`, so
an accepted, unrevoked invite *is* the pairing. A separate `crew_links` table would hold exactly
the same fact twice, and the two can disagree; there is no state a second table would record.

**Read-only is structural, not a flag.** No mutation route accepts a user id — every one resolves
the owner from the session, as they already did. The only route that takes an id is
`GET /api/crew/:userId/trips`, which is a read. The `readOnly` prop on the day card hides controls
that would fail anyway; deleting that prop cannot grant write access, it can only put a dead
button on screen. This is why the feature adds no `?userId=` to `/api/trips`: a parameter that
selects whose data you get is one copy-paste away from appearing on a write route.

**Not found, never forbidden.** Accepting an invite addressed to someone else, revoking one you
are not party to, and reading a roster you are not paired with all answer 404 — the same answer an
unknown id gets. A 403 would confirm the invite exists and hint at who it is for.

**Emails are stored and compared lower-cased.** better-auth does not normalise case, so an invite
to `Sam@…` accepted by a session on `sam@…` would otherwise silently never match.

**The invite is claimed by signing in, not by holding the token.** Invites carry a token, but
accepting goes by invite id and checks the session's email — so a leaked link grants nothing, and
there is no unauthenticated accept route to attack. The receiving side is told about the invite in
the app; no email is sent. *Not built:* a push or email notification of a pending invite.

### Boot splash: one DOM node, dismissed by `#root:not(:empty)`

The splash lives in `index.html` **outside** `#root`, and this is the whole dismissal mechanism:

```css
#root:not(:empty) + #boot-splash { opacity: 0; visibility: hidden; }
```

`App` renders `null` while `/api/me` is in flight, so an empty `#root` is what holds the splash up.
Do not "simplify" either half — moving the splash back inside `#root` means React's first render
destroys it, which is what forced the earlier two-copy version (an inline copy for the first frame
plus a React `<Splash/>` for the fetch wait, matched by hand down to the letter-spacing).
`web/src/boot-splash.test.ts` guards the rule, the DOM order, and the hard-coded colours, which
cannot use `var(--color-*)` because they paint before `tokens.css` exists.

`:empty` rather than `:has([data-app-ready])`: it needs no React attribute and no `:has()` support.

---

## 2026-08-10 → 08-11

### Calendar grid: direction on the day cell

Each trip day shows a glyph plus a station code — `↗BKK` outbound, `↙AKL` return, `⇄BKK`
turnaround, `→` outstation sector, `·` layover — instead of the old featureless dot. Days are
bucketed by **home-tz local departure**, matching the span marks the grid already drew.

The colour rides on the **glyph, not the code**: `accent` on `accent-soft` measures 3.97:1, under
the 4.5:1 text minimum, while a glyph is a non-text graphic held to 3:1. The station code is
`text-ink` (14.7:1). Marker is 12px, measured 29.9px wide in a 44.3px cell.

Optimistically-added days keep a plain dot — they have no legs yet, and the layover fallback would
otherwise label them with an unrelated trip's station.

### Trip card: departure board + always-visible timeline (scroll-expand was removed)

Collapsed, the card is a board: route headline, `flight · date`, then `REPORT` (amber) / `DEP` /
`ARR` rows with the `+N` day offset, duration closing right-aligned.

**Scrolling past 60px collapses the calendar and expands the card into a day timeline** — leave
home → report → departs → lands, with destination city and body-clock shift, and layover rows
between sectors. Scroll back above 30px to restore.

**Scroll-to-expand was built, shipped, and then removed on 2026-08-11.** It defeated itself:
collapsing the calendar removed the very scroll that triggered it, so the browser clamped scrollY
back below the restore threshold and it un-collapsed ~60ms later.

```
t=0ms    y=200  docH=913  timeline=false
t=60ms   y=57   docH=721  timeline=TRUE     <- collapses, document shrinks, y clamped
t=120ms  y=0    docH=870  timeline=false    <- below restore threshold, reverts
```

That flicker was what the user reported as "there's no animation" — no easing would have fixed it.
The timeline is now simply always visible; there is space for it. The weekly `DayStrip` that
appeared on collapse went with it (unwanted), and the month header no longer disappears.
**Do not reintroduce a scroll-driven collapse without solving the shrink-clamp feedback loop.**
- **Report time was removed from the card, then deliberately restored.** It was first cut as a
  run-on sentence (`Report 08:10 · leave home 07:15 · now`); the board gives it a labelled row that
  reads at a glance. Don't remove it again without checking this line.
- Trip length shows only on multi-day pairings; "1 day" on a turnaround is noise.
- **Weather and sunset were prototyped and deliberately not built.** They need airport lat/lng
  (a seed column) plus a weather API. Two fabricated tiles are worse than none.

### Entry: airline code is a setting; adding is inline; the bottom sheet is gone

- The airline code (`EK`) renders as **static text**; only digits are typed. Stored in
  `localStorage` via `lib/airlinePrefix`, editable in Settings. Two-letter IATA only.
- **Tapping an empty day shows the flight-code input immediately.** No "Add trip" button, no sheet.
- **`DaySheet` was deleted outright**, not left dead — with it went second-tap-to-open, the scrim,
  Escape-to-dismiss, and the whole sheet concept. The tab bar's **+** selects today instead.
- A save **closes the form**. Turnarounds still work because the second flight is appended to the
  same preview *before* saving (`AppendFlightControl`), so one save covers both legs.
- **Manual entry is a miss-only fallback** — the link appears only after a lookup actually returns
  empty. Removing it entirely was rejected: an unknown flight would become unaddable.
- Editing happens **inline on the card** via the pencil. Saving reuses `useTripEntry` — the same
  lookup-and-create pipeline as adding — and is **create-then-delete**, never the reverse: a failed
  lookup must not be able to destroy a roster entry.

### Times are read-only where the provider owns them

Schedule times come from the provider chain, so the day card's leg panel is read-only.
`TripDetail` (Trips tab) still edits them **on purpose** — it is the only path to correct a wrong
provider time.

### Sign-in is one surface

Landing and login were separate views, and the code was a third. Now a single screen: the form is
already on it, and sending a code swaps the button **in place** for the code field with the email
still visible. `Login.tsx` was folded into `Landing.tsx`; `App.tsx` lost its `signedOutView` state.

The code field genuinely cannot appear before the code is sent — the server must issue it first.
The bug was making that a *page change* rather than the form growing.

### Zoom is disabled app-wide (accessibility trade-off, requested explicitly)

Focusing a field blew the layout up on iPhone: two inputs set no font size and inherited ~13px, and
**iOS zooms any focused control under 16px while ignoring `maximum-scale`/`user-scalable`**. Three
mechanisms, because no single one covers every case: a 16px floor on form controls, `touch-action:
manipulation` for double-tap, and cancelled `gesturestart/change/end` for pinch.

The 16px floor alone fixes the reported bug. The pinch/double-tap blocks are the "disable it
entirely" part and can be dropped independently.

### Schedule lookups are fast; don't build async reconciliation for them

Measured: **cold 300–500ms, warm 17–25ms, unknown-flight miss ~360ms** (then negative-cached).

A "save now, reconcile later" design was considered and rejected at this latency — `origin`, `dest`,
`dep_utc`, `arr_utc`, `report_utc`, `dep_tz`, `arr_tz` are all `NOT NULL`, so it would need nullable
times, a pending status, a reconciler job, a pending UI state, and push alerts that skip pending
trips. Revisit only if real-world numbers are seconds, not milliseconds.

### CI publishes a preview URL per PR

`wrangler versions upload` publishes a version without promoting it, so each PR gets its own HTTPS
URL, commented on the PR (and edited in place on re-runs).

**The preview shares production's D1** — trips added through a preview link are real. Isolating that
needs a second database and a per-environment binding swap.

Google sign-in **cannot** work on previews: each version gets a new hostname and Google requires
exact redirect URIs.

### e2e was broken for a month and nobody noticed

Every run since Plan 10 failed instantly: `createAuth` throws without `GOOGLE_CLIENT_*`, so
`wrangler dev` 500'd on every request and Playwright timed out before running a single spec. The
job's generated `.dev.vars` predated the Google-login commit. Dummy values fixed it.

**The "known flake" was not a flake.** That belief deferred gating for a day. Checking the actual
run history: every red run from 08-07 to 08-10 14:35 was this same boot bug, and the single
genuine failure after the fix (08-10 17:13) was an assertion on the bottom sheet — code deleted two
changes later. 18 consecutive green runs followed, across the card redesign, the inline-add rework,
the sheet deletion and the timeline.

So as of 2026-08-11 `e2e` is **blocking** and `deploy` needs `[check, e2e]`. Unit tests and
typecheck cannot see the class of bug that actually reaches users here, so deploying on `check`
alone was shipping past the only gate that would catch them.

### Schedules are harvested locally with real Chrome, not fetched by the Worker

The Worker's `fetch()` to flightradar24 is fingerprint/egress-blocked: a production lookup for
EK247 recorded a miss, while the identical page fetched by a real, locally-launched Chrome on a
dev machine returns every row (27, for EK247's two legs across the sampled dates). The block is
on the caller, not the flight — `worker/src/schedule-providers/scrape-fr24.ts` stays in place as
the cache-miss fallback (unchanged), but a Worker fetch to fr24 can no longer be trusted to
populate the cache going forward.

`scripts/fetch-schedules.mjs` is the workaround: launch real Chrome via Playwright, parse **every**
row on a flight's fr24 page (not just the first, and not just "now" — the Worker provider's two
known gaps), group by date to detect multi-leg services, and batch-write the result into
production D1's `flight_schedules` with `source='local-fetch'` (distinct from `seed-verified` and
`live-scrape`). Pure parsing/derivation lives in `scripts/lib/fr24-parse.mjs`, unit-tested against
`worker/test/fixtures/fr24-ek247.html` in `worker/test/schedule-providers/fr24-local-parse.test.ts`.

Default is dry-run (prints the SQL, writes nothing); `--apply` is required to actually write.
Resumable via `scripts/.fetch-progress.json` (gitignored) so an interrupted multi-hundred-flight
sweep can pick back up. Run: `node scripts/fetch-schedules.mjs --flights EK247,EK49` or
`node scripts/fetch-schedules.mjs --range 0-999 --limit 50 --apply`.

---

### The lookup failure chain, in the order it was actually diagnosed

EK247 failing in the app took four wrong turns before the real cause. Recorded so the next person
skips them:

1. "Negative cache is hiding it" — partly true, cleared it, still failed.
2. "The provider chain is misconfigured" — true but not the cause: `AERODATABOX_KEY` is set neither
   locally nor in production, so that fallback returns `null` immediately. The chain is one
   provider, not two.
3. "fr24 blocks datacentre IPs" — **wrong**, and stated too confidently from a `curl` 403. CI (a
   GitHub runner) resolved a flight through the same code path, and production holds 7 rows with
   `source='live-scrape'`. The block is on client fingerprint, not address class.
4. "The parser can't handle a two-leg service" — **wrong**. Run against the real captured page it
   parses fine; it just returns the SECOND leg (`GIG→EZE 17:25`) and discards the first, because it
   keeps only the first table row and ignores the requested date entirely (`_dateIso` unused).

The actual cause: **production's fetch now receives a bot-challenge page**, proven by production
recording a miss for EK247 two minutes after its negative-cache row was cleared, while the same URL
in real Chrome returned 27 rows. The `live-scrape` rows are historical.

Method note worth keeping: every wrong turn above was a claim made from one measurement without
checking whether the instrument could see what was being claimed.

### Verification traps that produced confidently wrong reports

Three separate times this session a working feature was reported broken because the *measurement*
was wrong, not the code:

- `boundingBox()` ignores clipping by an ancestor's `overflow:hidden`, so a fully collapsed element
  still reports its natural height.
- `page.screenshot({fullPage:true})` **scrolls the page and resets it**, so anything measured
  afterwards reads as though the user scrolled back to the top.
- A bundle fetched mid-deploy returns the *previous* hash, which looks exactly like a failed deploy.
  Re-request with cache-busting before concluding.

Also: this repo's jsdom has **no `PointerEvent` constructor**, so `fireEvent.pointerDown` degrades
to a bare `Event` with undefined coordinates — gesture tests can pass while proving nothing. The
swipe tests dispatch `MouseEvent` typed as pointer events to work around it.

## Recurring traps

- **The calendar-width regression has happened three times.** Cause each time: a container that
  centres *every* child, so anything full-width must opt out. Patching with `w-full` on the
  calendar only holds until someone inserts a wrapper between them. Fixed at the cause by removing
  the centring; verify by measuring grid width against container width, not by looking.
- **A stale `wrangler dev` serves an old bundle**, so a change looks missing. Cost several wrong
  conclusions, including one reported to the user as a regression.
- **A bundle fetched mid-deploy returns the previous hash**, which looks exactly like a failed
  deploy. Re-request with cache-busting before concluding anything.

## Open questions

- ~~Is scroll-to-expand reachable on a short roster?~~ **Resolved by removing the feature** — the
  real defect was the shrink-clamp loop above, not reachability.
- **The Worker still records a miss when its fetch was BLOCKED.** That is what poisoned EK247 for a
  whole TTL. Now that the local fetcher owns the cache, a challenged fetch should write nothing.
- **`TripForm.tsx`** is a near-duplicate of `useTripEntry` still submitting un-normalised flight
  numbers to the same endpoints — the `EK049` bug survives in that path.
- **`docs/rules/*`** (Expo/Supabase/Jest, 74 stale references) is flagged but not deleted; removal
  is the owner's call.

## Not built, deliberately

| Thing | Why not |
|---|---|
| Weather / sunset at destination | Needs airport lat/lng seed column + weather API. Prototyped as placeholders only. |
| Sharing rework | `/share/:token` today is a public link needing no account; a per-person login is a different data model. Needs a design conversation first. |
| Destination news | Goes stale fast, real cost, unclear value next to an arrival time. |
| Async schedule reconciliation | See latency numbers above. |
| Second D1 for previews | Only worth it if previews get heavy use. |
