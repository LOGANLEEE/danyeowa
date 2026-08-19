import { z } from "zod";

export * from "./time";
export * from "./flight";

export type HealthResponse = {
  ok: boolean;
  d1: boolean;
  /** The commit this Worker was deployed from, injected at deploy time. Absent locally.
   * Exists so a deploy can be PROVEN to have taken effect: a green deploy job is not evidence
   * that the new code answers requests, and once it was not — production kept querying a table
   * a merged migration had already dropped. */
  version?: string;
};
export type Me = { id: string; email: string; name: string | null };

const iataSchema = z.string().regex(/^[A-Z]{3}$/i);

export const LegInputSchema = z.object({
  flightNo: z.string().regex(/^[A-Z]{2}\d{1,4}$/i),
  origin: iataSchema,
  dest: iataSchema,
  depUtc: z.string().datetime(),
  arrUtc: z.string().datetime(),
  // reportUtc backfilled server-side via reportDefault() when absent.
  reportUtc: z.string().datetime().optional(),
  // depTz/arrTz resolved server-side from the airports table by IATA; not client-supplied.
  depTz: z.string().optional(),
  arrTz: z.string().optional(),
  /** False for a sector the aircraft flies on without this crew member — the leg is stored so
   * the routing stays true, but it is excluded from every derived time. Absent means operating,
   * which keeps every existing caller (and the harvester's ingest payloads) correct. */
  operating: z.boolean().optional(),
});

export type LegInput = z.infer<typeof LegInputSchema>;

export const TripInputSchema = z.object({
  label: z.string().optional(),
  legs: z.array(LegInputSchema).min(1),
});

export type TripInput = z.infer<typeof TripInputSchema>;

export const TripSchema = z.object({
  id: z.string(),
  userId: z.string(),
  label: z.string().nullable(),
  createdAt: z.number(),
});

export type Trip = z.infer<typeof TripSchema>;

export const FlightSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  userId: z.string(),
  flightNo: z.string(),
  origin: iataSchema,
  dest: iataSchema,
  depUtc: z.string(),
  arrUtc: z.string(),
  reportUtc: z.string(),
  depTz: z.string(),
  arrTz: z.string(),
  source: z.string(),
  notes: z.string().nullable(),
  legSeq: z.number(),
  operating: z.boolean(),
});

export type Flight = z.infer<typeof FlightSchema>;

export const AirportSchema = z.object({
  iata: iataSchema,
  city: z.string(),
  name: z.string(),
  tz: z.string(),
});

export type Airport = z.infer<typeof AirportSchema>;

const flightNoSchema = z.string().regex(/^[A-Z]{2}\d{1,4}$/i);

export type ScheduleLeg = {
  legSeq: number;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
  dayOffset: number;
  originTz: string;
  destTz: string;
  confirmCount: number;
};

/**
 * One leg of a flight's schedule as resolved by a live `ScheduleProvider` (scraper or
 * API), before it's written into the `flight_schedules` cache table. Distinct from
 * `ScheduleLeg` above: no `originTz`/`destTz` (providers return airport IATA codes only;
 * tz resolution happens server-side against the `airports` table, same as the cache-hit
 * path) and no `confirmCount` (a freshly-resolved leg hasn't been crowd-confirmed yet).
 */
