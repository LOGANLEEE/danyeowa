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
