# What danyeowa does

A running inventory of what is actually built, so a new session doesn't have to re-read the
codebase to find out. Status words mean exactly one thing:

- **Live** — in production, and verified working there, not just green in tests.
- **Built** — merged and deployed, but never confirmed against reality.
- **Partial** — works within a stated limit; the limit is named.
- **Not built** — deliberately, with the reason. See `DECISIONS.md` for the argument.
- **Unmerged** — written and tested, sitting on a branch. Not in production, no matter how done it
  looks in the code.

---

## Roster

| Feature | Status | Notes |
|---|---|---|
| Month calendar with duty markers | Live | Glyph + station per day: `↗BKK` out, `↙AKL` back, `⇄BKK` turnaround, `→` sector, `·` layover |
| Swipe between months | Live | Finger-following carousel (PR #40): prev/next months render either side, the track follows the drag and settles on release. 50px threshold, cancels on vertical intent |
| Tap a day to see the trip | Live | One tap. No bottom sheet — it was deleted, see DECISIONS |
| Add a trip inline on an empty day | Live | Flight-code input appears immediately; airline prefix is a setting, digits only |
| Turnarounds in one save | Live | Second flight appends to the same preview before saving |
| Edit / delete on the card | Live | Pencil and bin. Editing is create-then-delete, never the reverse |
| Trip detail with leg timeline | Live | Report → depart → land, with layovers between sectors — on the day card, which is the only trip surface now |
| Manual entry when a lookup misses | Live | Only appears after a lookup actually returns empty |

## Notifications

| Feature | Status | Notes |
|---|---|---|
| Report-time alert | Built | Fires at the user's lead (default 120 min) before report |
| Arrival alerts, 60 / 30 / 0 min | Live | Verified in production on a real EK373 arrival, delivered to an iOS PWA |
| Arrival alerts on/off in Settings | Built | `notification_prefs.arrival_enabled`, independent of report alerts |
| Lead time 30–360 min | Built | Applies to report alerts only; arrival stages are fixed |
| Self-test push | Live | `GET /api/push/test` sends to the caller's own devices |
| Delay / early-arrival tracking | Built | `scripts/refresh-arrivals.mjs` on a Mac cron corrects `arr_utc` from live data and re-arms the alert stages. Verified on an airborne EK4 |

## Schedule data

| Feature | Status | Notes |
|---|---|---|
| Flight lookup by number | Live | Cache-first from `flight_schedules`, then the provider chain |
| Multi-leg services | Live | EK247 = DXB→GIG→EZE as two legs of one service |
| Local harvester | Live | `scripts/fetch-schedules.mjs` — real Chrome, fr24 JSON API, writes prod D1. On cron at :05/:35, working from the live roster |
| Negative cache for misses | Partial | Still records a miss when the fetch was *blocked*, which poisons a live flight for the TTL |
| Live flight status (ETA) | Built | Needs the Mac awake. Real Chrome cookies + automation markers off; see RUNBOOK |

## Account and sharing

| Feature | Status | Notes |
|---|---|---|
| Email OTP sign-in | Live | Fixed dev code locally; unreachable in production |
| Google sign-in | Live in prod only | Cannot work on localhost or preview URLs — Google needs exact redirect URIs |
| Share a roster by link | Built | `/share/:token`, public link, no account needed |
| Crew sharing (per-person) | Built | Invite by email on the Share tab; once accepted, both sides read each other's calendar through the badge row. Read-only in both directions — no write route takes a user id. Schema and routes verified in production (PR #41); the invite→accept flow itself has only been run against a local server, since exercising it on production would leave two throwaway accounts in the real database |

## App shell

| Feature | Status | Notes |
|---|---|---|
| PWA install | Live | Install button where supported, iOS gets the Share → Add to Home Screen hint |
| Install nudge banner | **Unmerged** | PR #31 |
| Dark / light theme | Live | Semantic tokens only, no raw hex outside `tokens.css` |
| Zoom disabled app-wide | Live | Requested explicitly; 16px floor on controls is what actually fixes the iOS layout bug |
| Offline / service worker | Built | Push delivery depends on it |
| Boot splash | Live | Boarding-pass stub in `index.html`, dismissed by `#root:not(:empty)` alone — one DOM node from first paint to first view |

## Deliberately not built

Weather and sunset at destination · destination news · async schedule reconciliation · a second
D1 for previews · a leg chooser for multi-leg flights. Reasons in `DECISIONS.md`.

## Deliberately removed

- **Trips tab** — a second list of the duties the calendar already shows, one row per leg, which
  read as a chart of unranked things. Deleted 2026-08-13 along with the full-screen trip detail it
  was the only way into.
- **Leg-level time editing** — went with that detail screen, and `PATCH /api/flights/:id` went with
  it on 2026-08-13 once nothing called it. `LegPatchSchema` went too.
- **Scroll-to-expand duty timeline** and the **DaySheet**. See `DECISIONS.md`.

---

## Known limits

**Live status depends on a Mac being awake.** Arrival corrections come from a launchd agent on
this machine, because fr24's live endpoints refuse a Cloudflare Worker and a direct request alike.
While the Mac sleeps nothing runs; launchd fires the missed interval on wake, so a nap costs a
delay in the correction rather than losing it, and a long sleep still leaves alerts on the
timetable — correct for an on-time flight, early for a delayed one.

The escape is the fr24 API at $9/month: the Worker would call it directly, and both the refresher
and the harvester would stop needing a browser at all.

~~The negative cache records a miss when a fetch was blocked~~ — **fixed 2026-08-12.** Providers
now report `absent` (answered, no such flight) separately from `unavailable` (blocked, timed out,
no key), and only `absent` is cached.