export type ProviderLeg = {
  origin: string;
  dest: string;
  /** Local departure clock time, "HH:MM". */
  depLocal: string;
  /** Local arrival clock time, "HH:MM". */
  arrLocal: string;
  /** Arrival calendar date minus departure calendar date, in the respective local tz's. */
  dayOffset: number;
  /** ISO weekday digits ("1"..."7", Monday-first) this leg operates, e.g. "1234567" for
   * daily. Omitted when the provider can't derive an operating-day pattern from a single
   * fetch (e.g. a scraper that only observed one date) — callers default to "1234567",
   * matching the existing crowd-confirm convention (see schedule.ts POST /schedule/confirm). */
  daysOfWeek?: string;
  /** The calendar date (YYYY-MM-DD) this leg's data actually describes, when the provider
   * can tell us — e.g. the fr24 scraper only observes the page's nearest-to-now operating
   * date, which may not be the date the caller asked for. Omitted when the provider has no
   * way to know (or the data isn't tied to a specific date at all). Callers persist this
   * as-is (including omission -> null) so the cache never presents a nearest-date row as
   * if it were verified for the exact date a caller requested. */
  sourceDateIso?: string;
  /** Origin airport metadata, when the provider's own response happens to carry it
   * (currently: AeroDataBox only — its `airport.timeZone` is a genuine IANA name, e.g.
   * "Asia/Dubai"). Omitted by providers that can't supply a trustworthy tz (the fr24
   * scraper only has city+country text, which is NOT sufficient to derive an IANA zone
   * safely — many countries span multiple zones, and a raw UTC offset silently breaks
   * across DST). Used to self-warm the `airports` table when a live-resolved leg touches
   * an IATA code outside the seeded set — see schedule.ts `learnAirportsForLegs`. Never
   * fabricated: a leg with an unresolvable airport is dropped rather than given a guessed
   * tz, since every downstream consumer (wallToUtc, report calc, ...) assumes `tz` is a
   * real IANA name and silently produces wrong times otherwise. */
  originAirport?: { name: string; tz: string };
  /** Destination airport metadata — see `originAirport`. */
  destAirport?: { name: string; tz: string };
};

export type ScheduleLookupResponse = {
  legs: ScheduleLeg[];
};

export type ScheduleSuggestion = {
  flightNo: string;
  legs: ScheduleLeg[];
  /** Hours (fractional) from the query's `arrivedIso` to this suggestion's first-leg departure, as a UTC instant delta. */
  layoverHours: number;
  /** True when flightNo's numeric part is the outbound flight's numeric part ± 1 (zero-pad aware, same alpha prefix). */
  sibling: boolean;
  /** The resolved operating date ("YYYY-MM-DD") this suggestion's leg 0 departs on — the first
   * date >= the query's `date` (searched forward up to 7 days) whose weekday/validity matches
   * and whose departure isn't before `arrivedIso`. Lets a client render/prefill the suggestion's
   * actual date without re-deriving the operating-day search client-side. */
  dateIso: string;
};

export type ScheduleSuggestResponse = {
  suggestions: ScheduleSuggestion[];
};

export const ScheduleSuggestQuerySchema = z.object({
  origin: iataSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outbound: flightNoSchema.optional(),
  arrivedIso: z.string().datetime(),
  home: iataSchema.optional().default("DXB"),
});

export type ScheduleSuggestQuery = z.infer<typeof ScheduleSuggestQuerySchema>;

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const ScheduleConfirmSchema = z
  .object({
    flightNo: flightNoSchema,
    legSeq: z.number().int().min(0).max(5),
    origin: iataSchema,
    dest: iataSchema,
    depLocal: hhmmSchema,
    arrLocal: hhmmSchema,
    dayOffset: z.number().int().min(0).max(3),
  })
  .refine((data) => data.origin.toUpperCase() !== data.dest.toUpperCase(), {
    message: "origin and dest must differ",
    path: ["dest"],
  });

export type ScheduleConfirmInput = z.infer<typeof ScheduleConfirmSchema>;

