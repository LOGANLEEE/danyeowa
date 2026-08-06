import { useEffect, useState } from "react";
import { formatLocal, layoverHours, relativeUntil } from "@roaster/shared";
import { getTrips } from "./api";
import type { TripWithFlights } from "./api";

type Props = {
  onAddTrip: () => void;
  onOpenTrip: (trip: TripWithFlights) => void;
  now: Date;
};

/** Trips tab: the rolling upcoming-duty list (grouped by trip, "next" chip on the first),
 * plus the empty state and entry point into TripDetail (trip tap -> onOpenTrip). */
export default function TripsView({ onAddTrip, onOpenTrip, now }: Props) {
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
  const tripByFlightId = new Map(trips.flatMap((trip) => trip.flights.map((f) => [f.id, trip])));

  if (upcoming.length === 0) {
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

  return (
    <div className="entrance flex w-full max-w-xl flex-col gap-1">
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
              {flight.origin} → {flight.dest} <span className="text-ink-muted">{flight.flightNo}</span>
              {index === 0 && (
                <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                  next · {relativeUntil(flight.reportUtc, nowMs)}
                </span>
              )}
            </span>
            <span className="num text-ink-muted">
              {formatLocal(flight.reportUtc, flight.depTz, { withDate: true })}
              {layover !== null && ` · layover ${layover.toFixed(1)}h`}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onAddTrip}
        className="stagger-1 mt-3 self-start rounded border border-accent px-3 py-2 text-accent transition-colors duration-[120ms] hover:bg-accent/10 active:scale-[0.98]"
      >
        Add trip
      </button>
    </div>
  );
}
