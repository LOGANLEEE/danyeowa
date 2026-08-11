# What roaster-me does

A running inventory of what is actually built, so a new session doesn't have to re-read the
codebase to find out. Status words mean exactly one thing:

- **Live** — in production, and verified working there, not just green in tests.
- **Built** — merged and deployed, but never confirmed against reality.
- **Partial** — works within a stated limit; the limit is named.
- **Not built** — deliberately, with the reason. See `DECISIONS.md` for the argument.

---

## Roster

| Feature | Status | Notes |
|---|---|---|
| Month calendar with duty markers | Live | Glyph + station per day: `↗BKK` out, `↙AKL` back, `⇄BKK` turnaround, `→` sector, `·` layover |
| Swipe between months | Live | Pointer events, 50px threshold, cancels on vertical intent |
| Tap a day to see the trip | Live | One tap. No bottom sheet — it was deleted, see DECISIONS |
| Add a trip inline on an empty day | Live | Flight-code input appears immediately; airline prefix is a setting, digits only |
| Turnarounds in one save | Live | Second flight appends to the same preview before saving |
| Edit / delete on the card | Live | Pencil and bin. Editing is create-then-delete, never the reverse |
| Trip detail with leg timeline | Live | Report → depart → land, with layovers between sectors |
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
| Local harvester | Live | `scripts/fetch-schedules.mjs` — real Chrome, fr24 JSON API, writes prod D1 |
| Negative cache for misses | Partial | Still records a miss when the fetch was *blocked*, which poisons a live flight for the TTL |
| Live flight status (ETA) | Built | Needs the Mac awake. Real Chrome cookies + automation markers off; see RUNBOOK |

## Account and sharing

| Feature | Status | Notes |
|---|---|---|
| Email OTP sign-in | Live | Fixed dev code locally; unreachable in production |
| Google sign-in | Live in prod only | Cannot work on localhost or preview URLs — Google needs exact redirect URIs |
| Share a roster by link | Built | `/share/:token`, public link, no account needed |
| Per-person sharing | Not built | A different data model. Needs a design conversation first |

## App shell

| Feature | Status | Notes |
|---|---|---|
| PWA install | Live | Install button where supported, iOS gets the Share → Add to Home Screen hint |
| Install nudge banner | Built | |
| Dark / light theme | Live | Semantic tokens only, no raw hex outside `tokens.css` |
| Zoom disabled app-wide | Live | Requested explicitly; 16px floor on controls is what actually fixes the iOS layout bug |
| Offline / service worker | Built | Push delivery depends on it |

## Deliberately not built

Weather and sunset at destination · destination news · async schedule reconciliation · a second
D1 for previews · a leg chooser for multi-leg flights. Reasons in `DECISIONS.md`.

---

## Known limits

**Live status depends on a Mac being awake.** Arrival corrections come from a cron on this
machine, because fr24's live endpoints refuse a Cloudflare Worker and a direct request alike. If
the Mac is asleep, alerts fall back to the timetable — correct for an on-time flight, early for a
delayed one.

The escape is the fr24 API at $9/month: the Worker would call it directly, and both the refresher
and the harvester would stop needing a browser at all.

**The negative cache still records a miss when a fetch was blocked**, which can poison a live
flight for the TTL. That is what made EK247 unresolvable before the harvester took over the cache.
