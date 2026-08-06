import { useState } from "react";
import { localDateKey, monthGrid, tripDaysInMonth } from "@roaster/shared";
import type { TripWithFlights } from "./api";

type Props = {
  now: Date;
  trips: TripWithFlights[];
  homeTz: string;
  onPickDay: (isoDate: string) => void;
  onOpenTrip: (trip: TripWithFlights) => void;
  /** "picker": pure date-picker mode for the add-trip stepper - no trip markers, no open-trip
   * behavior, but today-gating (future days only) stays the same as the default trip view. */
  mode?: "picker";
  /** ISO dates added this rapid-entry session but not yet reflected in `trips` (no refetch
   * happened yet) — marked on the grid like a trip day, but tapping still opens the add flow
   * since there's no trip object for them yet. */
  optimisticIsoDates?: ReadonlySet<string>;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function TripsCalendar({
  now,
  trips,
  homeTz,
  onPickDay,
  onOpenTrip,
  mode,
  optimisticIsoDates,
}: Props) {
  const isPicker = mode === "picker";
  // "Today" and the initial view month must use the home-base LOCAL date, not the UTC date -
  // they can differ by a day near midnight in tzs far from UTC (see localDateKey).
  const today = localDateKey(now.toISOString(), homeTz);
  const [todayYear, todayMonthStr] = today.split("-");
  const [viewYear, setViewYear] = useState(Number(todayYear));
  const [viewMonth, setViewMonth] = useState(Number(todayMonthStr)); // 1-12
  const grid = monthGrid(viewYear, viewMonth, homeTz);

  const tripSpans = isPicker
    ? []
    : trips
        .map((trip) => {
          const legs = [...trip.flights].sort((a, b) => a.legSeq - b.legSeq);
          const first = legs[0];
          const last = legs[legs.length - 1];
          if (!first || !last) return null;
          return { trip, firstDepUtc: first.depUtc, lastArrUtc: last.arrUtc };
        })
        .filter(
          (entry): entry is { trip: TripWithFlights; firstDepUtc: string; lastArrUtc: string } =>
            entry !== null,
        );

  const dayMarks = tripDaysInMonth(
    tripSpans.map(({ firstDepUtc, lastArrUtc }) => ({ firstDepUtc, lastArrUtc })),
    viewYear,
    viewMonth,
    homeTz,
  );
  const monthPrefix = `${viewYear}-${String(viewMonth).padStart(2, "0")}`;
  for (const iso of optimisticIsoDates ?? []) {
    if (iso.startsWith(monthPrefix) && !dayMarks.has(iso)) dayMarks.set(iso, "away");
  }

  // Per-day trip lookup for the click handler: which trip (if any) covers a given ISO date.
  const tripByDay = new Map<string, TripWithFlights>();
  for (const span of tripSpans) {
    const spanDays = tripDaysInMonth([span], viewYear, viewMonth, homeTz);
    for (const iso of spanDays.keys()) {
      if (!tripByDay.has(iso)) tripByDay.set(iso, span.trip);
    }
  }

  function goPrevMonth() {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleDayClick(iso: string) {
    const trip = tripByDay.get(iso);
    if (trip) {
      onOpenTrip(trip);
      return;
    }
    if (iso >= today) {
      onPickDay(iso);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="calendar-prev"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="rounded border border-edge px-2 py-1 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
        >
          ‹
        </button>
        <p className="text-sm font-medium text-ink">
          {MONTH_LABELS[viewMonth - 1]} {viewYear}
        </p>
        <button
          type="button"
          data-testid="calendar-next"
          onClick={goNextMonth}
          aria-label="Next month"
          className="rounded border border-edge px-2 py-1 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-wide text-ink-muted">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.flat().map((cell) => {
          const isToday = cell.iso === today;
          const isPast = cell.iso < today;
          const mark = dayMarks.get(cell.iso);
          const hasTrip = mark !== undefined;
          const disabled = !hasTrip && isPast;

          return (
            <button
              key={cell.iso}
              type="button"
              data-testid={`calendar-day-${cell.iso}`}
              disabled={disabled}
              onClick={() => handleDayClick(cell.iso)}
              className={[
                "flex flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-colors duration-[120ms]",
                hasTrip ? "border-transparent bg-accent-soft" : "border-edge",
                isToday ? "ring-2 ring-accent" : "",
                !cell.inMonth ? "opacity-40" : "",
                isPast && !hasTrip ? "opacity-60" : "",
                disabled ? "cursor-default" : "hover:bg-raised",
              ].join(" ")}
            >
              <span className="num text-sm text-ink">{cell.day}</span>
              {hasTrip && <span className="h-1 w-3 rounded-full bg-accent" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
