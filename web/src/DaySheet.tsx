import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Flight, LegPatch, ScheduleSuggestion } from "@roaster/shared";
import { addDaysIso, formatHours, formatLocal, localDateKey, wallToUtc } from "@roaster/shared";
import { deleteTrip, patchFlight, suggestReturns } from "./api";
import type { TripWithFlights } from "./api";
import { useRecentFlights } from "./useRecentFlights";
import { useTripEntry } from "./useTripEntry";
import type { UseTripEntryReturn } from "./useTripEntry";

/** Crew's home base IATA — return suggestions are hidden once a trip already ends here. */
const HOME_BASE_IATA = "DXB";

/** Max return-suggestion chips rendered (server may return up to 8; client caps display at 3
 * per the plan's chip-row density budget). */
const MAX_RETURN_CHIPS = 3;

/** A trip's away-span as local calendar dates (first departure's to last arrival's local
 * date, in `homeTz`) — null if the trip has no flights. */
function tripSpan(trip: TripWithFlights, homeTz: string): { firstDay: string; lastDay: string } | null {
  const legs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (!first || !last) return null;
  return { firstDay: localDateKey(first.depUtc, homeTz), lastDay: localDateKey(last.arrUtc, homeTz) };
}

/** Every local calendar date (YYYY-MM-DD) in a trip's away-span, inclusive. */
function tripSpanDays(trip: TripWithFlights, homeTz: string): string[] {
  const span = tripSpan(trip, homeTz);
  if (!span) return [];
  const days: string[] = [];
  for (let day = span.firstDay; day <= span.lastDay; day = addDaysIso(day, 1)) {
    days.push(day);
  }
  return days;
}

/** Whether `isoDate` falls within any trip's away-span (first departure's to last arrival's
 * local calendar date), in `homeTz`. Used by rapid-entry's next-date suggestion to skip days
 * that already have a trip — a lightweight day-membership check (candidates are always a
 * handful of days out), unlike the month-scoped `tripDaysInMonth` used by the calendar grid. */
function isDayOccupied(isoDate: string, trips: TripWithFlights[], homeTz: string): boolean {
  return trips.some((trip) => {
    const span = tripSpan(trip, homeTz);
    return span !== null && isoDate >= span.firstDay && isoDate <= span.lastDay;
  });
}

type Props = {
  /** Local ISO date ("YYYY-MM-DD") this sheet is open for. */
  isoDate: string;
  /** The trip covering this day, or null when the day is empty. */
  trip: TripWithFlights | null;
  /** All trips already fetched by the caller — used for recent-flight chips and to skip
   * occupied days when suggesting the next rapid-entry date. No extra fetch. */
  trips: TripWithFlights[];
  homeTz: string;
  onClose: () => void;
  /** Called once, on dismiss (Done / scrim / close / Escape) — caller should refetch trips.
   * NOT called per-add during rapid entry, to keep chaining snappy. */
  onChanged: () => void;
  /** Called after each successful add with the isoDate that was added, so the caller can mark
   * the day optimistically (no refetch needed for that). */
  onAdded: (isoDate: string) => void;
};

type LegEdits = { dep: string; arr: string; report: string };

