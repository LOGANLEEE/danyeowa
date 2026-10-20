import { z } from "zod";

const path = z.enum(["autofill", "manual"]);
const ms = z.number().int().min(0);

/** Every event the app may record, and nothing else: an unknown name is a 400, not a new row. */
const UsageEventVariants = z.discriminatedUnion("name", [
  z.object({ name: z.literal("app_opened"), props: z.object({ standalone: z.boolean() }) }),
  z.object({ name: z.literal("tab_viewed"), props: z.object({ tab: z.string().min(1).max(32) }) }),
  z.object({ name: z.literal("add_form_opened"), props: z.object({}) }),
  z.object({
    name: z.literal("flight_lookup"),
    props: z.object({ result: z.enum(["found", "unknown", "error"]), ms }),
  }),
  z.object({ name: z.literal("manual_entry_opened"), props: z.object({}) }),
  z.object({
    name: z.literal("trip_saved"),
    props: z.object({ path, legs: z.number().int().min(1).max(20), msSinceOpen: ms }),
  }),
  z.object({
    name: z.literal("trip_save_failed"),
    props: z.object({ path, status: z.number().int().min(0).max(599) }),
  }),
  z.object({ name: z.literal("trip_deleted"), props: z.object({}) }),
]);

// No separate 1KB check on props: every field above is bounded and unknown keys are stripped, so
// the largest valid props object is well under 1KB already.
export const UsageEventSchema = z.intersection(
  UsageEventVariants,
  z.object({ at: z.number().int().positive() }),
);

export type UsageEvent = z.infer<typeof UsageEventSchema>;
export type UsageEventName = UsageEvent["name"];
/** Props for one event name — what `track(name, props)` accepts. */
export type UsageEventProps<N extends UsageEventName> = Extract<UsageEvent, { name: N }>["props"];

export const UsageBatchSchema = z.object({
  sessionId: z.string().min(1).max(64),
  events: z.array(UsageEventSchema).min(1).max(20),
});

export type UsageBatch = z.infer<typeof UsageBatchSchema>;

export type UsageUserSummary = {
  email: string;
  sessions: number;
  appOpened: { standalone: number; browser: number };
  funnel: {
    addFormOpened: number;
    flightLookup: { found: number; unknown: number; error: number };
    manualEntryOpened: number;
    tripSaved: { autofill: number; manual: number };
    tripSaveFailed: number;
  };
  /** Median ms from opening the add form to a saved trip; null when nothing was saved. */
  medianMsToSave: number | null;
  tabViewed: Record<string, number>;
  /** Newest first, at most 30. */
  recent: { name: string; props: unknown; at: number }[];
};

export type UsageResponse = { days: number; users: UsageUserSummary[] };
