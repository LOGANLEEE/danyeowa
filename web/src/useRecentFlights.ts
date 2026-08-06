import type { TripWithFlights } from "./api";

const MAX_RECENT = 4;

/**
 * Distinct flight numbers from already-fetched trips, most-recent departure first, capped
 * at 4. No new API call — derives purely from the trips array the caller already has (e.g.
 * from getTrips()), per Plan 6 Task 5 (rapid-entry recent-flight chips).
 */
export function useRecentFlights(trips: TripWithFlights[]): string[] {
  const latestDepByFlightNo = new Map<string, number>();
  for (const trip of trips) {
    for (const flight of trip.flights) {
      const depMs = Date.parse(flight.depUtc);
      const seen = latestDepByFlightNo.get(flight.flightNo);
      if (seen === undefined || depMs > seen) {
        latestDepByFlightNo.set(flight.flightNo, depMs);
      }
    }
  }
  return [...latestDepByFlightNo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RECENT)
    .map(([flightNo]) => flightNo);
}
