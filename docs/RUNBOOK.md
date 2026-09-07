# Runbook

How to run the things that aren't `pnpm dev`. Every command here has been run against production
at least once — where one hasn't, it says so.

## Deploy

```bash
pnpm --filter @danyeowa/web build     # MUST come first: wrangler ships whatever is in web/dist
npx wrangler deploy
```

Then verify the deploy rather than trusting it — a mid-deploy fetch returns the *previous* bundle
hash, which looks exactly like a failed deploy:

```bash
curl -s "https://danyeowa.com/?cb=$RANDOM" | grep -o 'index-[A-Za-z0-9_-]*\.js'
# must match the hash printed by the build
```

**A failed web build does not stop `wrangler deploy`.** It will happily ship the worker with stale
assets. Check the build's exit status before deploying.

Merging to `main` also deploys, via GitHub Actions, after typecheck + unit + e2e.

## Database migrations

Write the migration into `drizzle/` and let CI apply it. The deploy job runs
`wrangler d1 migrations apply --remote` **before** `wrangler deploy`, so schema always precedes
the code that needs it, and applies only what `d1_migrations` has not recorded.

**Do not apply migrations by hand.** Three went in that way and were only safe because they were
additive; reversed, production breaks the moment the Worker deploys. If one ever does get applied
manually, record it in the ledger or the next automated run will try to re-apply it:

```bash
npx wrangler d1 execute danyeowa-db --remote --command \
  "INSERT INTO d1_migrations (name, applied_at) SELECT '00XX_name.sql', datetime('now')
   WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name='00XX_name.sql');"
```

The preview environment **shares production's D1**. Trips added through a preview URL are real.

## Writing to production

**Scripts hold no database credentials.** Every write goes through `/api/ingest/*` on the Worker,
validated with the same schema the app reads:

| route | for |
|---|---|
| `POST /api/ingest/schedules` | harvested airports + legs (airports written first, server-side) |
| `GET /api/ingest/upcoming-arrivals` | the refresher's work list |
| `POST /api/ingest/arrival-corrections` | corrected arrival times, re-arming the alert stages |

Guarded by a bearer token. The Worker secret and the local copy must match:

```bash
export INGEST_TOKEN=...                       # or: source ~/.config/danyeowa/env
```

**Rotating: Worker first, local file second.** The reverse leaves the scripts presenting a token
production does not know, and it destroys the only copy of the old value before you have confirmed
the new one works.

```bash
umask 077                                    # or the file is world-readable before chmod runs
NEW=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
printf '%s' "$NEW" | npx wrangler secret put INGEST_TOKEN     # 1. Worker
printf 'export INGEST_TOKEN=%s\n' "$NEW" > ~/.config/danyeowa/env   # 2. local
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $NEW" \
  https://danyeowa.com/api/ingest/upcoming-arrivals            # 3. expect 200
```

`secret put` fails with `the latest version of your Worker isn't currently deployed` whenever an
open PR's `preview` job has uploaded a newer version. Merge the PR and let CI deploy, then retry.
Do not take the error's advice to deploy the latest version — that hand-deploys a preview build.

Give a rotation ~60s before trusting a probe. A fresh secret reaches edges unevenly and one `401`
in that window means nothing.

No configured token means every ingest request is refused — it fails closed on purpose.

`SELECT` against production for diagnosis is fine. `INSERT`/`UPDATE`/`DELETE` by hand is not; see
the rules in `CLAUDE.md`.

## Harvesting schedules

Fills `flight_schedules` from flightradar24's JSON API, driven by a real Chrome (a direct request
gets a Cloudflare 403).

Runs from launchd every 30 minutes, capped at 15 flights a run — see "Scheduling" below.

`--live-roster` reads the flight numbers fr24 shows airborne and accumulates them in the progress
file, instead of guessing at EK0..EK999 where ~94% of the numbers were never assigned. One sample
returns about 148 Emirates numbers; repeated runs converge on the network.

Manual forms still work:

```bash
node scripts/fetch-schedules.mjs --live-roster --limit 5              # dry-run
node scripts/fetch-schedules.mjs --flights EK247,EK373                # specific flights
node scripts/fetch-schedules.mjs --range 1-300 --apply                # numeric sweep
node scripts/fetch-schedules.mjs --live-roster --retry-missing        # re-check empties
```

