import { useEffect, useState } from "react";
import { dayOffset, formatLocal, layoverHours, relativeUntil, tripProgress } from "@roaster/shared";
import { getTrips } from "./api";
import type { TripWithFlights } from "./api";
import TripsCalendar from "./TripsCalendar";

type Props = {
  onAddTrip: () => void;
  onOpenTrip: (trip: TripWithFlights) => void;
  onPickDay: (isoDate: string) => void;
  now: Date;
};

const LEAVE_HOME_LEAD_MS = 55 * 60 * 1000;
const VIEW_STORAGE_KEY = "roster-view";

type RosterView = "list" | "calendar";

function loadStoredView(): RosterView {
  return localStorage.getItem(VIEW_STORAGE_KEY) === "calendar" ? "calendar" : "list";
}

export default function CrewHome({ onAddTrip, onOpenTrip, onPickDay, now }: Props) {
  const [trips, setTrips] = useState<TripWithFlights[] | null>(null);
  const [view, setView] = useState<RosterView>(loadStoredView);
  const nowMs = now.getTime();

  function selectView(next: RosterView) {
    setView(next);
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  useEffect(() => {
    getTrips().then(setTrips);
  }, []);

  if (trips === null) {
    return <p className="text-ink-muted">loading…</p>;
  }

  // Flatten to a single flights list ordered by report time; upcoming = report time in the future.
  const allFlights = trips
    .flatMap((trip) => trip.flights)
    .sort((a, b) => Date.parse(a.reportUtc) - Date.parse(b.reportUtc));
  const upcoming = allFlights.filter((f) => Date.parse(f.reportUtc) >= nowMs);
  const nextDuty = upcoming[0] ?? null;
  const tripByFlightId = new Map(trips.flatMap((trip) => trip.flights.map((f) => [f.id, trip])));

  // Active pairing: a trip whose first departure has passed and last arrival hasn't (spans `now`).
  // Home base tz = origin tz of the trip's first leg.
  const activePairing = trips
    .map((trip) => {
      const legs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
      const first = legs[0];
      const last = legs[legs.length - 1];
      if (!first || !last) return null;
      const progress = tripProgress(first.depUtc, last.arrUtc, first.depTz, nowMs);
      return progress ? { trip, legs, first, last, progress } : null;
    })
    .find((entry) => entry !== null);

  if (!nextDuty) {
    return (
      <div className="entrance flex flex-col items-center gap-4 text-center">
        <p className="text-ink-muted">No trips yet — add your first</p>
        <button
          type="button"
          onClick={onAddTrip}
          className="rounded bg-amber px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          Add your first trip
        </button>
      </div>
    );
  }

  const leaveHomeUtc = new Date(Date.parse(nextDuty.reportUtc) - LEAVE_HOME_LEAD_MS).toISOString();
  const arrOffset = dayOffset(nextDuty.depUtc, nextDuty.arrUtc, nextDuty.depTz, nextDuty.arrTz);

  return (
    <div className="entrance flex w-full max-w-xl flex-col gap-4">
      {/* Status band */}
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
        <span className="text-ink-muted">
          Off duty — next report <span className="num">{relativeUntil(nextDuty.reportUtc, nowMs)}</span>
        </span>
      </div>

      {/* View toggle: segmented control, List | Calendar. */}
      <div className="flex gap-1 text-sm">
        <button
          type="button"
          onClick={() => selectView("list")}
          className={`rounded px-2 py-1 transition-colors duration-[120ms] ${
            view === "list" ? "hairline text-ink-bright" : "text-ink-muted"
          }`}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => selectView("calendar")}
          className={`rounded px-2 py-1 transition-colors duration-[120ms] ${
            view === "calendar" ? "hairline text-ink-bright" : "text-ink-muted"
          }`}
        >
          Calendar
        </button>
      </div>

      {/* Next duty card */}
      <button
        type="button"
        data-testid="next-duty-card"
        onClick={() => {
          const trip = tripByFlightId.get(nextDuty.id);
          if (trip) onOpenTrip(trip);
        }}
        className="stagger-1 flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4 text-left transition-colors duration-[120ms] hover:bg-raised"
      >
        <div>
          <p className="text-lg font-semibold text-ink-bright">
            {nextDuty.origin} → {nextDuty.dest}
          </p>
          <p className="text-sm text-ink-muted">{nextDuty.flightNo}</p>
        </div>

        <div className="rounded border border-edge bg-raised p-3">
          <p className="text-xs uppercase text-ink-muted">Report</p>
          <p className="num text-3xl font-semibold text-amber-num">
            {formatLocal(nextDuty.reportUtc, nextDuty.depTz)}
          </p>
          <p className="text-sm text-ink-muted">
            leave home by <span className="num">{formatLocal(leaveHomeUtc, nextDuty.depTz)}</span>
          </p>
        </div>

        <p className="num text-sm text-ink-muted">
          dep {formatLocal(nextDuty.depUtc, nextDuty.depTz)} → arr{" "}
          {formatLocal(nextDuty.arrUtc, nextDuty.arrTz)}
          {arrOffset > 0 && <sup>+{arrOffset}</sup>}
        </p>
      </button>

      {/* Active pairing card: shown when a trip spans `now` (first dep passed, last arr not yet). */}
      {activePairing && (
        <div
          data-testid="pairing-progress-card"
          className="stagger-2 flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4"
        >
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-ink-bright">Trip · {activePairing.progress.totalDays} days</p>
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
                  day < activePairing.progress.currentDay
                    ? "bg-amber"
                    : day === activePairing.progress.currentDay
                      ? "bg-amber-num"
                      : "bg-edge"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* No rest/legal strip yet — needs duty aggregation across trips; deferred to Plan 4+. */}

      {view === "list" ? (
        /* Rolling upcoming list: one line per duty (R1). */
        <div className="stagger-3 flex flex-col gap-1">
          {upcoming.map((flight, index) => {
            const prev = upcoming[index - 1];
            const layover = prev ? layoverHours(prev.arrUtc, flight.depUtc) : null;
            return (
              <button
                key={flight.id}
                type="button"
                data-testid="upcoming-row"
                onClick={() => {
                  const trip = tripByFlightId.get(flight.id);
                  if (trip) onOpenTrip(trip);
                }}
                className="flex items-center justify-between border-b border-edge py-2 text-left text-sm transition-colors duration-[120ms] last:border-b-0 hover:bg-raised"
              >
                <span className="text-ink">
                  {flight.origin} → {flight.dest}{" "}
                  <span className="text-ink-muted">{flight.flightNo}</span>
                </span>
                <span className="num text-ink-muted">
                  {formatLocal(flight.reportUtc, flight.depTz, { withDate: true })}
                  {layover !== null && ` · layover ${layover.toFixed(1)}h`}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="stagger-3">
          <TripsCalendar
            now={now}
            trips={trips}
            homeTz={nextDuty.depTz}
            onPickDay={onPickDay}
            onOpenTrip={onOpenTrip}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onAddTrip}
        className="self-start rounded border border-amber px-3 py-2 text-amber transition-colors duration-[120ms] hover:bg-amber/10 active:scale-[0.98]"
      >
        Add trip
      </button>
    </div>
  );
}
