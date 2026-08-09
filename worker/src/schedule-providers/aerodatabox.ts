import type { ProviderLeg } from "@roaster/shared";
import type { Env } from "../index";
import type { ScheduleProvider } from "./index";

/**
 * AeroDataBox "Flight status/schedule by number" response shape (via RapidAPI), verified
 * against the current OpenAPI spec (doc.aerodatabox.com/docs/openapi-rapidapi-v1.json,
 * `FlightContract` schema, fetched via context7 2026-08-09):
 *
 * GET https://aerodatabox.p.rapidapi.com/flights/number/{flightNo}/{dateLocal}
 * -> 200: Array<FlightContract>, where each FlightContract has `departure`/`arrival`
 * (each a `FlightAirportMovementContract`: `airport.iata` + `scheduledTime.local`, a
 * "YYYY-MM-DD HH:mm[:ss]+HH:mm"-shaped local timestamp).
 *
 * Only the fields this provider actually reads are typed below - the real response has
 * many more (status, aircraft, airline, ...) that aren't needed for a schedule leg.
 */
type AeroDataBoxFlight = {
  departure?: { airport?: { iata?: string }; scheduledTime?: { local?: string } };
  arrival?: { airport?: { iata?: string }; scheduledTime?: { local?: string } };
};

/** AeroDataBox provider (RapidAPI). Returns `null` immediately (no fetch) when
 * `env.AERODATABOX_KEY` isn't set - the plan requires this to work with no key
 * configured today, and the key must never be hardcoded/committed. */
export class AeroDataBoxProvider implements ScheduleProvider {
  name = "aerodatabox";

  constructor(private env: Env) {}

  async fetchFlight(flightNo: string, dateIso: string, signal: AbortSignal): Promise<ProviderLeg[] | null> {
    const apiKey = this.env.AERODATABOX_KEY;
    if (!apiKey) return null;

    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNo)}/${dateIso}`;
    let res: Response;
    try {
      res = await fetch(url, {
        signal,
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
        },
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    let flights: AeroDataBoxFlight[];
    try {
      flights = await res.json();
    } catch {
      return null;
    }
    if (!Array.isArray(flights) || flights.length === 0) return null;

    const flight = flights[0]!;
    return parseAeroDataBoxFlight(flight);
  }
}

/** Converts one `AeroDataBoxFlight` into a single-leg `ProviderLeg[]`, or `null` when
 * required fields (origin/dest IATA, local dep/arr times) are missing. Exported
 * separately so unit tests can feed it fixture JSON directly. */
export function parseAeroDataBoxFlight(flight: AeroDataBoxFlight): ProviderLeg[] | null {
  const origin = flight.departure?.airport?.iata?.toUpperCase();
  const dest = flight.arrival?.airport?.iata?.toUpperCase();
  const depLocalRaw = flight.departure?.scheduledTime?.local;
  const arrLocalRaw = flight.arrival?.scheduledTime?.local;
  if (!origin || !dest || !depLocalRaw || !arrLocalRaw) return null;

  const depLocal = extractHHMM(depLocalRaw);
  const arrLocal = extractHHMM(arrLocalRaw);
  const depDateKey = extractDateKey(depLocalRaw);
  const arrDateKey = extractDateKey(arrLocalRaw);
  if (!depLocal || !arrLocal || !depDateKey || !arrDateKey) return null;

  const dayOffset = Math.round(
    (Date.parse(`${arrDateKey}T00:00:00Z`) - Date.parse(`${depDateKey}T00:00:00Z`)) / (24 * 60 * 60 * 1000),
  );

  // AeroDataBox is queried with the exact requested date (`.../{dateLocal}`), and the
  // response's own departure date confirms what it actually returned - unlike the fr24
  // scraper, this provider IS date-specific.
  return [{ origin, dest, depLocal, arrLocal, dayOffset, sourceDateIso: depDateKey }];
}

/** Extracts "HH:MM" from an AeroDataBox local timestamp ("YYYY-MM-DD HH:mm[:ss][+HH:mm]"). */
function extractHHMM(local: string): string | null {
  const match = /(\d{2}):(\d{2})/.exec(local);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** Extracts "YYYY-MM-DD" from an AeroDataBox local timestamp. */
function extractDateKey(local: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(local);
  return match ? match[1]! : null;
}
