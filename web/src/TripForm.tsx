import { useState } from "react";
import type { Airport, LegInput } from "@roaster/shared";
import { TripInputSchema, reportDefault, wallToUtc } from "@roaster/shared";
import { createTrip, getAirport } from "./api";

type Props = { onSubmitted: () => void };

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

export default function TripForm({ onSubmitted }: Props) {
  const [legs, setLegs] = useState<LegDraft[]>([emptyLeg()]);
  const [airports, setAirports] = useState<Map<string, Airport | null>>(new Map());
  const [unknown, setUnknown] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xl flex-col gap-4 rounded-lg border border-edge bg-surface p-6"
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
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
            />

            <label htmlFor={`origin-${index}`} className="text-sm text-ink-muted">
              Origin
            </label>
            <input
              id={`origin-${index}`}
              value={leg.origin}
              onChange={(e) => updateLeg(index, { origin: e.target.value.toUpperCase() })}
              onBlur={(e) => lookupAirport(e.target.value)}
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
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
              className="rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
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
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
            />

            <label htmlFor={`arr-${index}`} className="text-sm text-ink-muted">
              Arrival (local)
            </label>
            <input
              id={`arr-${index}`}
              type="datetime-local"
              value={leg.arr}
              onChange={(e) => updateLeg(index, { arr: e.target.value })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-ink outline-none focus:border-amber"
            />

            <label htmlFor={`report-${index}`} className="text-sm text-amber">
              Report (local)
            </label>
            <input
              id={`report-${index}`}
              type="datetime-local"
              value={leg.report}
              onChange={(e) => updateLeg(index, { report: e.target.value, reportTouched: true })}
              className="num rounded border border-edge bg-raised px-3 py-2 text-amber-num outline-none focus:border-amber"
            />
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={addLeg}
        className="rounded border border-edge px-3 py-2 text-ink hover:border-ink-muted"
      >
        Add leg
      </button>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-amber px-3 py-2 font-medium text-ground hover:brightness-110 disabled:opacity-50"
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
