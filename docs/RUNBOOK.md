# Runbook

How to run the things that aren't `pnpm dev`. Every command here has been run against production
at least once — where one hasn't, it says so.

## Deploy

```bash
pnpm --filter @roaster/web build     # MUST come first: wrangler ships whatever is in web/dist
npx wrangler deploy
```

Then verify the deploy rather than trusting it — a mid-deploy fetch returns the *previous* bundle
hash, which looks exactly like a failed deploy:

```bash
curl -s "https://roaster-me.logan-lee.workers.dev/?cb=$RANDOM" | grep -o 'index-[A-Za-z0-9_-]*\.js'
# must match the hash printed by the build
```

**A failed web build does not stop `wrangler deploy`.** It will happily ship the worker with stale
assets. Check the build's exit status before deploying.

Merging to `main` also deploys, via GitHub Actions, after typecheck + unit + e2e.

## Database migrations

Drizzle files live in `drizzle/`. Applying to production is manual:

```bash
npx wrangler d1 execute roaster-me-db --remote --command "ALTER TABLE ..."
npx wrangler d1 execute roaster-me-db --remote --command \
  "SELECT name FROM pragma_table_info('flights');"     # confirm it landed
```

The preview environment **shares production's D1**. Trips added through a preview URL are real.

## Harvesting schedules

Fills `flight_schedules` from flightradar24's JSON API, driven by a real Chrome (a direct request
gets a Cloudflare 403).

**On cron already**, at :05 and :35, capped at 15 flights a run:

```
5,35 * * * * <node> <repo>/scripts/fetch-schedules.mjs --live-roster --limit 15 --apply
```

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

## Refreshing arrival times against reality

Corrects stored arrival times against live flightradar24 data, and clears `arrival_alert_stage`
so the 60/30/0 alerts re-arm against the corrected time.

```bash
node scripts/refresh-arrivals.mjs --hours 12        # dry-run
node scripts/refresh-arrivals.mjs --apply           # writes to prod D1
```

Cron, every 15 minutes to match the Worker's alert scan (`crontab -e`):

```
*/15 * * * * /usr/bin/env node scripts/refresh-arrivals.mjs --apply >> /tmp/roaster-refresh.log 2>&1
```

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

## Push notifications

```bash
# Send yourself a test push — open this in the app on the phone, signed in
https://roaster-me.logan-lee.workers.dev/api/push/test
```

Returns `{"sent":1,...}` on success. `failedWithStatus` carries the push service's HTTP status;
404/410 means the subscription expired and it has been removed.

Alerts are driven by the Worker's cron (`*/15`), which runs both scans:

- `runReportScan` — report time, at the user's lead
- `runArrivalScan` — 60 / 30 / 0 minutes before arrival

Inspect state:

```bash
npx wrangler d1 execute roaster-me-db --remote --command \
  "SELECT flight_no, arr_utc, arrival_alert_stage FROM flights ORDER BY arr_utc DESC LIMIT 10;"
```

`arrival_alert_stage` is the smallest offset already sent — `NULL` none, `0` finished.

## Local sign-in

`logan@example.com` / `123123`. Any other address gets a random code, readable at
`/api/__e2e/last-otp?email=…`.

## When a change seems to have no effect

A stale `wrangler dev` keeps the port and serves an old bundle. `workerd` can respawn after its
parent dies — kill the parent, then the child, then confirm the port is free.
