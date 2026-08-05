import type { Airport, Flight, Trip, TripInput } from "@roaster/shared";

export type TripWithFlights = Trip & { flights: Flight[] };

async function parseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

export async function getTrips(): Promise<TripWithFlights[]> {
  const res = await fetch("/api/trips");
  if (!res.ok) throw new Error("Failed to load trips");
  const body = await parseJson<{ trips: TripWithFlights[] }>(res);
  return body.trips;
}

export async function createTrip(input: TripInput): Promise<TripWithFlights> {
  const res = await fetch("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await parseJson<{ error?: string }>(res).catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? "Failed to create trip");
  }
  return parseJson<TripWithFlights>(res);
}

export async function getAirport(iata: string): Promise<Airport | null> {
  const res = await fetch(`/api/airports/${iata}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to look up airport");
  return parseJson<Airport>(res);
}
