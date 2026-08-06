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

/** Calendar tab: month grid (trip days marked) + an active-pairing progress card (when a
 * trip spans `now`) + a compact next-duty card. The upcoming list lives on the Trips tab
 * (see TripsView.tsx). */
export default function CalendarHome({ onAddTrip, onOpenTrip, onPickDay, now }: Props) {
  const [trips, setTrips] = useState<TripWithFlights[] | null>(null);
  const nowMs = now.getTime();

  useEffect(() => {
    getTrips().then(setTrips);
  }, []);

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
      <div className="entrance flex flex-col items-center gap-4 text-center">
        <p className="text-ink-muted">No trips yet — add your first</p>
        <button
          type="button"
          onClick={onAddTrip}
          className="rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
        >
          Add your first trip
        </button>
      </div>
    );
  }

  const nextDutyTrip = tripByFlightId.get(nextDuty.id) ?? null;
  const legs = nextDutyTrip ? [...nextDutyTrip.flights].sort((a, b) => a.legSeq - b.legSeq) : [nextDuty];
  const firstLeg = legs[0]!;
  const lastLeg = legs[legs.length - 1]!;
  const tripDays = new Set(legs.map((leg) => formatLocal(leg.depUtc, leg.depTz, { withDate: true }).slice(0, 6)))
    .size;
  // Full route chain (every stop in order), not just endpoints - e.g. a 2-leg
  // DXB->SYD->CHC schedule renders "DXB → SYD → CHC", not "DXB → CHC".
  const routeChain = [legs[0]!.origin, ...legs.map((leg) => leg.dest)].filter(
    (stop, index, all) => index === 0 || stop !== all[index - 1],
  );

  const leaveHomeUtc = new Date(Date.parse(nextDuty.reportUtc) - LEAVE_HOME_LEAD_MS).toISOString();
  const arrOffset = dayOffset(firstLeg.depUtc, lastLeg.arrUtc, firstLeg.depTz, lastLeg.arrTz);

  function openNextDuty() {
    if (nextDutyTrip) onOpenTrip(nextDutyTrip);
  }

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
        // T3: day taps still route into the existing TripForm/TripDetail flow via
        // onPickDay/onOpenTrip - T4 replaces this with the DaySheet.
        onPickDay={onPickDay}
        onOpenTrip={onOpenTrip}
      />

      {activePairing && (
        <div
          data-testid="pairing-progress-card"
          className="stagger-1 flex flex-col gap-3 rounded-lg border border-edge bg-card p-4"
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

      <button
        type="button"
        data-testid="next-duty-card"
        onClick={openNextDuty}
        className="stagger-2 flex flex-col gap-1 rounded-lg border border-edge bg-card p-4 text-left transition-colors duration-[120ms] hover:bg-raised"
      >
        <p className="font-semibold text-ink">
          {routeChain.join(" → ")}
          {arrOffset > 0 && <sup>+{arrOffset}</sup>} ·{" "}
          <span className="num">
            {formatLocal(firstLeg.depUtc, firstLeg.depTz, { withDate: true })} –{" "}
            {formatLocal(lastLeg.arrUtc, lastLeg.arrTz, { withDate: true })}
          </span>
        </p>
        <p className="text-sm text-ink-muted">
          {nextDuty.flightNo} · trip {tripDays} {tripDays === 1 ? "day" : "days"}
        </p>
        <p className="text-sm text-ink-muted">
          Report{" "}
          <span className="num text-report font-semibold">{formatLocal(nextDuty.reportUtc, nextDuty.depTz)}</span>{" "}
          · leave home <span className="num">{formatLocal(leaveHomeUtc, nextDuty.depTz)}</span> ·{" "}
          <span className="num">{relativeUntil(nextDuty.reportUtc, nowMs)}</span>
        </p>
      </button>
    </div>
  );
}