/** Converts a UTC ISO instant to a local wall `YYYY-MM-DDTHH:mm` string in the given tz. */
function utcToDatetimeLocal(utcIso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcIso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Converts a `YYYY-MM-DDTHH:mm` datetime-local value to the wall-ISO seconds format wallToUtc expects. */
function toWallIso(datetimeLocal: string): string {
  return datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal;
}

function legEditsFrom(flight: Flight): LegEdits {
  return {
    dep: utcToDatetimeLocal(flight.depUtc, flight.depTz),
    arr: utcToDatetimeLocal(flight.arrUtc, flight.arrTz),
    report: utcToDatetimeLocal(flight.reportUtc, flight.depTz),
  };
}

/** Humanizes a local ISO calendar date ("YYYY-MM-DD") as "Wed 20 Aug" (weekday short + day
 * + month short) using the home tz's own calendar — reuses formatLocal's withDate branch
 * (weekday/day/month/hour/minute) by feeding it a synthetic noon-UTC instant for that
 * calendar date (noon avoids any tz day-boundary slippage for all realistic offsets), then
 * drops the time portion. */
export function humanDateLabel(isoDate: string, homeTz: string): string {
  return formatLocal(`${isoDate}T12:00:00.000Z`, homeTz, { withDate: true }).split(" ").slice(0, 3).join(" ");
}

function dayTitle(isoDate: string, homeTz: string, hasTrip: boolean): string {
  const label = humanDateLabel(isoDate, homeTz);
  return hasTrip ? label : `${label} — add trip`;
}

/** Inline leg editor for an existing trip's flight — the edit essentials from TripDetail. */
function LegEditor({
  flight,
  onSaved,
}: {
  flight: Flight;
  onSaved: (updated: Flight) => void;
}) {
  const [edits, setEdits] = useState<LegEdits>(() => legEditsFrom(flight));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    const patch: LegPatch = {};
    const depUtc = wallToUtc(toWallIso(edits.dep), flight.depTz);
    const arrUtc = wallToUtc(toWallIso(edits.arr), flight.arrTz);
    const reportUtc = wallToUtc(toWallIso(edits.report), flight.depTz);
    if (depUtc !== flight.depUtc) patch.depUtc = depUtc;
    if (arrUtc !== flight.arrUtc) patch.arrUtc = arrUtc;
    if (reportUtc !== flight.reportUtc) patch.reportUtc = reportUtc;

    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    try {
      const updated = await patchFlight(flight.id, patch);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update flight");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`dep-${flight.id}`} className="text-sm text-ink-muted">
        Departure (local)
      </label>
      <input
        id={`dep-${flight.id}`}
        type="datetime-local"
        value={edits.dep}
        onChange={(e) => setEdits({ ...edits, dep: e.target.value })}
        className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
      />

      <label htmlFor={`arr-${flight.id}`} className="text-sm text-ink-muted">
        Arrival (local)
      </label>
      <input
        id={`arr-${flight.id}`}
        type="datetime-local"
        value={edits.arr}
        onChange={(e) => setEdits({ ...edits, arr: e.target.value })}
        className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
      />

      <label htmlFor={`report-${flight.id}`} className="text-sm text-report">
        Report (local)
      </label>
      <input
        id={`report-${flight.id}`}
        type="datetime-local"
        value={edits.report}
        onChange={(e) => setEdits({ ...edits, report: e.target.value })}
        className="num rounded border border-edge bg-raised px-3 py-2 text-report outline-none transition-colors duration-[120ms] focus:border-accent"
      />

      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {error}
        </p>
      )}

      <button
        type="button"
        data-testid="save-leg"
        disabled={saving}
        onClick={save}
        className="min-h-[48px] rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

/** Existing-trip content: route summary per leg, inline edit, delete-with-confirm. */
function ExistingTripContent({
  trip,
  onChanged,
  onClose,
}: {
  trip: TripWithFlights;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [flights, setFlights] = useState<Flight[]>(trip.flights);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteTrip(trip.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trip");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {[...flights]
        .sort((a, b) => a.legSeq - b.legSeq)
        .map((flight) => {
          const isEditing = editingId === flight.id;
          return (
            <div key={flight.id} className="flex flex-col gap-2 rounded-lg border border-edge bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-ink">
                  {flight.origin} → {flight.dest} <span className="text-ink-muted">{flight.flightNo}</span>
                </p>
                {!isEditing && (
                  <button
                    type="button"
                    data-testid="edit-leg"
                    onClick={() => setEditingId(flight.id)}
                    className="min-h-[44px] rounded border border-edge px-3 py-1 text-sm text-ink transition-colors duration-[120ms] hover:border-ink-muted"
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <LegEditor
                  flight={flight}
                  onSaved={(updated) => {
                    setFlights((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
                    setEditingId(null);
                    onChanged();
                  }}
                />
              ) : (
                <>
                  <p className="num text-sm text-ink-muted">
                    dep {formatLocal(flight.depUtc, flight.depTz)} → arr {formatLocal(flight.arrUtc, flight.arrTz)}
                  </p>
                  <p className="num text-sm text-report">Report {formatLocal(flight.reportUtc, flight.depTz)}</p>
                </>
              )}
            </div>
          );
        })}

      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {error}
        </p>
      )}

      {confirmingDelete ? (
        <div className="flex flex-col gap-2 rounded-lg border border-edge bg-raised p-4">
          <p className="text-ink">Delete trip? This can't be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="confirm-delete"
              disabled={deleting}
              onClick={confirmDelete}
              className="min-h-[48px] rounded border border-edge bg-raised px-3 py-2 font-medium text-ink transition-colors duration-[120ms] hover:border-ink-muted disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="min-h-[48px] rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="delete-trip"
          onClick={() => setConfirmingDelete(true)}
          className="min-h-[48px] self-start rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
        >
          Delete trip
        </button>
      )}
    </div>
  );
}

/** Finds the next trip-free day after `fromIsoDate`, skipping days occupied by an existing
 * trip or one added earlier this rapid-entry session (`justAdded`). */
function nextFreeDate(
  fromIsoDate: string,
  trips: TripWithFlights[],
  justAdded: ReadonlySet<string>,
  homeTz: string,
): string {
  let candidate = addDaysIso(fromIsoDate, 1);
  for (let i = 0; i < 366; i++) {
    if (!justAdded.has(candidate) && !isDayOccupied(candidate, trips, homeTz)) return candidate;
    candidate = addDaysIso(candidate, 1);
  }
  return candidate;
}

/** Muted "+ add flight" control shown under the preview card while previewing a single
 * flight (hidden once a flight is already appended — the ✕ on the appended card is the only
 * way back to single-flight state). Tapping it reveals a small inline flight-no input; Enter
 * or the "add" button fires the second lookup via `entry.appendFlight`. A lookup miss shows
 * an inline muted error under the input — appended flights are schedule-known only, no
 * manual-mode fallback (manual turnarounds remain possible via the pre-existing multi-leg
 * manual path). */
function AppendFlightControl({ entry }: { entry: UseTripEntryReturn }) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");

  if (!expanded) {
    return (
      <button
        type="button"
        data-testid="append-flight"
        onClick={() => setExpanded(true)}
        className="w-fit text-sm text-ink-muted underline transition-colors duration-[120ms] hover:text-ink"
      >
        + add flight
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          data-testid="append-flightno-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void entry.appendFlight(value);
            }
          }}
          placeholder="e.g. EK098"
          className="num rounded border border-edge bg-card px-2 py-1 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void entry.appendFlight(value)}
          className="min-h-[44px] rounded border border-edge px-3 py-1 text-sm text-ink transition-colors duration-[120ms] hover:border-ink-muted"
        >
          Add
        </button>
      </div>
      {entry.appendLookupMiss && (
        <p className="text-sm text-ink-muted">unknown flight — try another number</p>
      )}
    </div>
  );
}

