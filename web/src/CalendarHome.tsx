import { useEffect, useRef, useState } from "react";
import {
  dayOffset,
  formatDuration,
  formatLocal,
  layoverHours,
  localDateKey,
  tripProgress,
  tripDaysInMonth,
} from "@roaster/shared";
import { deleteTrip, getTrips } from "./api";
import type { TripWithFlights } from "./api";
import DaySheet, { humanDateLabel } from "./DaySheet";
import { digitsOf, getAirlinePrefix } from "./lib/airlinePrefix";
import TripLegsPanel from "./TripLegsPanel";
import TripsCalendar from "./TripsCalendar";
import { useTripEntry } from "./useTripEntry";

type Props = {
  now: Date;
  /** Bumped by the parent (e.g. the tab bar's center + button) to open the day sheet for
   * today, or the next trip-free day if today already has a trip. */
  openTodayToken?: number;
};

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PencilIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5V20zM14.5 6.5l3 3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4h6v3" />
    </svg>
  );
}

/** The trip's identity at a glance: route as the headline, flight and date beneath it, then the
 * sector as departure-board rows — REPORT, DEP, ARR, each a label/value pair on a hairline rule,
 * closed out by the elapsed-time figure. */
function TripSummaryLines({
  legs,
  actions,
}: {
  legs: TripWithFlights["flights"];
  /** Corner controls, rendered in the header row so they never steal width from the board. */
  actions?: React.ReactNode;
}) {
  const firstLeg = legs[0]!;
  const lastLeg = legs[legs.length - 1]!;
  const routeChain = [legs[0]!.origin, ...legs.map((leg) => leg.dest)].filter(
    (stop, index, all) => index === 0 || stop !== all[index - 1],
  );
  const arrOffset = dayOffset(firstLeg.depUtc, lastLeg.arrUtc, firstLeg.depTz, lastLeg.arrTz);
  // Length only earns a place on a pairing that actually spans days — "1 day" is noise.
  const tripDays = new Set(legs.map((leg) => formatLocal(leg.depUtc, leg.depTz, { withDate: true }).slice(0, 6)))
    .size;
  // Weekday + day + month only: the year is never in question on a roster, and the +N on the
  // arrival already says when a red-eye actually lands.
  const depDate = formatLocal(firstLeg.depUtc, firstLeg.depTz, { withDate: true }).split(" ").slice(0, 3).join(" ");
  const duration = formatDuration(firstLeg.depUtc, lastLeg.arrUtc);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xl font-semibold tracking-tight text-ink">{routeChain.join(" → ")}</p>
          <p className="text-sm text-ink-muted">
            {firstLeg.flightNo} · {depDate}
            {tripDays > 1 && ` · ${tripDays} days`}
          </p>
        </div>
        {actions}
      </div>

      {/* Board rows: label left (small, uppercase, tracked, muted — amber for REPORT since
          that's the one time worth flagging), value right (tabular). Dashed hairlines between
          rows read as the split-flap rule this direction is named for; a justify-between row
          never collides at 390px the way the old rail's centered duration badge did. */}
      <div className="mt-4 flex flex-col divide-y divide-dashed divide-edge">
        <div className="flex items-baseline justify-between py-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-report">Report</span>
          <span className="num text-base text-report">{formatLocal(firstLeg.reportUtc, firstLeg.depTz)}</span>
        </div>
        <div className="flex items-baseline justify-between py-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Dep</span>
          <span className="num text-base text-ink">{formatLocal(firstLeg.depUtc, firstLeg.depTz)}</span>
        </div>
        <div className="flex items-baseline justify-between py-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Arr</span>
          <span className="num text-base text-ink">
            {formatLocal(lastLeg.arrUtc, lastLeg.arrTz)}
            {arrOffset > 0 && <sup className="text-xs text-ink-muted">+{arrOffset}</sup>}
          </span>
        </div>
      </div>

      {duration && <p className="num mt-1.5 text-right text-sm text-ink-muted">{duration}</p>}
    </>
  );
}

/** The card shown below the calendar grid while a day is selected (tap-to-detail), replacing
 * the next-duty card for the duration of the selection. A trip day expands IN PLACE to its
 * legs and a delete control — viewing or removing a trip never opens a sheet, which is
 * reserved for adding one. Empty day: a muted no-duty line plus "Add trip". */
