import { useEffect, useState } from "react";
import type { Airport } from "@danyeowa/shared";
import { getAirport } from "../api";

/** Session-lived cache of airport lookups, keyed by IATA code. The timeline card looks up
 * the same handful of stations (every leg's origin/dest) over and over as the user taps
 * around the calendar, so a code is fetched at most once per page load — `null` marks a
 * lookup that failed or came back 404, cached the same as a hit so it is never retried. */
const cache = new Map<string, Airport | null>();
const inflight = new Map<string, Promise<void>>();

/**
 * Resolves an IATA code to its airport row, lazily and once per session. Returns `undefined`
 * until the fetch lands (or forever, on a miss/network failure), so callers render the bare
 * IATA code first and let the city/name fill in once resolved — this must never block the
 * timeline's first paint, and a failed lookup must never break the card.
 */
export function useAirport(iata: string): Airport | null | undefined {
  const [, bump] = useState(0);

  useEffect(() => {
    if (cache.has(iata)) return;
    let cancelled = false;

    let request = inflight.get(iata);
    if (!request) {
      request = getAirport(iata)
        .then((airport) => {
          cache.set(iata, airport);
        })
        .catch(() => {
          cache.set(iata, null);
        })
        .finally(() => {
          inflight.delete(iata);
        });
      inflight.set(iata, request);
    }
    request.then(() => {
      if (!cancelled) bump((n) => n + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [iata]);

  return cache.get(iata);
}
