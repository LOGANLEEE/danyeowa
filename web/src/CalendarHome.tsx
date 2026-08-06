import { useEffect, useRef, useState } from "react";
import {
  dayOffset,
  formatLocal,
  layoverHours,
  localDateKey,
  relativeUntil,
  tripProgress,
  tripDaysInMonth,
} from "@roaster/shared";
import { getTrips } from "./api";
import type { TripWithFlights } from "./api";
import DaySheet from "./DaySheet";
import TripsCalendar from "./TripsCalendar";

type Props = {
  now: Date;
  /** Bumped by the parent (e.g. the tab bar's center + button) to open the day sheet for
   * today, or the next trip-free day if today already has a trip. */
  openTodayToken?: number;
};

const LEAVE_HOME_LEAD_MS = 55 * 60 * 1000;

/** Calendar tab: month grid (trip days marked) + an active-pairing progress card (when a
 * trip spans `now`) + a compact next-duty card. Tapping any day, or the next-duty card,
 * opens the DaySheet (view+edit an existing trip, or add one on an empty day). The upcoming
 * list lives on the Trips tab (see TripsView.tsx). */
export default function CalendarHome({ now, openTodayToken }: Props) {
  const [trips, setTrips] = useState<TripWithFlights[] | null>(null);
  const [sheetIsoDate, setSheetIsoDate] = useState<string | null>(null);
  // Days added this rapid-entry session, marked on the grid immediately without a refetch -
  // cleared whenever the sheet dismisses and actually refetches (its own data now covers them).
  const [optimisticDays, setOptimisticDays] = useState<Set<string>>(new Set());
  const nowMs = now.getTime();

  function refetch() {
    getTrips().then(setTrips);
    setOptimisticDays(new Set());
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const homeTz = trips?.[0]?.flights[0]?.depTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Finds the trip (if any) covering a given local calendar date, by checking every trip's
  // away-day span for that date's month against tripDaysInMonth (mirrors TripsCalendar's own
  // per-day lookup so the sheet always matches what the grid renders).
  function tripForDay(iso: string): TripWithFlights | null {
    if (!trips) return null;
    const [yearStr, monthStr] = iso.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    for (const trip of trips) {
      const legs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
      const first = legs[0];
      const last = legs[legs.length - 1];
      if (!first || !last) continue;
      const spanDays = tripDaysInMonth([{ firstDepUtc: first.depUtc, lastArrUtc: last.arrUtc }], year, month, homeTz);
      if (spanDays.has(iso)) return trip;
    }
    return null;
  }

  // Opens the sheet for today, or the next trip-free day after today when today already has
  // a trip — used by the tab bar's center + button. Tracks the LAST SEEN token (initialized
  // to the current value, not 0) so a remount with an already-bumped token (e.g. `key` change
  // from an unrelated trip edit) doesn't spuriously reopen the sheet — only an actual change
  // does.
  const lastSeenToken = useRef(openTodayToken);
  useEffect(() => {
    if (openTodayToken === lastSeenToken.current || trips === null) return;
    lastSeenToken.current = openTodayToken;
    const today = localDateKey(now.toISOString(), homeTz);
    let candidate = today;
    for (let i = 0; i < 366; i++) {
      if (!tripForDay(candidate)) {
        setSheetIsoDate(candidate);
        return;
      }
      const [y, m, d] = candidate.split("-").map(Number) as [number, number, number];
      candidate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTodayToken, trips]);

  if (trips === null) {
    return <p className="text-ink-muted">loading…</p>;
  }

  const allFlights = trips
    .flatMap((trip) => trip.flights)
    .sort((a, b) => Date.parse(a.reportUtc) - Date.parse(b.reportUtc));
  const upcoming = allFlights.filter((f) => Date.parse(f.reportUtc) >= nowMs);
  const nextDuty = upcoming[0] ?? null;
  const tripByFlightId = new Map(trips.flatMap((trip) => trip.flights.map((f) => [f.id, trip])));

  if (!nextDuty) {
    return (
      <div className="entrance flex w-full max-w-xl flex-col items-center gap-4 text-center">
        <TripsCalendar
          now={now}
          trips={trips}
          homeTz={homeTz}
          onPickDay={(iso) => setSheetIsoDate(iso)}
          onOpenTrip={() => {}}
          optimisticIsoDates={optimisticDays}
        />
        {/* trips stays [] during rapid entry (no refetch until dismiss) - once a day has
            been marked optimistically, this "no trips yet" empty state + its CTA would
            otherwise stay stale, visible behind the open sheet, contradicting what the
            grid above already shows. */}
        {optimisticDays.size === 0 && (
          <>
            <p className="text-ink-muted">No trips yet — add your first</p>
            <button
              type="button"
              onClick={() => setSheetIsoDate(localDateKey(now.toISOString(), homeTz))}
              className="rounded bg-accent px-3 py-2 font-medium text-ground transition-[background-color,transform] duration-[120ms] hover:brightness-110 active:scale-[0.98]"
            >
              Add your first trip
            </button>
          </>
        )}
        {sheetIsoDate && (
          <DaySheet
            isoDate={sheetIsoDate}
            trip={tripForDay(sheetIsoDate)}
            trips={trips}
            homeTz={homeTz}
            onClose={() => setSheetIsoDate(null)}
            onChanged={refetch}
            onAdded={(iso) => setOptimisticDays((prev) => new Set(prev).add(iso))}
          />
        )}
      </div>
    );
  }

  const nextDutyTrip = tripByFlightId.get(nextDuty.id) ?? null;
  const legs = nextDutyTrip ? [...nextDutyTrip.flights].sort((a, b) => a.legSeq - b.legSeq) : [nextDuty];
  const firstLeg = legs[0]!;
  const lastLeg = legs[legs.length - 1]!;
  const tripDays = new Set(legs.map((leg) => formatLocal(leg.depUtc, leg.depTz, { withDate: true }).slice(0, 6)))
    .size;
  // Full route chain (every stop in order), not just endpoints - e.g. a 2-leg
  // DXB->SYD->CHC schedule renders "DXB → SYD → CHC", not "DXB → CHC".
  const routeChain = [legs[0]!.origin, ...legs.map((leg) => leg.dest)].filter(
    (stop, index, all) => index === 0 || stop !== all[index - 1],
  );

  const leaveHomeUtc = new Date(Date.parse(nextDuty.reportUtc) - LEAVE_HOME_LEAD_MS).toISOString();
  const arrOffset = dayOffset(firstLeg.depUtc, lastLeg.arrUtc, firstLeg.depTz, lastLeg.arrTz);

  function openNextDuty() {
    setSheetIsoDate(localDateKey(firstLeg.depUtc, firstLeg.depTz));
  }

  // Active pairing: a trip whose first departure has passed and last arrival hasn't (spans
  // `now`). Home base tz = origin tz of the trip's first leg. Ported from the old CrewHome -
  // glance-critical mid-trip status per UX research §2.
  const activePairing = trips
    .map((trip) => {
      const tripLegs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
      const first = tripLegs[0];
      const last = tripLegs[tripLegs.length - 1];
      if (!first || !last) return null;
      const progress = tripProgress(first.depUtc, last.arrUtc, first.depTz, nowMs);
      return progress ? { trip, legs: tripLegs, first, last, progress } : null;
    })
    .find((entry) => entry !== null);

  return (
    <div className="entrance flex w-full max-w-xl flex-col gap-4">
      <TripsCalendar
        now={now}
        trips={trips}
        homeTz={nextDuty.depTz}
        onPickDay={(iso) => setSheetIsoDate(iso)}
        onOpenTrip={(trip) => {
          const legs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
          setSheetIsoDate(localDateKey(legs[0]!.depUtc, legs[0]!.depTz));
        }}
        optimisticIsoDates={optimisticDays}
      />

      {activePairing && (
        <div
          data-testid="pairing-progress-card"
          className="stagger-1 flex flex-col gap-3 rounded-lg border border-edge bg-card p-4"
        >
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-ink">Trip · {activePairing.progress.totalDays} days</p>
            <p className="num text-sm text-ink-muted">
              day {activePairing.progress.currentDay} of {activePairing.progress.totalDays}
            </p>
          </div>

          <p className="num text-sm text-ink-muted">
            {activePairing.legs.map((leg, index) => {
              const prevLeg = activePairing.legs[index - 1];
              const layover = prevLeg ? layoverHours(prevLeg.arrUtc, leg.depUtc) : null;
              return (
                <span key={leg.id}>
                  {layover !== null && ` ····· ${layover.toFixed(0)}h ····· `}
                  {leg.origin} → {leg.dest}
                </span>
              );
            })}
          </p>

          <div className="flex gap-1">
            {Array.from({ length: activePairing.progress.totalDays }, (_, i) => i + 1).map((day) => (
              <div
                key={day}
                className={`h-1.5 flex-1 rounded-full ${
                  day <= activePairing.progress.currentDay ? "bg-accent" : "bg-accent-soft"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        data-testid="next-duty-card"
        onClick={openNextDuty}
        className="stagger-2 flex flex-col gap-1 rounded-lg border border-edge bg-card p-4 text-left transition-colors duration-[120ms] hover:bg-raised"
      >
        <p className="font-semibold text-ink">
          {routeChain.join(" → ")}
          {arrOffset > 0 && <sup>+{arrOffset}</sup>} ·{" "}
          <span className="num">
            {formatLocal(firstLeg.depUtc, firstLeg.depTz, { withDate: true })} –{" "}
            {formatLocal(lastLeg.arrUtc, lastLeg.arrTz, { withDate: true })}
          </span>
        </p>
        <p className="text-sm text-ink-muted">
          {nextDuty.flightNo} · trip {tripDays} {tripDays === 1 ? "day" : "days"}
        </p>
        <p className="text-sm text-ink-muted">
          Report{" "}
          <span className="num text-report font-semibold">{formatLocal(nextDuty.reportUtc, nextDuty.depTz)}</span>{" "}
          · leave home <span className="num">{formatLocal(leaveHomeUtc, nextDuty.depTz)}</span> ·{" "}
          <span className="num">{relativeUntil(nextDuty.reportUtc, nowMs)}</span>
        </p>
      </button>

      {sheetIsoDate && (
        <DaySheet
          isoDate={sheetIsoDate}
          trip={tripForDay(sheetIsoDate)}
          trips={trips}
          homeTz={homeTz}
          onClose={() => setSheetIsoDate(null)}
          onChanged={refetch}
          onAdded={(iso) => setOptimisticDays((prev) => new Set(prev).add(iso))}
        />
      )}
    </div>
  );
}