function DayDetailCard({
  isoDate,
  trip,
  homeTz,
  onOpenSheet,
  onChanged,
}: {
  isoDate: string;
  trip: TripWithFlights | null;
  homeTz: string;
  onOpenSheet: () => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const legs = trip ? [...trip.flights].sort((a, b) => a.legSeq - b.legSeq) : [];
  const firstLeg = legs[0] ?? null;
  const [airlinePrefix] = useState(getAirlinePrefix);

  // Drives the pencil's edit mode with the SAME debounced-lookup + autofill + save pipeline
  // as the add sheet (useTripEntry), not a second implementation of it. Called unconditionally
  // (hook rules) even on a trip-free day, where it's simply inert - the edit UI that would
  // drive it never mounts there, so `pickedDate` falling back to the bare day is never read.
  const entry = useTripEntry({
    pickedDate: firstLeg ? localDateKey(firstLeg.depUtc, firstLeg.depTz) : isoDate,
    homeTz,
    onSubmitted: async () => {
      // Trip-free days never expose the edit UI, so `trip` is always set by the time this
      // actually fires - this guard exists only so the type checker (and any future caller)
      // doesn't have to assume it.
      if (!trip) return;
      // Create-then-delete: the hook has already created the replacement trip by the time
      // this callback runs. Only now is the original removed - a failed create above leaves
      // the old trip untouched instead of destroying a roster entry for nothing.
      try {
        await deleteTrip(trip.id);
      } catch (err) {
        setEditError(
          `Saved the new flight, but the old one may still be on your roster: ${
            err instanceof Error ? err.message : "failed to remove it"
          }`,
        );
      }
      setExpanded(false);
      onChanged();
    },
  });

  // Pencil click primes the field with the trip's CURRENT flight number (not blank) so edit
  // mode opens showing what's already on the roster - and clears any stale error from a
  // previous attempt.
  useEffect(() => {
    if (expanded && firstLeg) {
      entry.setFlightNo(firstLeg.flightNo);
      setEditError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function confirmDelete() {
    if (!trip) return;
    setDeleting(true);
    try {
      await deleteTrip(trip.id);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete trip");
      setDeleting(false);
    }
  }

  if (!trip || !firstLeg) {
    return (
      <div data-testid="day-detail-card" className="hairline flex flex-col gap-1 rounded-lg border border-edge bg-card p-4">
        <p className="text-sm text-ink-muted">{humanDateLabel(isoDate, homeTz)} — no duty</p>
        <button
          type="button"
          data-testid="day-detail-action"
          onClick={onOpenSheet}
          className="mt-2 min-h-[48px] self-start rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          Add trip
        </button>
      </div>
    );
  }

  return (
    <div data-testid="day-detail-card" className="hairline flex flex-col rounded-lg border border-edge bg-card p-4">
      <TripSummaryLines
        legs={legs}
        actions={
          // Out of the reading path: the card is read far more often than it is edited.
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              data-testid="day-detail-action"
              aria-label={expanded ? "Hide flight details" : "Edit trip"}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className={[
                "flex min-h-[44px] min-w-[44px] items-center justify-center rounded transition-colors duration-[120ms]",
                expanded ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-accent",
              ].join(" ")}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              data-testid="delete-trip"
              aria-label="Delete trip"
              onClick={() => setConfirmingDelete(true)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-ink-muted transition-colors duration-[120ms] hover:text-danger"
            >
              <TrashIcon />
            </button>
          </div>
        }
      />

      {deleteError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {deleteError}
        </p>
      )}

      {confirmingDelete && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-edge bg-raised p-3">
          <p className="text-ink">Delete trip? This can't be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="confirm-delete"
              disabled={deleting}
              onClick={confirmDelete}
              className="min-h-[48px] rounded border border-danger px-3 py-2 font-medium text-danger transition-colors duration-[120ms] hover:bg-danger/10 disabled:opacity-50"
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
      )}

      {expanded && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Same flight-number field as the add sheet: airline code as static text, digits
              typed. Editing it re-runs the schedule lookup below - the legs panel underneath
              still shows what's ON the roster right now, so Save's replacement is never a
              surprise. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void entry.handleAutofillSubmit();
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label htmlFor="card-edit-flightno" className="text-sm text-ink-muted">
                Flight number
              </label>
              <div className="mt-1 flex items-center gap-2 rounded border border-edge bg-raised px-3 py-2 transition-colors duration-[120ms] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
                <span className="num text-lg text-ink-muted">{airlinePrefix}</span>
                <input
                  id="card-edit-flightno"
                  data-testid="card-edit-flightno"
                  inputMode="numeric"
                  value={digitsOf(entry.flightNo, airlinePrefix)}
                  onChange={(e) => entry.setFlightNo(airlinePrefix + e.target.value.replace(/\D/g, ""))}
                  className="num w-full bg-transparent text-lg text-ink outline-none focus-visible:outline-none"
                />
              </div>
            </div>

            {entry.resolving && <p className="text-sm text-ink-muted">checking schedule…</p>}
            {entry.lookupMiss && (
              <p role="alert" className="text-sm text-danger">
                unknown flight — try another number
              </p>
            )}
            {entry.error && (
              <p role="alert" className="text-sm text-danger">
                {entry.error}
              </p>
            )}
            {editError && (
              <p role="alert" className="text-sm text-danger">
                {editError}
              </p>
            )}

            <TripLegsPanel trip={trip} />

            <div className="flex gap-2">
              <button
                type="submit"
                data-testid="card-edit-save"
                disabled={!entry.autofillLegs || entry.submitting || entry.resolving}
                className="min-h-[44px] rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                data-testid="card-edit-cancel"
                onClick={() => setExpanded(false)}
                className="min-h-[44px] rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/** Calendar tab: month grid (trip days marked) + an active-pairing progress card (when a
 * trip spans `now`) + a compact next-duty card. Single tap on any day SELECTS it, showing its
 * detail (trip summary + Edit, or "no duty" + Add) in place of the next-duty card; a second
 * tap on the already-selected day opens the DaySheet (view+edit an existing trip, or add one
 * on an empty day) — state-based, so rapid double-tap works naturally on mobile without a
 * dblclick hack. The upcoming list lives on the Trips tab (see TripsView.tsx). */
export default function CalendarHome({ now, openTodayToken }: Props) {
  const [trips, setTrips] = useState<TripWithFlights[] | null>(null);
  const [sheetIsoDate, setSheetIsoDate] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  // Days added this rapid-entry session, marked on the grid immediately without a refetch -
  // cleared whenever the sheet dismisses and actually refetches (its own data now covers them).
  const [optimisticDays, setOptimisticDays] = useState<Set<string>>(new Set());
  const nowMs = now.getTime();

  function refetch() {
    getTrips().then(setTrips);
    setOptimisticDays(new Set());
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const homeTz = trips?.[0]?.flights[0]?.depTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Finds the trip (if any) covering a given local calendar date, by checking every trip's
  // away-day span for that date's month against tripDaysInMonth (mirrors TripsCalendar's own
  // per-day lookup so the sheet always matches what the grid renders).
  function tripForDay(iso: string): TripWithFlights | null {
    if (!trips) return null;
    const [yearStr, monthStr] = iso.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    for (const trip of trips) {
      const legs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
      const first = legs[0];
      const last = legs[legs.length - 1];
      if (!first || !last) continue;
      const spanDays = tripDaysInMonth([{ firstDepUtc: first.depUtc, lastArrUtc: last.arrUtc }], year, month, homeTz);
      if (spanDays.has(iso)) return trip;
    }
    return null;
  }

  // Opens the sheet for today, or the next trip-free day after today when today already has
  // a trip — used by the tab bar's center + button. Tracks the LAST SEEN token (initialized
  // to the current value, not 0) so a remount with an already-bumped token (e.g. `key` change
  // from an unrelated trip edit) doesn't spuriously reopen the sheet — only an actual change
  // does.
  const lastSeenToken = useRef(openTodayToken);
  useEffect(() => {
    if (openTodayToken === lastSeenToken.current || trips === null) return;
    lastSeenToken.current = openTodayToken;
    const today = localDateKey(now.toISOString(), homeTz);
    let candidate = today;
    for (let i = 0; i < 366; i++) {
      if (!tripForDay(candidate)) {
        setSheetIsoDate(candidate);
        return;
      }
      const [y, m, d] = candidate.split("-").map(Number) as [number, number, number];
      candidate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTodayToken, trips]);

  // Single tap: select (or switch selection to) the tapped day. Second tap on the day
  // that's already selected: open the sheet instead (trip-edit or add mode).
  function handleDayTap(iso: string) {
    if (iso === selectedIso && !tripForDay(iso)) {
      // Second tap on an already-selected EMPTY day opens the add sheet. A day that already
      // has a trip stays with its card, which expands in place instead.
      setSheetIsoDate(iso);
    } else {
      setSelectedIso(iso);
    }
  }

  if (trips === null) {
    return <p className="text-ink-muted">loading…</p>;
  }

  const allFlights = trips
    .flatMap((trip) => trip.flights)
    .sort((a, b) => Date.parse(a.reportUtc) - Date.parse(b.reportUtc));
  const upcoming = allFlights.filter((f) => Date.parse(f.reportUtc) >= nowMs);
  const nextDuty = upcoming[0] ?? null;
  const tripByFlightId = new Map(trips.flatMap((trip) => trip.flights.map((f) => [f.id, trip])));

  if (!nextDuty) {
    return (
      <div className="entrance flex w-full max-w-xl flex-col items-center gap-4 text-center">
        <TripsCalendar
          now={now}
          trips={trips}
          homeTz={homeTz}
          onPickDay={handleDayTap}
          optimisticIsoDates={optimisticDays}
          selectedIso={selectedIso}
        />
        {selectedIso ? (
          <div className="w-full text-left">
            <DayDetailCard
              isoDate={selectedIso}
              trip={tripForDay(selectedIso)}
              homeTz={homeTz}
              onOpenSheet={() => setSheetIsoDate(selectedIso)}
              onChanged={refetch}
            />
          </div>
        ) : (
          // trips stays [] during rapid entry (no refetch until dismiss) - once a day has
          // been marked optimistically, this "no trips yet" empty state + its CTA would
          // otherwise stay stale, visible behind the open sheet, contradicting what the
          // grid above already shows.
          optimisticDays.size === 0 && (
            <>
              <p className="text-ink-muted">No trips yet — add your first</p>
              <button
                type="button"
                onClick={() => setSheetIsoDate(localDateKey(now.toISOString(), homeTz))}
                className="rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
              >
                Add your first trip
              </button>
            </>
          )
        )}
        {sheetIsoDate && (
          <DaySheet
            isoDate={sheetIsoDate}
            trips={trips}
            homeTz={homeTz}
            onClose={() => setSheetIsoDate(null)}
            onChanged={refetch}
            onAdded={(iso) => setOptimisticDays((prev) => new Set(prev).add(iso))}
          />
        )}
      </div>
    );
  }

  const nextDutyTrip = tripByFlightId.get(nextDuty.id) ?? null;
  const legs = nextDutyTrip ? [...nextDutyTrip.flights].sort((a, b) => a.legSeq - b.legSeq) : [nextDuty];
  const firstLeg = legs[0]!;


  // Active pairing: a trip whose first departure has passed and last arrival hasn't (spans
  // `now`). Home base tz = origin tz of the trip's first leg. Ported from the old CrewHome -
  // glance-critical mid-trip status per UX research §2.
  const activePairing = trips
    .map((trip) => {
      const tripLegs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
      const first = tripLegs[0];
      const last = tripLegs[tripLegs.length - 1];
      if (!first || !last) return null;
      const progress = tripProgress(first.depUtc, last.arrUtc, first.depTz, nowMs);
      return progress ? { trip, legs: tripLegs, first, last, progress } : null;
    })
    .find((entry) => entry !== null);

  return (
    <div className="entrance flex w-full max-w-xl flex-col gap-4">
      <TripsCalendar
        now={now}
        trips={trips}
        homeTz={nextDuty.depTz}
        onPickDay={handleDayTap}
        optimisticIsoDates={optimisticDays}
        selectedIso={selectedIso}
      />

      {activePairing && (
        <div
          data-testid="pairing-progress-card"
          className="hairline stagger-1 flex flex-col gap-3 rounded-lg border border-edge bg-card p-4"
        >
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-ink">Trip · {activePairing.progress.totalDays} days</p>
            <p className="num text-sm text-ink-muted">
              day {activePairing.progress.currentDay} of {activePairing.progress.totalDays}
            </p>
          </div>

          <p className="num text-sm text-ink-muted">
            {activePairing.legs.map((leg, index) => {
              const prevLeg = activePairing.legs[index - 1];
              const layover = prevLeg ? layoverHours(prevLeg.arrUtc, leg.depUtc) : null;
              return (
                <span key={leg.id}>
                  {layover !== null && ` ····· ${layover.toFixed(0)}h ····· `}
                  {leg.origin} → {leg.dest}
                </span>
              );
            })}
          </p>

          <div className="flex gap-1">
            {Array.from({ length: activePairing.progress.totalDays }, (_, i) => i + 1).map((day) => (
              <div
                key={day}
                className={`h-1.5 flex-1 rounded-full ${
                  day <= activePairing.progress.currentDay ? "bg-accent" : "bg-accent-soft"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {selectedIso ? (
        <div className="stagger-2">
          <DayDetailCard
            isoDate={selectedIso}
            trip={tripForDay(selectedIso)}
            homeTz={homeTz}
            onOpenSheet={() => setSheetIsoDate(selectedIso)}
              onChanged={refetch}
          />
        </div>
      ) : (
        <button
          type="button"
          data-testid="next-duty-card"
          // Selects the duty's day rather than opening the sheet: the sheet is add-only now,
          // and this day already has a trip — the day card is what shows and edits it.
          onClick={() => setSelectedIso(localDateKey(firstLeg.depUtc, firstLeg.depTz))}
          className="hairline stagger-2 flex flex-col gap-1 rounded-lg border border-edge bg-card p-4 text-left transition-colors duration-[120ms] hover:bg-raised"
        >
          <TripSummaryLines legs={legs} />
        </button>
      )}

      {sheetIsoDate && (
        <DaySheet
          isoDate={sheetIsoDate}
          trips={trips}
          homeTz={homeTz}
          onClose={() => setSheetIsoDate(null)}
          onChanged={refetch}
          onAdded={(iso) => setOptimisticDays((prev) => new Set(prev).add(iso))}
        />
      )}
    </div>
  );
}
