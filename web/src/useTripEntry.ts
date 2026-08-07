import { useEffect, useState } from "react";
import type { Airport, LegInput, ScheduleLeg } from "@roaster/shared";
import { TripInputSchema, addDaysIso, legDatesFromPicked, reportDefault, wallToUtc } from "@roaster/shared";
import { confirmSchedule, createTrip, getAirport, lookupSchedule } from "./api";
import type { TripWithFlights } from "./api";

export type LegDraft = {
  flightNo: string;
  origin: string;
  dest: string;
  dep: string; // datetime-local wall time at origin
  arr: string; // datetime-local wall time at dest
  report: string; // datetime-local wall time at origin, editable
  reportTouched: boolean;
};

function emptyLeg(): LegDraft {
  return { flightNo: "", origin: "", dest: "", dep: "", arr: "", report: "", reportTouched: false };
}

/** Converts a `YYYY-MM-DDTHH:mm` datetime-local value to the wall-ISO seconds format wallToUtc expects. */
function toWallIso(datetimeLocal: string): string {
  return datetimeLocal.length === 16 ? `${datetimeLocal}:00` : datetimeLocal;
}

/** Converts a UTC ISO instant back to a local wall `YYYY-MM-DDTHH:mm` string in the given tz. */
function utcToDatetimeLocal(utcIso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcIso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

const FLIGHT_NO_PATTERN = /^[A-Z]{2}\d{1,4}$/;
const LOOKUP_DEBOUNCE_MS = 400;

/** One autofilled leg, editable inline before save. Times are local HH:MM strings.
 * `flightNo` is per-leg (not hoisted to a single trip-wide value) so an appended flight's
 * legs can carry their own flight number alongside the outbound's legs in the same list. */
export type AutofillLegDraft = {
  flightNo: string;
  legSeq: number;
  /** This leg's own index WITHIN `flightNo`'s schedule (always 0-based per flight), distinct
   * from `legSeq` (the combined-trip's continuing leg_seq across an outbound + appended
   * flight). `flight_schedules` rows are keyed by (flightNo, leg_seq) PER FLIGHT — confirming
   * a leg back to the crowd layer (POST /schedule/confirm) must upsert against this, not the
   * trip-relative `legSeq`, or an appended second flight (whose combined legSeq starts above
   * 0) would confirm into a nonexistent leg_seq slot for its OWN flight_no, fabricating a
   * phantom extra leg that GET /schedule/lookup would then return on every future lookup. */
  scheduleLegSeq: number;
  origin: string;
  dest: string;
  destTz: string;
  originTz: string;
  depDate: string; // YYYY-MM-DD, from legDatesFromPicked
  depTime: string; // HH:MM, editable
  arrTime: string; // HH:MM, editable
  dayOffset: number;
};

/** Builds autofill drafts for `legs`, dating them via `legDatesFromPicked` from `pickedDate`
 * (the FIRST of these legs' departure day - the caller passes the appropriate anchor: the
 * originally picked date for the outbound, or the last existing leg's arrival date when
 * appending a second flight). `legSeq` (the combined TRIP's leg_seq, used in the POST
 * /api/trips payload) is renumbered continuing from `legSeqOffset` so an appended flight's
 * legs sort after the outbound's in the combined list; `scheduleLegSeq` (this flight's OWN
 * schedule leg index, used only for POST /schedule/confirm) always starts at 0 regardless of
 * `legSeqOffset`. */
function autofillLegsFrom(
  pickedDate: string,
  flightNo: string,
  legs: ScheduleLeg[],
  legSeqOffset = 0,
): AutofillLegDraft[] {
  const depDates = legDatesFromPicked(pickedDate, legs);
  return legs.map((leg, i) => ({
    flightNo,
    legSeq: legSeqOffset + i,
    scheduleLegSeq: i,
    origin: leg.origin,
    dest: leg.dest,
    originTz: leg.originTz,
    destTz: leg.destTz,
    depDate: depDates[i]!,
    depTime: leg.depLocal,
    arrTime: leg.arrLocal,
    dayOffset: leg.dayOffset,
  }));
}

export type EntryMode = "flightno" | "manual";

type Options = {
  /** Local ISO date ("YYYY-MM-DD") of the day this entry is for. */
  pickedDate: string;
  homeTz: string;
  /** Called after a successful save with the created trip (server-resolved depTz/arrTz
   * included) — callers that need the full saved span (e.g. rapid-entry's next-date
   * suggestion) don't have to re-derive it from client-side draft state. */
  onSubmitted: (trip: TripWithFlights) => void;
};

/**
 * Reusable flight-entry logic extracted from the Plan-5 TripForm stepper: flight-no lookup
 * (debounced), autofill preview editing, manual-entry fallback, and save (createTrip +
 * fire-and-forget confirmSchedule). Payload construction is byte-identical to the original
 * stepper — same helper functions (legDatesFromPicked, wallToUtc, reportDefault), same
 * field-by-field assembly.
 */
export function useTripEntry({ pickedDate, homeTz, onSubmitted }: Options) {
  const [mode, setMode] = useState<EntryMode>("flightno");

  const [flightNo, setFlightNo] = useState("");
  const [autofillLegs, setAutofillLegs] = useState<AutofillLegDraft[] | null>(null);
  const [autofillFlightNo, setAutofillFlightNo] = useState<string | null>(null);
  const [lookupMiss, setLookupMiss] = useState(false);
  const [editingReportLeg, setEditingReportLeg] = useState<number | null>(null);
  const [reportOverrides, setReportOverrides] = useState<Map<number, string>>(new Map());

  // Turnaround chaining (Task 2): an appended second flight's own flight number and legs,
  // tracked separately from the outbound so the "✕ remove appended" revert can drop exactly
  // these legs back out of `autofillLegs` without touching the outbound's own draft state.
  const [appendedFlightNo, setAppendedFlightNo] = useState<string | null>(null);
  const [appendLookupMiss, setAppendLookupMiss] = useState(false);

  const [legs, setLegs] = useState<LegDraft[]>([{ ...emptyLeg(), dep: `${pickedDate}T00:00` }]);
  const [airports, setAirports] = useState<Map<string, Airport | null>>(new Map());
  const [unknown, setUnknown] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Debounced schedule lookup on a valid flight-no pattern.
  useEffect(() => {
    if (mode !== "flightno") return;
    const candidate = flightNo.toUpperCase();
    if (!FLIGHT_NO_PATTERN.test(candidate)) {
      setAutofillLegs(null);
      setAutofillFlightNo(null);
      setLookupMiss(false);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await lookupSchedule(candidate, pickedDate);
      if (result) {
        setAutofillLegs(autofillLegsFrom(pickedDate, candidate, result.legs));
        setAutofillFlightNo(candidate);
        setLookupMiss(false);
        setReportOverrides(new Map());
        // A new outbound lookup replaces whatever was previewed before, including any
        // appended flight from a prior preview.
        setAppendedFlightNo(null);
        setAppendLookupMiss(false);
      } else {
        setAutofillLegs(null);
        setAutofillFlightNo(null);
        setLookupMiss(true);
      }
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [flightNo, mode, pickedDate]);

  /**
   * Chains a second, schedule-known flight onto the current autofill preview as one combined
   * trip (turnaround path). The appended flight's first leg departs on the LAST existing leg's
   * ARRIVAL local date — that's the earliest calendar day the next flight can operate — and the
   * rest of its legs (if multi-leg) date via the same `legDatesFromPicked` continuation rules
   * applied to the combined list, so the existing roll-forward guard for impossible connections
   * (e.g. a genuine overnight ground stop) covers the appended boundary exactly like any other
   * leg-to-leg connection; no changes to `legDatesFromPicked` were needed. Scope is intentionally
   * tight: a lookup miss shows an inline error and does NOT fall back to manual entry — manual
   * turnarounds remain possible via the pre-existing multi-leg manual path.
   */
  async function appendFlight(candidateFlightNo: string) {
    setAppendLookupMiss(false);
    if (!autofillLegs || autofillLegs.length === 0) return;
    const candidate = candidateFlightNo.toUpperCase();
    if (!FLIGHT_NO_PATTERN.test(candidate)) {
      setAppendLookupMiss(true);
      return;
    }
    const lastLeg = autofillLegs[autofillLegs.length - 1]!;
    const anchorDate = addDaysIso(lastLeg.depDate, lastLeg.dayOffset);
    const result = await lookupSchedule(candidate, anchorDate);
    if (!result) {
      setAppendLookupMiss(true);
      return;
    }
    const appended = autofillLegsFrom(anchorDate, candidate, result.legs, lastLeg.legSeq + 1);
    setAutofillLegs((prev) => (prev ? [...prev, ...appended] : appended));
    setAppendedFlightNo(candidate);
    setAppendLookupMiss(false);
  }

  /** Reverts the "+ add flight" chain back to single-flight state, dropping every leg tagged
   * with the appended flight number (and any report-time override made on those legs). */
  function removeAppendedFlight() {
    if (!appendedFlightNo) return;
    setAutofillLegs((prev) => (prev ? prev.filter((leg) => leg.flightNo !== appendedFlightNo) : prev));
    setReportOverrides((prev) => {
      const next = new Map(prev);
      for (const leg of autofillLegs ?? []) {
        if (leg.flightNo === appendedFlightNo) next.delete(leg.legSeq);
      }
      return next;
    });
    setAppendedFlightNo(null);
    setAppendLookupMiss(false);
  }

  function updateAutofillLeg(index: number, patch: Partial<AutofillLegDraft>) {
    setAutofillLegs((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index]!, ...patch };
      return next;
    });
  }

  function reportLocalFor(leg: AutofillLegDraft): string {
    const override = reportOverrides.get(leg.legSeq);
    if (override) return override;
    const depUtc = wallToUtc(`${leg.depDate}T${leg.depTime}:00`, leg.originTz);
    return utcToDatetimeLocal(reportDefault(depUtc), leg.originTz).slice(11);
  }

  function switchToManual() {
    setLegs([{ ...emptyLeg(), flightNo: flightNo.toUpperCase(), dep: `${pickedDate}T00:00` }]);
    setMode("manual");
  }

  /** Returns to the flight-no entry screen — used after a successful manual save so the
   * caller's shared post-save transition (rapid-entry banner, chips, cleared+refocused
   * input) renders the same way it does after an autofill save. */
  function switchToFlightNo() {
    setMode("flightno");
  }

  function updateLeg(index: number, patch: Partial<LegDraft>) {
    setLegs((prev) => {
      const current = prev[index];
      if (!current) return prev;
      const merged: LegDraft = { ...current, ...patch };

      // Auto-fill report time = dep - 90min local, unless the user has edited it.
      if (!merged.reportTouched && merged.dep) {
        const originAirport = airports.get(merged.origin.toUpperCase());
        if (originAirport) {
          const depUtc = wallToUtc(toWallIso(merged.dep), originAirport.tz);
          merged.report = utcToDatetimeLocal(reportDefault(depUtc), originAirport.tz);
        }
      }

      const next = [...prev];
      next[index] = merged;
      return next;
    });
  }

  async function lookupAirport(iata: string) {
    const code = iata.toUpperCase();
    if (!code || airports.has(code)) return;
    const airport = await getAirport(code);
    setAirports((prev) => new Map(prev).set(code, airport));
    setUnknown((prev) => {
      const next = new Set(prev);
      if (airport) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function addLeg() {
    setLegs((prev) => {
      const last = prev[prev.length - 1];
      const leg = emptyLeg();
      leg.origin = last?.dest ?? "";
      leg.dep = last?.arr ? `${last.arr.slice(0, 10)}T00:00` : "";
      return [...prev, leg];
    });
  }

  function airportLabel(iata: string): string | null {
    const code = iata.toUpperCase();
    if (!code) return null;
    if (unknown.has(code)) return `unknown airport: ${code}`;
    return airports.get(code)?.city ?? null;
  }

  async function handleAutofillSubmit() {
    setError(null);
    if (!autofillLegs || !autofillFlightNo) return;

    const resolvedLegs: LegInput[] = [];
    const confirmPayloads: {
      flightNo: string;
      legSeq: number;
      origin: string;
      dest: string;
      depLocal: string;
      arrLocal: string;
      dayOffset: number;
    }[] = [];

    for (const leg of autofillLegs) {
      const depUtc = wallToUtc(`${leg.depDate}T${leg.depTime}:00`, leg.originTz);
      // Arrival date = this leg's own dep date + this leg's own dayOffset (arr date - dep date).
      const arrDate = addDaysIso(leg.depDate, leg.dayOffset);
      const arrUtc = wallToUtc(`${arrDate}T${leg.arrTime}:00`, leg.destTz);
      const reportLocal = reportLocalFor(leg);
      const reportUtc = wallToUtc(`${leg.depDate}T${reportLocal}:00`, leg.originTz);

      resolvedLegs.push({
        flightNo: leg.flightNo,
        origin: leg.origin,
        dest: leg.dest,
        depUtc,
        arrUtc,
        reportUtc,
      });
      confirmPayloads.push({
        flightNo: leg.flightNo,
        legSeq: leg.scheduleLegSeq,
        origin: leg.origin,
        dest: leg.dest,
        depLocal: leg.depTime,
        arrLocal: leg.arrTime,
        dayOffset: leg.dayOffset,
      });
    }

    const parsed = TripInputSchema.safeParse({ legs: resolvedLegs });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid trip");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createTrip(parsed.data);
      // Fire-and-forget: report the (possibly edited) saved times back to the crowd layer.
      // Never blocks the UX and errors are ignored.
      for (const payload of confirmPayloads) {
        confirmSchedule(payload).catch(() => {});
      }
      onSubmitted(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManualSubmit() {
    setError(null);

    const resolvedLegs: LegInput[] = [];
    for (const leg of legs) {
      const originAirport = airports.get(leg.origin.toUpperCase());
      const destAirport = airports.get(leg.dest.toUpperCase());
      if (!originAirport || !destAirport) {
        setError("Every leg needs a known origin and destination airport");
        return;
      }
      const depUtc = wallToUtc(toWallIso(leg.dep), originAirport.tz);
      const arrUtc = wallToUtc(toWallIso(leg.arr), destAirport.tz);
      const reportUtc = leg.reportTouched
        ? wallToUtc(toWallIso(leg.report), originAirport.tz)
        : reportDefault(depUtc);
      resolvedLegs.push({
        flightNo: leg.flightNo,
        origin: leg.origin,
        dest: leg.dest,
        depUtc,
        arrUtc,
        reportUtc,
      });
    }

    const parsed = TripInputSchema.safeParse({ legs: resolvedLegs });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid trip");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createTrip(parsed.data);
      onSubmitted(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    mode,
    flightNo,
    setFlightNo,
    autofillLegs,
    autofillFlightNo,
    lookupMiss,
    editingReportLeg,
    setEditingReportLeg,
    reportOverrides,
    setReportOverrides,
    updateAutofillLeg,
    reportLocalFor,
    switchToManual,
    switchToFlightNo,
    legs,
    updateLeg,
    lookupAirport,
    addLeg,
    airportLabel,
    error,
    submitting,
    handleAutofillSubmit,
    handleManualSubmit,
    appendedFlightNo,
    appendLookupMiss,
    appendFlight,
    removeAppendedFlight,
  };
}

export type UseTripEntryReturn = ReturnType<typeof useTripEntry>;
