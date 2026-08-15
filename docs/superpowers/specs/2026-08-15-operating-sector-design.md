# Operating sector — which leg is hers

A multi-sector flight number is one aircraft routing, not one crew duty. EK205 flies
DXB → MXP → JFK; the crew can change at Milan. Today the app stores every leg the schedule
returns, so a crew member who finishes at MXP is recorded as landing at JFK.

That is wrong in the one place the app exists to be right: **the landing time the partner reads to
decide when to leave for the airport.** EK205 says 18:55 JFK when the answer is 14:10 MXP.

## Decisions

Taken 2026-08-15, in conversation:

1. **She picks a final destination.** She always starts at the first sector (out of home base) and
   may finish before the aircraft does. One control, not a range — joining partway is not a case
   that occurs on her roster.
2. **The unflown sector is kept, marked not-operating** — not discarded. The routing stays true and
   the day card can say "aircraft continues to JFK".
3. **Safe by default.** The unflown sector must not sit in the field consumers already read. A
   consumer that knows nothing about this feature must get the *correct* answer.

## Data model

```sql
-- 0014_add_flight_operating.sql
ALTER TABLE flights ADD COLUMN operating integer NOT NULL DEFAULT 1;
```

Additive, so every existing row becomes operating — correct, because today the app only ever
stored legs the crew flies. Ships through CI before the code, per the production-safety rule.

`scheduleLegSeq` is **not** re-indexed when a leg is marked non-operating. It is that leg's index
within the flight's own schedule and `POST /schedule/confirm` upserts against it; re-indexing
would write a phantom leg into the crowd-sourced schedule layer, which `useTripEntry.ts` already
warns about.

## The API shape is the safety mechanism

`GET /api/trips` and `GET /api/crew/:userId/trips` partition:

```ts
type TripWithFlights = {
  id: string;
  flights: Flight[];       // operating only — what every existing consumer reads
  continuation: Flight[];  // the aircraft's onward sectors, ordered; opt-in
};
```

Nothing that reads `flights` needs to change or even know this feature exists. Forgetting the flag
yields the right answer, because the wrong data is not in the field being read.

### The one place this does not protect

`worker/src/report-scan.ts:112` queries `flights` **directly**, by `arrUtc`, with no trip context —
it never goes through the API. It must gain `eq(flights.operating, true)` on both the report-time
and arrival-alert queries, or push will announce a landing she is not on.

This is the highest-risk change in the spec and gets a test proven failing first.

## UI

**Add / edit form** — a segmented control listing each leg's destination, defaulting to the last
(today's behaviour):

```
EK205   DXB → MXP → JFK
Final destination   [ MXP ] [ JFK ]
```

Choosing MXP marks the MXP→JFK leg `operating: false`. The leg stays visible in the preview,
muted, so she can see what she is excluding.

**Day card** — `TripLegsPanel` opts in to `continuation` and renders it muted under the operating
legs, labelled as the aircraft's onward routing, with no report time.

**Edit re-asks.** The day card's pencil re-runs the whole lookup-and-create pipeline rather than
patching legs, so the final-destination choice does not survive an edit implicitly. The control
must be pre-set to the saved choice when editing, or a corrected trip silently reverts to the full
routing.

## Testing

- **worker, failing-first:** `report-scan` must not alert on a non-operating leg — both report and
  arrival stages. This is the one that bypasses the safe default.
- **worker:** `GET /api/trips` partitions; a trip with no continuation returns `continuation: []`.
- **web:** the segmented control marks the right legs; editing a saved trip pre-selects the saved
  final destination.
- **e2e:** enter a two-sector flight number, choose the first destination as final, assert the day
  card's landing time is the first sector's arrival and the calendar arrow points at that station.
- **Real browser at 390px:** the segmented control and the muted continuation must not overflow,
  and every control stays ≥44px with ≥16px type.

## Not in scope

- Joining partway through a routing (decision 1).
- Deadheading as a distinct concept — a sector she rides but does not work is not modelled here,
  and `operating` should not be overloaded to mean it later without revisiting this.

## Open

- Whether the partner's view should mention the onward routing at all. It is honest, but the
  partner only needs the landing time; leaning towards not showing it.
