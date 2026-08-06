import type { TripWithFlights } from "./api";

const MAX_RECENT = 4;

/**
 * Distinct flight numbers from already-fetched trips, most-recent departure first, capped
 * at 4. No new API call — derives purely from the trips array the caller already has (e.g.
 * from getTrips()), per Plan 6 Task 5 (rapid-entry recent-flight chips).
 *
 * `sessionFlightNos` (most-recent-added first) are flights added during the CURRENT rapid-
 * entry session — `trips` is stale until the sheet's next refetch (it only fires on
 * dismiss), so a fresh session with no prior trips would otherwise show no chips right
 * after the very add they're meant to offer a one-tap repeat of. Session flights are
 * merged ahead of the trips-derived list, deduped, still capped at 4 total.
 */
export function useRecentFlights(trips: TripWithFlights[], sessionFlightNos: string[] = []): string[] {
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
  const fromTrips = [...latestDepByFlightNo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([flightNo]) => flightNo);

  const merged = [...sessionFlightNos, ...fromTrips.filter((f) => !sessionFlightNos.includes(f))];
  return merged.slice(0, MAX_RECENT);
}