export const PushSubscribeSchema = z.object({
  endpoint: z.string().url().refine((url) => url.startsWith("https://"), {
    message: "endpoint must be an https:// URL",
  }),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscribeInput = z.infer<typeof PushSubscribeSchema>;

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeSchema>;

export const NotificationPrefsSchema = z.object({
  enabled: z.boolean(),
  leadMinutes: z.number().int().min(30).max(360),
  // Optional so an older client that doesn't know about arrival alerts can still save the other
  // two settings without silently turning them off.
  arrivalEnabled: z.boolean().optional(),
});

export type NotificationPrefsInput = z.infer<typeof NotificationPrefsSchema>;

export type PushConfig = {
  publicKey: string;
  enabled: boolean;
  leadMinutes: number;
  arrivalEnabled: boolean;
  subscribed: boolean;
};

/**
 * Payloads the local harvester and arrival refresher send to the Worker.
 *
 * These exist so those scripts stop opening a raw SQL connection to production. A script with
 * database credentials can write anything, in any shape, with no validation and no test
 * coverage — three of this project's worst incidents were exactly that. Going through the
 * Worker means every write is typed here, validated at the edge, and exercised in CI.
 */
export const IngestScheduleSchema = z.object({
  airports: z
    .array(
      z.object({
        iata: iataSchema,
        city: z.string().min(1),
        name: z.string().min(1),
        // A real IANA zone name. The lookup route refuses to serve a leg whose airport has no
        // usable zone, so a fabricated one is worse than a missing airport.
        tz: z.string().min(3).regex(/^[A-Za-z_]+\/[A-Za-z_+\-0-9\/]+$|^UTC$/),
      }),
    )
    .max(50),
  flights: z
    .array(
      z.object({
        flightNo: flightNoSchema,
        legs: z
          .array(
            z.object({
              legSeq: z.number().int().min(0).max(9),
              origin: iataSchema,
              dest: iataSchema,
              depLocal: z.string().regex(/^\d{2}:\d{2}$/),
              arrLocal: z.string().regex(/^\d{2}:\d{2}$/),
              dayOffset: z.number().int().min(0).max(3),
              daysOfWeek: z.string().regex(/^[1-7]{1,7}$/),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .min(1)
    .max(50),
});

export type IngestScheduleInput = z.infer<typeof IngestScheduleSchema>;

/** One flight's arrival time corrected against live data. */
export const IngestArrivalSchema = z.object({
  corrections: z
    .array(
      z.object({
        flightId: z.string().min(1),
        arrUtc: z.string().datetime(),
      }),
    )
    .min(1)
    .max(50),
});

export type IngestArrivalInput = z.infer<typeof IngestArrivalSchema>;

/** Crew sharing: an invite by email, which once accepted lets two accounts READ each other's
 * roster. Nothing here grants write access — the mutation routes resolve the owner from the
 * session and never take a user id from the request. */
export const CrewInviteCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export type CrewInviteCreateInput = z.infer<typeof CrewInviteCreateSchema>;

/** The other party of an accepted pairing — everything the badge row needs to render. */
export type CrewMember = {
  userId: string;
  email: string;
  name: string | null;
  /** The accepted invite that established the pairing; revoking it ends the sharing. */
  inviteId: string;
};

/** What an unauthenticated visitor holding an invite link is allowed to see. Deliberately
 * carries nothing about the roster — see the route's comment in worker/src/crew.ts. */
export type InvitePreview = {
  fromName: string;
  /** e.g. `k•••••94@gmail.com` — enough to recognise, not enough to harvest. */
  toEmailMasked: string;
  /** The viewer's own address, present only when they already have a session. */
  signedInAs?: string;
  /** Whether that session is the one the invite was addressed to. Invites match on exact
   * address, so signing in with a different one (easily done via Google) otherwise lands
   * someone in the app with no invitation and nothing explaining why. */
  matchesYou?: boolean;
};

export type CrewInvite = {
  id: string;
  /** The invited address, lower-cased. */
  email: string;
  /** Did the invitation email actually reach Resend? Present only on the create response.
   * False means the invite stands but nobody was told — the sender needs to know that. */
  emailed?: boolean;
  /** Present only on invites you sent — the other side never needs to see it. */
  token?: string;
  /** Who sent it. Filled in only on invites addressed to you: accepting hands someone your
   * whereabouts for as long as it stands, so it cannot be an anonymous "someone". */
  fromEmail?: string;
  fromName?: string | null;
  createdAt: number;
};

export type CrewResponse = {
  members: CrewMember[];
  /** Pending invites you sent, awaiting the other person. */
  sent: CrewInvite[];
  /** Pending invites addressed to your email, awaiting you. */
  received: CrewInvite[];
};