/** Empty-day content: flight-no -> autofill preview -> "Add to roster", with an inline
 * manual fallback on a lookup miss. Driven entirely by useTripEntry. After a successful add,
 * chains into a rapid-entry "added" state (Plan 6 Task 5): the sheet stays open, the flight
 * field clears + refocuses, recent-flight chips offer a one-tap re-add, and a next-date
 * suggestion (skipping occupied days, including ones just added) advances the picked date for
 * the next entry — without a per-add refetch (the parent marks the day optimistically). */
function AddTripContent({
  isoDate,
  homeTz,
  trips,
  onDone,
  onAdded,
}: {
  isoDate: string;
  homeTz: string;
  trips: TripWithFlights[];
  /** Dismisses the sheet — fires the parent's single refetch, then closes. */
  onDone: () => void;
  onAdded: (isoDate: string) => void;
}) {
  const flightNoInputRef = useRef<HTMLInputElement>(null);
  const [pickedDate, setPickedDate] = useState(isoDate);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [showDateStrip, setShowDateStrip] = useState(false);
  // Flight numbers added THIS session, most-recent-first — `trips` is stale until the
  // sheet's next refetch (only fires on dismiss), so a fresh session needs its own record
  // to offer the just-added flight as a chip immediately, not just after Done.
  const [sessionFlightNos, setSessionFlightNos] = useState<string[]>([]);
  const recentFlights = useRecentFlights(trips, sessionFlightNos);
  // Return-flight suggestions for the just-added trip, when it ends away from home base -
  // fire-and-forget fetched after each save, cleared on the next add so a stale list from a
  // prior save never lingers over a new one.
  const [returnSuggestions, setReturnSuggestions] = useState<ScheduleSuggestion[]>([]);

  // Single shared post-save transition for BOTH entry paths (autofill and manual): stamps
  // the rapid-entry "added" state, advances to the next suggested date, marks the day
  // optimistically, and returns to the flight-no screen with the field cleared + refocused -
  // so a manual save (the fallback used exactly when autofill misses) chains exactly like an
  // autofill save instead of dead-ending on a stale form.
  const entry = useTripEntry({
    pickedDate,
    homeTz,
    onSubmitted: (createdTrip) => {
      const addedDate = pickedDate;
      // Mark every local calendar day the SAVED trip actually spans as occupied, not just
      // the tapped date — a multi-leg trip (e.g. a 3-day EK412 DXB->SYD->CHC) away-spans
      // several days, and "next:" must skip past all of them, not land back inside the trip.
      const spanDays = tripSpanDays(createdTrip, homeTz);
      const updatedJustAdded = new Set(justAdded);
      if (spanDays.length > 0) {
        for (const day of spanDays) updatedJustAdded.add(day);
      } else {
        // Defensive fallback if the server ever returns a trip with no flights.
        updatedJustAdded.add(addedDate);
      }
      setJustAdded(updatedJustAdded);
      setLastAdded(addedDate);
      const suggestion = nextFreeDate(addedDate, trips, updatedJustAdded, homeTz);
      setNextDate(suggestion);
      setPickedDate(suggestion);
      setShowDateStrip(false);
      onAdded(addedDate);
      const savedFlightNo = createdTrip.flights[0]?.flightNo;
      if (savedFlightNo) {
        setSessionFlightNos((prev) => [savedFlightNo, ...prev.filter((f) => f !== savedFlightNo)]);
      }
      entry.switchToFlightNo();
      entry.setFlightNo("");

      // Return-suggestion chips (Task 3): only when the SAVED trip's final leg lands away
      // from home base — a trip that already returns home has nothing to suggest.
      setReturnSuggestions([]);
      const sortedFlights = [...createdTrip.flights].sort((a, b) => a.legSeq - b.legSeq);
      const finalLeg = sortedFlights[sortedFlights.length - 1];
      if (finalLeg && savedFlightNo && finalLeg.dest !== HOME_BASE_IATA) {
        const nextDayIso = addDaysIso(localDateKey(finalLeg.arrUtc, finalLeg.arrTz), 1);
        suggestReturns({
          origin: finalLeg.dest,
          date: nextDayIso,
          home: HOME_BASE_IATA,
          outbound: savedFlightNo,
          arrivedIso: finalLeg.arrUtc,
        })
          .then((res) => setReturnSuggestions(res.suggestions))
          .catch(() => setReturnSuggestions([]));
      }
    },
  });

  useEffect(() => {
    if (entry.mode === "flightno") flightNoInputRef.current?.focus();
  }, [entry.mode, lastAdded]);

  function chooseChip(flightNo: string) {
    entry.setFlightNo(flightNo);
  }

  /** Tapping a return-suggestion chip prefills add-mode on the suggestion's own resolved
   * operating date (replacing whatever the banner's next-date suggestion currently is) and
   * sets the flight number, reusing the existing debounced-lookup flow exactly like typing
   * or a recent-flight chip would. */
  function chooseReturnChip(suggestion: ScheduleSuggestion) {
    setPickedDate(suggestion.dateIso);
    entry.setFlightNo(suggestion.flightNo);
  }

  if (entry.mode === "flightno") {
    return (
      <div className="flex flex-col gap-4">
        {lastAdded && (
          <div data-testid="rapid-banner" className="rounded border border-edge bg-raised p-3 text-sm text-ink">
            <p>✓ Added {humanDateLabel(lastAdded, homeTz)}</p>
            <p>
              next:{" "}
              <button
                type="button"
                data-testid="rapid-next-date"
                onClick={() => setShowDateStrip((v) => !v)}
                className="underline decoration-dotted"
              >
                {nextDate && humanDateLabel(nextDate, homeTz)}
              </button>
            </p>
            {showDateStrip && (
              <div data-testid="rapid-date-strip" className="mt-2 flex flex-wrap gap-1">
                {Array.from({ length: 7 }, (_, i) => addDaysIso(lastAdded, i + 1)).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => {
                      setPickedDate(candidate);
                      setNextDate(candidate);
                      setShowDateStrip(false);
                    }}
                    className={[
                      "num rounded border px-2 py-1 text-xs transition-colors duration-[120ms]",
                      candidate === pickedDate
                        ? "border-accent text-accent"
                        : "border-edge text-ink-muted hover:border-ink-muted",
                    ].join(" ")}
                  >
                    {candidate.slice(5)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void entry.handleAutofillSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <label htmlFor="flightno-input" className="text-sm text-ink-muted">
            Flight number
          </label>
          <input
            id="flightno-input"
            data-testid="flightno-input"
            ref={flightNoInputRef}
            autoFocus
            value={entry.flightNo}
            onChange={(e) => entry.setFlightNo(e.target.value.toUpperCase())}
            placeholder="e.g. EK412"
            className="num rounded border border-edge bg-raised px-3 py-2 text-lg text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
          />

          {returnSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {returnSuggestions.slice(0, MAX_RETURN_CHIPS).map((suggestion) => (
                <button
                  key={suggestion.flightNo}
                  type="button"
                  data-testid={`return-chip-${suggestion.flightNo}`}
                  onClick={() => chooseReturnChip(suggestion)}
                  className="rounded-full border border-edge px-3 py-1 text-sm text-ink transition-colors duration-[120ms] hover:border-accent"
                >
                  ↩ {suggestion.flightNo} · {humanDateLabel(suggestion.dateIso, homeTz)} ·{" "}
                  {formatHours(suggestion.layoverHours)}
                </button>
              ))}
            </div>
          )}

          {recentFlights.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recentFlights.map((flightNo) => (
                <button
                  key={flightNo}
                  type="button"
                  data-testid={`recent-chip-${flightNo}`}
                  onClick={() => chooseChip(flightNo)}
                  className="rounded-full border border-edge px-3 py-1 text-sm text-ink transition-colors duration-[120ms] hover:border-accent"
                >
                  {flightNo}
                </button>
              ))}
            </div>
          )}

          {entry.autofillLegs && entry.autofillFlightNo && (() => {
            const outboundLegs = entry.autofillLegs.filter((leg) => leg.flightNo === entry.autofillFlightNo);
            const appendedLegs = entry.appendedFlightNo
              ? entry.autofillLegs.filter((leg) => leg.flightNo === entry.appendedFlightNo)
              : [];
            const renderLegFields = (leg: (typeof entry.autofillLegs)[number], index: number) => {
              const reportLocal = entry.reportLocalFor(leg);
              const isEditingReport = entry.editingReportLeg === leg.legSeq;
              return (
                <div key={leg.legSeq} className="flex flex-col gap-2 border-t border-edge pt-3 first:border-t-0 first:pt-0">
                  <p className="text-ink">
                    {leg.origin} → {leg.dest}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label htmlFor={`autofill-dep-${leg.legSeq}`} className="text-sm text-ink-muted">
                      Dep
                    </label>
                    <input
                      id={`autofill-dep-${leg.legSeq}`}
                      data-testid="autofill-dep"
                      type="time"
                      value={leg.depTime}
                      onChange={(e) => entry.updateAutofillLeg(index, { depTime: e.target.value })}
                      className="num min-w-[5.5rem] rounded border border-edge bg-card px-2 py-1 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
                    />
                    <label htmlFor={`autofill-arr-${leg.legSeq}`} className="text-sm text-ink-muted">
                      Arr
                    </label>
                    <span className="inline-flex items-center gap-0.5">
                      <input
                        id={`autofill-arr-${leg.legSeq}`}
                        data-testid="autofill-arr"
                        type="time"
                        value={leg.arrTime}
                        onChange={(e) => entry.updateAutofillLeg(index, { arrTime: e.target.value })}
                        className="num min-w-[5.5rem] rounded border border-edge bg-card px-2 py-1 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
                      />
                      {leg.dayOffset > 0 && <sup className="num text-ink-muted">+{leg.dayOffset}</sup>}
                    </span>
                  </div>

                  {isEditingReport ? (
                    <input
                      data-testid="report-chip"
                      type="time"
                      autoFocus
                      value={reportLocal}
                      onChange={(e) =>
                        entry.setReportOverrides((prev) => new Map(prev).set(leg.legSeq, e.target.value))
                      }
                      onBlur={() => entry.setEditingReportLeg(null)}
                      className="num w-fit rounded border border-accent bg-card px-2 py-1 text-report outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid="report-chip"
                      onClick={() => entry.setEditingReportLeg(leg.legSeq)}
                      className="num w-fit rounded border border-edge px-2 py-1 text-sm text-report transition-colors duration-[120ms] hover:border-accent"
                    >
                      Report {reportLocal} · tap to edit
                    </button>
                  )}
                </div>
              );
            };

            return (
              <>
                <div data-testid="autofill-card" className="flex flex-col gap-3 rounded border border-edge bg-raised p-4">
                  {outboundLegs.map((leg, index) => renderLegFields(leg, index))}
                  <p className="text-sm text-ink-muted">times from schedule — edit if your roster differs</p>
                </div>

                {appendedLegs.length > 0 && (
                  <div data-testid="appended-card" className="flex flex-col gap-3 rounded border border-edge bg-raised p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-ink-muted">+ {entry.appendedFlightNo}</p>
                      <button
                        type="button"
                        data-testid="remove-appended"
                        aria-label="Remove appended flight"
                        onClick={entry.removeAppendedFlight}
                        className="min-h-[44px] min-w-[44px] rounded border border-edge px-2 text-ink-muted transition-colors duration-[120ms] hover:border-ink-muted"
                      >
                        ✕
                      </button>
                    </div>
                    {appendedLegs.map((leg, index) =>
                      renderLegFields(leg, outboundLegs.length + index),
                    )}
                  </div>
                )}

                {!entry.appendedFlightNo && <AppendFlightControl entry={entry} />}

                <button
                  type="submit"
                  disabled={entry.submitting}
                  className="min-h-[48px] rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  Add to roster
                </button>
              </>
            );
          })()}

        {!entry.autofillLegs && (
          <div className="flex flex-col gap-2">
            {entry.lookupMiss && <p className="text-sm text-ink-muted">unknown flight — enter details</p>}
            <button
              type="button"
              data-testid="manual-expand"
              onClick={entry.switchToManual}
              className="w-fit text-sm text-ink-muted underline transition-colors duration-[120ms] hover:text-ink"
            >
              enter manually
            </button>
          </div>
        )}

        {entry.error && (
          <p role="alert" className="text-sm text-ink-muted">
            {entry.error}
          </p>
        )}
        </form>

        {lastAdded && (
          <button
            type="button"
            data-testid="done-button"
            onClick={onDone}
            className="min-h-[48px] rounded border border-edge px-3 py-2 font-medium text-ink transition-colors duration-[120ms] hover:border-ink-muted"
          >
            Done for now
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void entry.handleManualSubmit();
      }}
      className="flex flex-col gap-4"
    >
      {entry.legs.map((leg, index) => {
        const originInfo = entry.airportLabel(leg.origin);
        const destInfo = entry.airportLabel(leg.dest);
        return (
          <fieldset key={index} className="flex flex-col gap-2 border-t border-edge pt-3 first:border-t-0 first:pt-0">
            <label htmlFor={`flight-no-${index}`} className="text-sm text-ink-muted">
              Flight no
            </label>
            <input
              id={`flight-no-${index}`}
              value={leg.flightNo}
              onChange={(e) => entry.updateLeg(index, { flightNo: e.target.value.toUpperCase() })}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`origin-${index}`} className="text-sm text-ink-muted">
              Origin
            </label>
            <input
              id={`origin-${index}`}
              value={leg.origin}
              onChange={(e) => entry.updateLeg(index, { origin: e.target.value.toUpperCase() })}
              onBlur={(e) => entry.lookupAirport(e.target.value)}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
            {originInfo && <p className="text-sm text-ink-muted">{originInfo}</p>}

            <label htmlFor={`dest-${index}`} className="text-sm text-ink-muted">
              Dest
            </label>
            <input
              id={`dest-${index}`}
              value={leg.dest}
              onChange={(e) => entry.updateLeg(index, { dest: e.target.value.toUpperCase() })}
              onBlur={(e) => entry.lookupAirport(e.target.value)}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
            {destInfo && <p className="text-sm text-ink-muted">{destInfo}</p>}

            <label htmlFor={`dep-${index}`} className="text-sm text-ink-muted">
              Departure (local)
            </label>
            <input
              id={`dep-${index}`}
              type="datetime-local"
              value={leg.dep}
              onChange={(e) => entry.updateLeg(index, { dep: e.target.value })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`arr-${index}`} className="text-sm text-ink-muted">
              Arrival (local)
            </label>
            <input
              id={`arr-${index}`}
              type="datetime-local"
              value={leg.arr}
              onChange={(e) => entry.updateLeg(index, { arr: e.target.value })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`report-${index}`} className="text-sm text-report">
              Report (local)
            </label>
            <input
              id={`report-${index}`}
              type="datetime-local"
              value={leg.report}
              onChange={(e) => entry.updateLeg(index, { report: e.target.value, reportTouched: true })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-report outline-none transition-colors duration-[120ms] focus:border-accent"
            />
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={entry.addLeg}
        className="min-h-[48px] rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
      >
        Add leg
      </button>

      <button
        type="submit"
        disabled={entry.submitting}
        className="min-h-[48px] rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        Add to roster
      </button>

      {entry.error && (
        <p role="alert" className="text-sm text-ink-muted">
          {entry.error}
        </p>
      )}
    </form>
  );
}

/** Bottom sheet: tap any calendar day to view its trip (edit/delete) or add one on an empty
 * day. Fixed, portal-rendered, dismissible via scrim tap or Escape. Focus moves into the
 * sheet on open and returns to the previously focused element on close. */
export default function DaySheet({ isoDate, trip, trips, homeTz, onClose, onChanged, onAdded }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Captured lazily on the initial render (before any effects run) so it reflects whatever
  // had focus BEFORE the sheet opened, not a child's own autofocus effect (e.g. the add
  // flow's flight-no input) — child effects fire before a parent's, so capturing this in a
  // useEffect would already see the child's autofocus result instead of the true prior focus.
  const previouslyFocused = useRef<HTMLElement | null>(null);
  if (previouslyFocused.current === null) {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
  }

  // Single dismiss path for scrim/close-button/Escape/"Done for now" - fires exactly one
  // refetch (onChanged) regardless of how many adds happened during rapid entry, then closes.
  function handleDismiss() {
    onChanged();
    onClose();
  }

  useEffect(() => {
    sheetRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, onChanged]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        data-testid="sheet-scrim"
        aria-label="Close"
        onClick={handleDismiss}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={sheetRef}
        data-testid="day-sheet"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="entrance relative flex max-h-[85vh] flex-col gap-4 overflow-y-auto rounded-t-[22px] border-t border-edge bg-card p-4 outline-none"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-edge" aria-hidden="true" />

        <div className="flex items-center justify-between">
          <p className="font-semibold text-ink">{dayTitle(isoDate, homeTz, trip !== null)}</p>
          <button
            type="button"
            data-testid="sheet-close"
            aria-label="Close"
            onClick={handleDismiss}
            className="min-h-[44px] rounded border border-edge px-3 py-1 text-sm text-ink-muted transition-colors duration-[120ms] hover:border-ink-muted"
          >
            Close
          </button>
        </div>

        {trip ? (
          <ExistingTripContent trip={trip} onChanged={onChanged} onClose={onClose} />
        ) : (
          <AddTripContent
            isoDate={isoDate}
            homeTz={homeTz}
            trips={trips}
            onDone={handleDismiss}
            onAdded={onAdded}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