- Dry-run records no progress; only `--apply` marks a flight done.
- `--force` re-does flights **without** wiping the file. It used to erase the whole bookmark.
- Writes flush every 5 flights, so an interrupted run keeps what it got.
- Progress is `scripts/.fetch-progress.json` — `done`, `missing`, and `roster`. **`missing` is not
  proof a flight doesn't exist**: fr24 has real coverage gaps (EK41 is a daily A380 to Heathrow
  and fr24 has nothing for it).
- **The live feed rate-limits rapid repeats, and its refusal looks like success** — zero rows,
  HTTP 200, non-zero `full_count`. That is treated as throttled and retried; don't "fix" it by
  reading zero rows as an empty sky.
- Expect ~15s per flight: roughly every second request gets a Cloudflare challenge, costing a
  retry behind a fresh context.
- **It writes airports too, and must.** The lookup route 404s a flight whose leg references an
  IATA the `airports` table has no row for, because it will not guess a timezone. Harvesting
  schedules alone put 14 flights in the database that the app could not serve, EK247 among them.
  Check for a recurrence with:

```bash
npx wrangler d1 execute danyeowa-db --remote --command \
  "WITH codes AS (SELECT origin AS iata FROM flight_schedules UNION SELECT dest FROM flight_schedules)
   SELECT count(*) AS unseeded FROM codes WHERE iata NOT IN (SELECT iata FROM airports);"
```

## Refreshing arrival times against reality

Corrects stored arrival times against live flightradar24 data, and clears `arrival_alert_stage`
so the 60/30/0 alerts re-arm against the corrected time.

```bash
node scripts/refresh-arrivals.mjs --hours 12        # dry-run
node scripts/refresh-arrivals.mjs --apply           # writes to prod D1
```

Runs from launchd, not cron — see "Scheduling" below.

**Two things together get past fr24's bot check, and only together.** Measured: a plain Playwright
context gets 403 whether headless or headed; borrowing the real Chrome cookies still gets 403;
adding the automation-marker flags is what finally works.

- the real profile's cookies, copied to a scratch dir so Chrome can stay open
- `--disable-blink-features=AutomationControlled`, `ignoreDefaultArgs: ["--enable-automation"]`,
  and `navigator.webdriver` stubbed

Runs headless, so a cron job throws no windows at you. It only rewrites a time when the drift is
at least 10 minutes — every flight is a minute or two off its timetable and churning the row for
that would re-arm alerts for nothing.

Verified end to end against a live EK4: stored 23:35Z corrected to 02:50Z from the airborne
estimate, and the stage reset from 30 to NULL.

If fr24 tightens the check, the fallback is the API at $9/month, which removes the browser
entirely — for this and for the harvester.

**Cloudflare answers a concurrent D1 request with 7403 "account is not valid or is not
authorized".** It reads like a dead credential and is not — the same command works moments later,
and the harvester writing at the same time is enough to cause it. Both scripts retry; don't go
looking for a broken token when this appears in a log.

## Scheduling

Both background jobs are launchd user agents, not cron entries:

| Label | Interval | Watchdog | Log |
|---|---|---|---|
| `com.danyeowa.refresh-arrivals` | 900s | 600s | `~/Library/Logs/danyeowa/refresh.log` |
| `com.danyeowa.harvest` | 1800s | 1200s | `~/Library/Logs/danyeowa/harvest.log` |

**Logs are deliberately not in `/tmp`.** macOS cleans `/tmp`, and on 2026-09-07 it had deleted
`danyeowa-refresh.log` while node still held fd 1 and 2 open — so the file was gone from the
directory while the process kept writing into the unlinked inode. Five days of evidence about a
live outage existed and could not be read.

**Each job force-exits before its own next interval.** `scripts/lib/watchdog.mjs` arms a timer
that calls `process.exit(75)`, and both entry points also force-exit once `main()` returns. This
is not belt-and-braces — they catch two different failures. See "When a job stops running" below.

`StartInterval` is the reason for the switch. **cron simply skips a slot the machine slept
through; launchd runs the missed interval once it wakes.** Measured on the cron setup: 1 skipped
run in 39, which matters most at the exact moment it hurts — the last check before a landing.

```bash
launchctl list | grep danyeowa                              # loaded?
launchctl kickstart -p gui/$(id -u)/com.danyeowa.harvest    # run one now
launchctl bootout gui/$(id -u)/com.danyeowa.harvest         # stop
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.danyeowa.harvest.plist
```

Plists live in `~/Library/LaunchAgents/`. They carry an explicit `PATH` (launchd, like cron, has
no brew in it) and an absolute `WorkingDirectory`.  They also set `ExitTimeOut` to 30, so launchd
`SIGKILL`s a job that ignores `SIGTERM` — one did, on 2026-09-07.

