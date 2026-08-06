import { useEffect, useRef, useState } from "react";
import type { Airport, LegInput, ScheduleLeg } from "@roaster/shared";
import { TripInputSchema, addDaysIso, legDatesFromPicked, reportDefault, wallToUtc } from "@roaster/shared";
import { confirmSchedule, createTrip, getAirport, lookupSchedule } from "./api";
import TripsCalendar from "./TripsCalendar";

type Props = {
  onSubmitted: () => void;
  initialDate?: string;
  now: Date;
  homeTz: string;
};

type LegDraft = {
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

/** One autofilled leg, editable inline before save. Times are local HH:MM strings. */
type AutofillLegDraft = {
  legSeq: number;
  origin: string;
  dest: string;
  destTz: string;
  originTz: string;
  depDate: string; // YYYY-MM-DD, from legDatesFromPicked
  depTime: string; // HH:MM, editable
  arrTime: string; // HH:MM, editable
  dayOffset: number;
};

function autofillLegsFrom(pickedDate: string, legs: ScheduleLeg[]): AutofillLegDraft[] {
  const depDates = legDatesFromPicked(pickedDate, legs);
  return legs.map((leg, i) => ({
    legSeq: leg.legSeq,
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

type Step = "date" | "flightno" | "manual";

export default function TripForm({ onSubmitted, initialDate, now, homeTz }: Props) {
  const [step, setStep] = useState<Step>(initialDate ? "flightno" : "date");
  const [pickedDate, setPickedDate] = useState<string | undefined>(initialDate);

  const [flightNo, setFlightNo] = useState("");
  const [autofillLegs, setAutofillLegs] = useState<AutofillLegDraft[] | null>(null);
  const [autofillFlightNo, setAutofillFlightNo] = useState<string | null>(null);
  const [lookupMiss, setLookupMiss] = useState(false);
  const [editingReportLeg, setEditingReportLeg] = useState<number | null>(null);
  const [reportOverrides, setReportOverrides] = useState<Map<number, string>>(new Map());

  const [legs, setLegs] = useState<LegDraft[]>([
    pickedDate ? { ...emptyLeg(), dep: `${pickedDate}T00:00` } : emptyLeg(),
  ]);
  const [airports, setAirports] = useState<Map<string, Airport | null>>(new Map());
  const [unknown, setUnknown] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const flightNoInputRef = useRef<HTMLInputElement>(null);

  // Autofocus the flight-no input whenever the flightno step becomes active (including
  // right after a calendar day pick).
  useEffect(() => {
    if (step === "flightno") flightNoInputRef.current?.focus();
  }, [step]);

  // Debounced schedule lookup on a valid flight-no pattern.
  useEffect(() => {
    if (step !== "flightno" || !pickedDate) return;
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
        setAutofillLegs(autofillLegsFrom(pickedDate, result.legs));
        setAutofillFlightNo(candidate);
        setLookupMiss(false);
        setReportOverrides(new Map());
      } else {
        setAutofillLegs(null);
        setAutofillFlightNo(null);
        setLookupMiss(true);
      }
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [flightNo, step, pickedDate]);

  function handlePickDay(iso: string) {
    setPickedDate(iso);
    setLegs([{ ...emptyLeg(), dep: `${iso}T00:00` }]);
    setStep("flightno");
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
    setLegs([
      { ...emptyLeg(), flightNo: flightNo.toUpperCase(), dep: pickedDate ? `${pickedDate}T00:00` : "" },
    ]);
    setStep("manual");
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

  async function handleAutofillSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        flightNo: autofillFlightNo,
        origin: leg.origin,
        dest: leg.dest,
        depUtc,
        arrUtc,
        reportUtc,
      });
      confirmPayloads.push({
        flightNo: autofillFlightNo,
        legSeq: leg.legSeq,
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
      await createTrip(parsed.data);
      // Fire-and-forget: report the (possibly edited) saved times back to the crowd layer.
      // Never blocks the UX and errors are ignored.
      for (const payload of confirmPayloads) {
        confirmSchedule(payload).catch(() => {});
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      await createTrip(parsed.data);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "date") {
    return (
      <div className="entrance flex w-full max-w-xl flex-col gap-4 rounded-lg border border-edge bg-card p-6">
        <p className="text-sm text-ink-muted">When's the trip?</p>
        <TripsCalendar now={now} trips={[]} homeTz={homeTz} onPickDay={handlePickDay} mode="picker" />
      </div>
    );
  }

  if (step === "flightno") {
    return (
      <form
        onSubmit={handleAutofillSubmit}
        className="entrance flex w-full max-w-xl flex-col gap-4 rounded-lg border border-edge bg-card p-6"
      >
        <label htmlFor="flightno-input" className="text-sm text-ink-muted">
          Flight number
        </label>
        <input
          id="flightno-input"
          data-testid="flightno-input"
          ref={flightNoInputRef}
          autoFocus
          value={flightNo}
          onChange={(e) => setFlightNo(e.target.value.toUpperCase())}
          placeholder="e.g. EK412"
          className="num rounded border border-edge bg-raised px-3 py-2 text-lg text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
        />
        <p className="text-sm text-ink-muted">e.g. EK412</p>

        {autofillLegs && autofillFlightNo && (
          <div data-testid="autofill-card" className="entrance flex flex-col gap-3 rounded border border-edge bg-raised p-4">
            {autofillLegs.map((leg, index) => {
              const reportLocal = reportLocalFor(leg);
              const isEditingReport = editingReportLeg === leg.legSeq;
              return (
                <div key={leg.legSeq} className="flex flex-col gap-2 border-t border-edge pt-3 first:border-t-0 first:pt-0">
                  <p className="text-ink">
                    {leg.origin} → {leg.dest}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label htmlFor={`autofill-dep-${leg.legSeq}`} className="text-sm text-ink-muted">
                      Dep
                    </label>
                    <input
                      id={`autofill-dep-${leg.legSeq}`}
                      data-testid="autofill-dep"
                      type="time"
                      value={leg.depTime}
                      onChange={(e) => updateAutofillLeg(index, { depTime: e.target.value })}
                      className="num min-w-[5.5rem] rounded border border-edge bg-card px-2 py-1 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
                    />
                    <label htmlFor={`autofill-arr-${leg.legSeq}`} className="text-sm text-ink-muted">
                      Arr
                    </label>
                    <span className="inline-flex items-center gap-0.5">
                      <input
                        id={`autofill-arr-${leg.legSeq}`}
                        data-testid="autofill-arr"
                        type="time"
                        value={leg.arrTime}
                        onChange={(e) => updateAutofillLeg(index, { arrTime: e.target.value })}
                        className="num min-w-[5.5rem] rounded border border-edge bg-card px-2 py-1 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
                      />
                      {leg.dayOffset > 0 && (
                        <sup className="num text-ink-muted">+{leg.dayOffset}</sup>
                      )}
                    </span>
                  </div>

                  {isEditingReport ? (
                    <input
                      data-testid="report-chip"
                      type="time"
                      autoFocus
                      value={reportLocal}
                      onChange={(e) =>
                        setReportOverrides((prev) => new Map(prev).set(leg.legSeq, e.target.value))
                      }
                      onBlur={() => setEditingReportLeg(null)}
                      className="num w-fit rounded border border-accent bg-card px-2 py-1 text-report outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid="report-chip"
                      onClick={() => setEditingReportLeg(leg.legSeq)}
                      className="num w-fit rounded border border-edge px-2 py-1 text-sm text-report transition-colors duration-[120ms] hover:border-accent"
                    >
                      Report {reportLocal} · tap to edit
                    </button>
                  )}
                </div>
              );
            })}
            <p className="text-sm text-ink-muted">times from schedule — edit if your roster differs</p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              Add trip
            </button>
          </div>
        )}

        {!autofillLegs && (
          <div className="flex flex-col gap-2">
            {lookupMiss && <p className="text-sm text-ink-muted">unknown flight — enter details</p>}
            <button
              type="button"
              data-testid="manual-expand"
              onClick={switchToManual}
              className="w-fit text-sm text-ink-muted underline transition-colors duration-[120ms] hover:text-ink"
            >
              enter manually
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-ink-muted">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      onSubmit={handleManualSubmit}
      className="entrance flex w-full max-w-xl flex-col gap-4 rounded-lg border border-edge bg-card p-6"
    >
      {legs.map((leg, index) => {
        const originInfo = airportLabel(leg.origin);
        const destInfo = airportLabel(leg.dest);
        return (
          <fieldset key={index} className="flex flex-col gap-2 border-t border-edge pt-3 first:border-t-0 first:pt-0">
            <label htmlFor={`flight-no-${index}`} className="text-sm text-ink-muted">
              Flight no
            </label>
            <input
              id={`flight-no-${index}`}
              value={leg.flightNo}
              onChange={(e) => updateLeg(index, { flightNo: e.target.value.toUpperCase() })}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`origin-${index}`} className="text-sm text-ink-muted">
              Origin
            </label>
            <input
              id={`origin-${index}`}
              value={leg.origin}
              onChange={(e) => updateLeg(index, { origin: e.target.value.toUpperCase() })}
              onBlur={(e) => lookupAirport(e.target.value)}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
            {originInfo && <p className="text-sm text-ink-muted">{originInfo}</p>}

            <label htmlFor={`dest-${index}`} className="text-sm text-ink-muted">
              Dest
            </label>
            <input
              id={`dest-${index}`}
              value={leg.dest}
              onChange={(e) => updateLeg(index, { dest: e.target.value.toUpperCase() })}
              onBlur={(e) => lookupAirport(e.target.value)}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />
            {destInfo && <p className="text-sm text-ink-muted">{destInfo}</p>}

            <label htmlFor={`dep-${index}`} className="text-sm text-ink-muted">
              Departure (local)
            </label>
            <input
              id={`dep-${index}`}
              type="datetime-local"
              value={leg.dep}
              onChange={(e) => updateLeg(index, { dep: e.target.value })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`arr-${index}`} className="text-sm text-ink-muted">
              Arrival (local)
            </label>
            <input
              id={`arr-${index}`}
              type="datetime-local"
              value={leg.arr}
              onChange={(e) => updateLeg(index, { arr: e.target.value })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none transition-colors duration-[120ms] focus:border-accent"
            />

            <label htmlFor={`report-${index}`} className="text-sm text-report">
              Report (local)
            </label>
            <input
              id={`report-${index}`}
              type="datetime-local"
              value={leg.report}
              onChange={(e) => updateLeg(index, { report: e.target.value, reportTouched: true })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-report outline-none transition-colors duration-[120ms] focus:border-accent"
            />
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={addLeg}
        className="rounded border border-edge px-3 py-2 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
      >
        Add leg
      </button>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        Add trip
      </button>

      {error && (
        <p role="alert" className="text-sm text-ink-muted">
          {error}
        </p>
      )}
    </form>
  );
}
