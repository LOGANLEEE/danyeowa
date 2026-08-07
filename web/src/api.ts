import type {
  Airport,
  Flight,
  LegPatch,
  ScheduleConfirmInput,
  ScheduleLookupResponse,
  ShareLink,
  Trip,
  TripInput,
} from "@roaster/shared";

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

export async function patchFlight(id: string, patch: LegPatch): Promise<Flight> {
  const res = await fetch(`/api/flights/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await parseJson<{ error?: string }>(res).catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? "Failed to update flight");
  }
  return parseJson<Flight>(res);
}

export async function deleteTrip(id: string): Promise<void> {
  const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete trip");
}

/** Looks up a flight's scheduled legs for a given date. Returns null on a 404 (unknown flight or not scheduled that day). */
export async function lookupSchedule(
  flightNo: string,
  date: string,
): Promise<ScheduleLookupResponse | null> {
  const res = await fetch(
    `/api/schedule/lookup?flight_no=${encodeURIComponent(flightNo)}&date=${encodeURIComponent(date)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to look up schedule");
  return parseJson<ScheduleLookupResponse>(res);
}

/** Fire-and-forget: reports the (possibly edited) times the user actually saved back to the crowd layer. */
export async function confirmSchedule(input: ScheduleConfirmInput): Promise<void> {
  await fetch("/api/schedule/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function createShareLink(label?: string): Promise<ShareLink> {
  const res = await fetch("/api/share-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(label ? { label } : {}),
  });
  if (!res.ok) throw new Error("Failed to create share link");
  const body = await parseJson<{ id: string; token: string; label: string | null; createdAt: number }>(
    res,
  );
  return { ...body, revoked: false };
}

export async function getShareLinks(): Promise<ShareLink[]> {
  const res = await fetch("/api/share-links");
  if (!res.ok) throw new Error("Failed to load share links");
  const body = await parseJson<{ links: ShareLink[] }>(res);
  return body.links;
}

export async function revokeShareLink(id: string): Promise<void> {
  const res = await fetch(`/api/share-links/${id}/revoke`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to revoke share link");
}
