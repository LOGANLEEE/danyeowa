import { formatLocal } from "@roaster/shared";
import type { TripWithFlights } from "./api";

/**
 * A trip's legs, read-only — times come from the schedule provider, not the crew. Rendered
 * inline by the day card, so viewing a trip never opens a sheet. Delete lives in the card
 * header alongside edit, where both actions sit together out of the reading path.
 */
export default function TripLegsPanel({ trip }: { trip: TripWithFlights }) {
  return (
    <div data-testid="trip-legs-panel" className="flex flex-col gap-3">
      {[...trip.flights]
        .sort((a, b) => a.legSeq - b.legSeq)
        .map((flight) => (
          <div key={flight.id} className="flex flex-col gap-1 rounded-lg border border-edge bg-raised p-3">
            <p className="text-ink">
              {flight.origin} → {flight.dest} <span className="text-ink-muted">{flight.flightNo}</span>
            </p>
            <p className="num text-sm text-ink-muted">
              dep {formatLocal(flight.depUtc, flight.depTz)} → arr {formatLocal(flight.arrUtc, flight.arrTz)}
            </p>
            <p className="num text-sm text-report">Report {formatLocal(flight.reportUtc, flight.depTz)}</p>
          </div>
        ))}
    </div>
  );
}
