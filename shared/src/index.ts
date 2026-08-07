import { z } from "zod";

export * from "./time";

export type HealthResponse = { ok: boolean; d1: boolean };
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
});

export type LegInput = z.infer<typeof LegInputSchema>;

export const LegPatchSchema = LegInputSchema.partial();

export type LegPatch = z.infer<typeof LegPatchSchema>;

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

export type ScheduleLookupResponse = {
  legs: ScheduleLeg[];
};

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

export const ShareLinkCreateSchema = z.object({
  label: z.string().max(100).optional(),
});

export type ShareLinkCreateInput = z.infer<typeof ShareLinkCreateSchema>;

export type ShareLink = {
  id: string;
  token: string;
  label: string | null;
  createdAt: number;
  revoked: boolean;
};

export type SharedViewLeg = {
  dateIso: string;
  fromCity: string;
  toCity: string;
};

export type SharedViewTrip = {
  fromIso: string;
  toIso: string;
  awayCity: string;
  legs: SharedViewLeg[];
};

export type SharedView = {
  crewName: string;
  generatedAt: string;
  trips: SharedViewTrip[];
};
