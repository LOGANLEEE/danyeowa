import type {
  Airport,
  CrewInviteCreateInput,
  CrewResponse,
  Flight,
  NotificationPrefsInput,
  PushConfig,
  PushSubscribeInput,
  ScheduleConfirmInput,
  ScheduleLookupResponse,
  ScheduleSuggestResponse,
  Trip,
  TripInput,
} from "@danyeowa/shared";

/**
 * `flights` carries ONLY the sectors the crew member works. The aircraft's onward routing — the
 * legs it flies on after she gets off — lives in `continuation`, deliberately somewhere nothing
 * reads by accident, so a consumer that forgets this feature exists still gets the right landing
 * time. Optional because older payloads (and fixtures) simply have no continuation.
 */
export type TripWithFlights = Trip & { flights: Flight[]; continuation?: Flight[] };

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

/** Looks up return-flight suggestions from `origin` (the outbound trip's final leg dest) back
 * to `home`, ranked sibling-first then by ascending layover. Throws on a non-OK response —
 * callers use this fire-and-forget and catch to hide the suggestion section. */
export async function suggestReturns(params: {
  origin: string;
  date: string;
  home: string;
  outbound: string;
  arrivedIso: string;
}): Promise<ScheduleSuggestResponse> {
  const query = new URLSearchParams({
    origin: params.origin,
    date: params.date,
    home: params.home,
    outbound: params.outbound,
    arrivedIso: params.arrivedIso,
  });
  const res = await fetch(`/api/schedule/suggest?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to look up return suggestions");
  return parseJson<ScheduleSuggestResponse>(res);
}





export async function getPushConfig(): Promise<PushConfig> {
  const res = await fetch("/api/push/config");
  if (!res.ok) throw new Error("Failed to load push config");
  return parseJson<PushConfig>(res);
}

export async function subscribePush(input: PushSubscribeInput): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to subscribe to push notifications");
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error("Failed to unsubscribe from push notifications");
}

export async function updateNotificationPrefs(input: NotificationPrefsInput): Promise<void> {
  const res = await fetch("/api/push/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to update notification preferences");
}

/** The crew you share rosters with, plus invites in either direction. */
export async function getCrew(): Promise<CrewResponse> {
  const res = await fetch("/api/crew");
  if (!res.ok) throw new Error("Failed to load crew");
  return parseJson<CrewResponse>(res);
}

/** A crew member's roster. Read-only by construction — there is no write counterpart to this
 * call, and the API resolves the owner of any mutation from the session, never from an id. */
export async function getCrewTrips(userId: string): Promise<TripWithFlights[]> {
  const res = await fetch(`/api/crew/${encodeURIComponent(userId)}/trips`);
  if (!res.ok) throw new Error("Failed to load crew roster");
  const body = await parseJson<{ trips: TripWithFlights[] }>(res);
  return body.trips;
}

export async function inviteCrew(input: CrewInviteCreateInput): Promise<{ id: string; email: string }> {
  const res = await fetch("/api/crew/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await parseJson<{ error?: string }>(res).catch(() => ({}) as { error?: string });
    throw new Error(crewInviteError(res.status, body.error));
  }
  return parseJson<{ id: string; email: string }>(res);
}

/** The API's error codes are terse on purpose; the wording a crew member should read lives
 * here, in the one place that knows it is talking to a person. */
function crewInviteError(status: number, code: string | undefined): string {
  if (code === "cannot_invite_self") return "That's your own address";
  if (status === 409) return "You've already invited them";
  if (status === 400) return "That doesn't look like an email address";
  return "Couldn't send the invite";
}

export async function acceptCrewInvite(id: string): Promise<void> {
  const res = await fetch(`/api/crew/invites/${encodeURIComponent(id)}/accept`, { method: "POST" });
  if (!res.ok) throw new Error("Couldn't accept the invite");
}

/** Ends a pairing, or withdraws an invite that hasn't been accepted. Either side may do it. */
export async function revokeCrewInvite(id: string): Promise<void> {
  const res = await fetch(`/api/crew/invites/${encodeURIComponent(id)}/revoke`, { method: "POST" });
  if (!res.ok) throw new Error("Couldn't stop sharing");
}
