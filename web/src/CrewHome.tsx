import { useEffect, useState } from "react";
import { dayOffset, formatLocal, layoverHours, relativeUntil, tripProgress } from "@roaster/shared";
import { getTrips } from "./api";
import type { TripWithFlights } from "./api";

type Props = { onAddTrip: () => void; now: Date };

const LEAVE_HOME_LEAD_MS = 55 * 60 * 1000;

export default function CrewHome({ onAddTrip, now }: Props) {
  const [trips, setTrips] = useState<TripWithFlights[] | null>(null);
  const nowMs = now.getTime();

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
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-ink-muted">No trips yet — add your first</p>
        <button
          type="button"
          onClick={onAddTrip}
          className="rounded bg-amber px-3 py-2 font-medium text-ground hover:brightness-110"
        >
          Add your first trip
        </button>
      </div>
    );
  }

  const leaveHomeUtc = new Date(Date.parse(nextDuty.reportUtc) - LEAVE_HOME_LEAD_MS).toISOString();
  const arrOffset = dayOffset(nextDuty.depUtc, nextDuty.arrUtc, nextDuty.depTz, nextDuty.arrTz);

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {/* Status band */}
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
        <span className="text-ink-muted">
          Off duty — next report {relativeUntil(nextDuty.reportUtc, nowMs)}
        </span>
      </div>

      {/* Next duty card */}
      <div className="flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4">
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
      </div>

      {/* Active pairing card: shown when a trip spans `now` (first dep passed, last arr not yet). */}
      {activePairing && (
        <div
          data-testid="pairing-progress-card"
          className="flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4"
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

      {/* Rolling upcoming list: one line per duty (R1). */}
      <div className="flex flex-col gap-1">
        {upcoming.map((flight, index) => {
          const prev = upcoming[index - 1];
          const layover = prev ? layoverHours(prev.arrUtc, flight.depUtc) : null;
          return (
            <div
              key={flight.id}
              data-testid="upcoming-row"
              className="flex items-center justify-between border-b border-edge py-2 text-sm last:border-b-0"
            >
              <span className="text-ink">
                {flight.origin} → {flight.dest}{" "}
                <span className="text-ink-muted">{flight.flightNo}</span>
              </span>
              <span className="num text-ink-muted">
                {formatLocal(flight.reportUtc, flight.depTz, { withDate: true })}
                {layover !== null && ` · layover ${layover.toFixed(1)}h`}
              </span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddTrip}
        className="self-start rounded border border-edge px-3 py-2 text-ink hover:border-ink-muted"
      >
        Add trip
      </button>
    </div>
  );
}