### When a job stops running

**`launchctl list` showing exit `0` does not mean a job is running.** The first column is a PID,
and a PID there for an interval job means an invocation is *still going*. launchd will not start
a new instance while the old one lives, so one stuck run takes the job off the air indefinitely,
silently.

```bash
launchctl list | grep danyeowa          # first column: "-" is healthy, a PID may not be
ps -p <pid> -o pid,etime,time,%cpu      # days of ELAPSED against seconds of TIME = hung
pgrep -f danyeowa-chrome-profile        # orphaned scratch Chrome; 0 is healthy
```

What this looked like on 2026-09-07: `refresh-arrivals` alive **5d17h** on 12.97s of CPU,
`fetch-schedules` **4d1h** on 1.43s, each holding a `launchPersistentContext` Chrome, 42
processes in total. No open sockets, empty kqueue — waiting on a browser that never closed.
Arrival alerts had been firing off the uncorrected timetable the whole time.

To clear one by hand, kill the node parent and then the scratch Chrome tree. **Match on
`danyeowa-chrome-profile`, never on "Chrome"** — the second one closes the browser you are
reading this in:

```bash
pkill -f "refresh-arrivals.mjs|fetch-schedules.mjs"
pgrep -f danyeowa-chrome-profile | grep -x <your-chrome-pid> || pkill -9 -f danyeowa-chrome-profile
launchctl kickstart -k gui/$(id -u)/com.danyeowa.refresh-arrivals
```

**The token is not in the plist.** Both run through `/bin/sh -c` and source it instead:

```sh
. "$HOME/.config/danyeowa/env" && exec /opt/homebrew/opt/node@22/bin/node <script> <args>
```

A plist is `0644` — every process on the machine can read one. `~/.config/danyeowa/env` is `0600`,
so sourcing keeps the token readable only by its owner. The `&&` is load-bearing: with `;` a
missing env file would let the job run on to hit production with no token, and the failure would
read as an auth bug rather than a missing file. Rotating the token now means editing that one
file — the plists never mention it.

## When CI's e2e job fails but the diff is innocent

**Symptom:** a large number of specs fail at once, most of them in 120–210ms, with
`net::ERR_CONNECTION_REFUSED at http://localhost:8787/`. One earlier spec failed slowly (a real
timeout) and everything after it failed instantly. `wrangler dev` died partway through the run,
and Playwright does not restart a dead `webServer` — so every remaining spec fails on a corpse.

**This is not your diff, and there is a one-command control for that claim:**

```bash
git diff main...HEAD --name-only     # nothing the runtime reads changed → the diff cannot be it
```

Then reproduce the *seed* spec (the first, slow failure) locally. If it passes, rerun the job:

```bash
gh run rerun <run-id> --failed
```

**Do not read the last failure in the log.** It is a casualty. The seed is the first `✘` with a
duration in seconds rather than milliseconds.

**Measured 2026-09-07**, over the last 100 `ci.yml` runs (`run_attempt > 1` as the filter):
16 needed a rerun. Of 8 sampled first attempts, **8 carried this signature and none was a real
test failure.** The seed varied — `crew.spec.ts` four times, then `invite-link`, `layover-brief`,
`board-partway`, `red-eye-home` once each — so it is not one bad spec.

`[ERROR] ... Broken pipe` from workerd is **not** the cause: one run had 25
`ERR_CONNECTION_REFUSED` and zero broken pipes, and another logged broken pipes 32 seconds before
the server actually died. It is noise that happens to be nearby.

**The fatal error is not in the job log.** It prints as `✘ [ERROR]` with an empty message. The
real one goes to wrangler's debug log, which `ci.yml` now redirects into the workspace with
`WRANGLER_LOG_PATH` and uploads in the `playwright-report` artifact. Download it and read
`wrangler-logs/*.log` from the failing attempt:

```bash
gh run download <run-id> -n playwright-report
```

**Not yet known:** what actually kills workerd. Nothing here identifies it — this only makes the
next occurrence readable. Two untested leads, in order of cheapness: the pinned wrangler is
5 weeks behind (4.118.0 / workerd 1.20260730.1 against 4.129.0 / 1.20260907.1), and a GitHub
runner has far less memory than a dev machine. **Neither has been shown to change the outcome**,
so neither is a fix yet.

Local runs are not evidence of a difference: 4 full local runs on 2026-09-07 had no server death,
but at a 16% rate that outcome has probability 0.84⁴ ≈ 0.50.

## Push notifications

