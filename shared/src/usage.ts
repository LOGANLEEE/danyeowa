import { z } from "zod";

const path = z.enum(["autofill", "manual"]);
const ms = z.number().int().min(0);

/** Which control put the add form on screen. "default" is the day card the calendar opens on;
 * "after_save" is the blank form that comes back on the same day after a save. */
export const FORM_ENTRIES = ["default", "day", "plus", "add_duty_here", "add_another", "after_save"] as const;
export type FormEntry = (typeof FORM_ENTRIES)[number];

/** One name per control inside the add form. Names, never values: no flight numbers, codes or
 * times — the step is that she touched the control, not what she put in it. */
export const FORM_STEPS = [
  "flightno_edited",
  "time_edited",
  "boarding_picked",
  "final_picked",
  "append_opened",
  "flight_appended",
  "append_missed",
  "appended_removed",
  "manual_opened",
  "manual_flightno_edited",
  "airport_edited",
  "manual_time_edited",
  "leg_added",
  "submit_pressed",
  "error_shown",
] as const;
export type FormStep = (typeof FORM_STEPS)[number];

/** What she last did before leaving: a step, a lookup's answer, or nothing past opening. */
export const FORM_LAST_STEPS = [
  "opened",
  "lookup_found",
  "lookup_unknown",
  "lookup_error",
  ...FORM_STEPS,
] as const;
export type FormLastStep = (typeof FORM_LAST_STEPS)[number];

/** Every event the app may record, and nothing else: an unknown name is a 400, not a new row.
 * New props are optional: a page loaded before they existed still posts the old shape. */
const UsageEventVariants = z.discriminatedUnion("name", [
  z.object({ name: z.literal("app_opened"), props: z.object({ standalone: z.boolean() }) }),
  z.object({ name: z.literal("tab_viewed"), props: z.object({ tab: z.string().min(1).max(32) }) }),
  z.object({
    name: z.literal("add_form_opened"),
    props: z.object({ entry: z.enum(FORM_ENTRIES).optional() }),
  }),
  z.object({
    name: z.literal("flight_lookup"),
    props: z.object({
      result: z.enum(["found", "unknown", "error"]),
      ms,
      flightNo: z.string().max(8).regex(/^[A-Z0-9]{2}\d{1,5}$/).optional(),
    }),
  }),
  z.object({ name: z.literal("manual_entry_opened"), props: z.object({}) }),
  z.object({
    name: z.literal("trip_saved"),
    props: z.object({
      path,
      legs: z.number().int().min(1).max(20),
      msSinceOpen: ms,
      /** Autofill only: legs whose dep or arr time she changed from the schedule's. */
      legsEdited: z.number().int().min(0).max(20).optional(),
    }),
  }),
  z.object({
    name: z.literal("trip_save_failed"),
    props: z.object({ path, status: z.number().int().min(0).max(599) }),
  }),
  z.object({ name: z.literal("trip_deleted"), props: z.object({}) }),
  z.object({
    name: z.literal("form_step"),
    props: z.object({ step: z.enum(FORM_STEPS), msSinceOpen: ms }),
  }),
  z.object({
    name: z.literal("form_left"),
    props: z.object({
      lastStep: z.enum(FORM_LAST_STEPS),
      msSinceOpen: ms,
      reason: z.enum(["hidden", "closed"]),
    }),
  }),
  z.object({ name: z.literal("form_resumed"), props: z.object({ awayMs: ms }) }),
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

export type UsageFormTimeline = {
  openedAt: number;
  entry: string;
  outcome: "saved" | "left" | "open";
  /** `gapMs` is 0 on the first step. `longest` marks the biggest gap she spent working: the time
   * away, which ends at `resumed`, is shown as its own step and never counted as the longest. */
  steps: { label: string; gapMs: number; longest: boolean }[];
};

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
  /** Flight numbers a lookup did not find, most-missed first. */
  missingFlights: { flightNo: string; unknown: number; error: number }[];
  /** Over autofill saves that report it: legs whose time she changed, of legs the schedule filled. */
  timeEdits: { legsEdited: number; legsAutofilled: number };
  /** add_form_opened per entry; "unrecorded" for pages older than the prop. */
  entries: Record<string, number>;
  /** form_left per last step, split by reason. */
  formLeft: { closed: Record<string, number>; hidden: Record<string, number> };
  /** Sessions with at least one save, newest first, at most 10. */
  sittings: { startedAt: number; saved: number; medianGapMs: number | null }[];
  /** The last 10 forms, newest first. */
  forms: UsageFormTimeline[];
  /** Newest first, at most 30. */
  recent: { name: string; props: unknown; at: number }[];
};

export type UsageResponse = { days: number; users: UsageUserSummary[] };