```bash
# Send yourself a test push — open this in the app on the phone, signed in
https://danyeowa.com/api/push/test
```

Returns `{"sent":1,...}` on success. `failed` carries `{status, detail}` per device — `detail`
is the push service's own error text, which is the part that names a cause. 404/410 means the
subscription expired and it has been removed.

A status on its own is not a diagnosis. On 2026-08-31 this route answered
`{"sent":0,"subscriptions":1,"failedWithStatus":[400]}` and there was nothing to act on: Apple
returns 400 for a malformed VAPID JWT, a bad `k=`, and a body it will not accept. The body is now
kept and logged. With it kept, the same call answered:

```json
{"status":400,"detail":"{\"reason\":\"VapidPkHashMismatch\"}"}
```

## Rotating the VAPID keys invalidates every existing subscription

A push subscription is bound, permanently, to the VAPID public key that created it. Replace
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` and every subscription taken out under the old pair is
refused forever — Apple with `400 VapidPkHashMismatch`, not the `404`/`410` that means "gone".

Since 2026-08-31 the scan treats that reason as a dead subscription and deletes the row, so
Settings shows the toggle off and she can re-enable. Enabling also tears down whatever
subscription the browser is still holding first, because `pushManager.subscribe()` with a
different key throws `InvalidStateError` instead of re-keying — that is a dead end the UI can
only report as "try again".

**So: if you ever regenerate the VAPID pair (`scripts/generate-vapid.mjs`), every user has to
re-enable notifications.** There is no server-side migration for it; the old key is what the push
service hashed. Expect `[push] subscription was taken out under a different VAPID key` in the
logs, once per device, and then silence.

Alerts are driven by the Worker's cron (`*/15`), which runs both scans:

- `runReportScan` — report time, at the user's lead
- `runArrivalScan` — 60 / 30 / 0 minutes before arrival

Inspect state:

```bash
npx wrangler d1 execute danyeowa-db --remote --command \
  "SELECT flight_no, arr_utc, arrival_alert_stage FROM flights ORDER BY arr_utc DESC LIMIT 10;"
```

`arrival_alert_stage` is the smallest offset already sent — `NULL` none, `0` finished.

**A stamp is not proof of delivery.** `report_notified_at` and `arrival_alert_stage` record that a
send returned 2xx — the push service accepting the message, not a phone showing it. The only
end-to-end check is `/api/push/test` from the device itself.

First thing to check when "the alert never came": whether that account has a device at all.

```bash
npx wrangler d1 execute danyeowa-db --remote --command \
  "SELECT u.email, COUNT(ps.id) AS subs FROM user u \
   LEFT JOIN push_subscriptions ps ON ps.user_id = u.id GROUP BY u.id;"
```

On 2026-08-31 that returned one subscription across the whole database. A user with no device is
now skipped without being claimed, so subscribing later still catches an alert that has not yet
passed — before that fix, the flight was stamped and lost.

Failed sends log to Workers Logs (`observability` is on in `wrangler.jsonc`):

```
[push] send failed status=<http status> host=<push service host>
```

Endpoint host only, never the full URL — its path segment is the subscription's bearer credential.

If wrangler picks the wrong account (`code: 7403`, "not authorized to access this service"), the
account has to be named explicitly — this login can see four:

```bash
export CLOUDFLARE_ACCOUNT_ID=08d39249abaa892047690aa4c0c34b3a
```

## Local sign-in

`logan@example.com` / `123123`. Any other address gets a random code, readable at
`/api/__e2e/last-otp?email=…`.

## When e2e fails in CI and passes on a re-run

Do not call it flake. Read the trace — it is already uploaded.

```bash
gh run download <run-id> --repo LOGANLEEE/danyeowa --name playwright-report --dir /tmp/ci
unzip -o /tmp/ci/test-results/<spec-dir>/trace.zip -d /tmp/ci/unz
```

`0-trace.trace` is JSON-per-line: `type=before` entries are the actions with timings, `type=log`
is Playwright's own reasoning ("element is not stable", "click action done"), and
`type=frame-snapshot` holds the DOM after each one. `error-context.md` beside it is the page at
the moment of failure.

That is how the 2026-08-31 "flake" was named in one read: the click was performed and the day
still read `aria-pressed="false"`, because the month-slide animation was still running. See
`DECISIONS.md`. **A re-run passing is not evidence about the cause.**

## When a change seems to have no effect

A stale `wrangler dev` keeps the port and serves an old bundle. `workerd` can respawn after its
parent dies — kill the parent, then the child, then confirm the port is free.
