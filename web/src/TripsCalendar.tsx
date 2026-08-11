import { useRef, useState } from "react";
import { localDateKey, monthGrid, tripDaysInMonth } from "@roaster/shared";
import type { TripWithFlights } from "./api";
import { dutyDayMarks, type DayKind } from "./lib/dayMarks";
import { HOME_BASE_IATA } from "./lib/homeBase";

type Props = {
  now: Date;
  trips: TripWithFlights[];
  homeTz: string;
  /** Called for any day tap in non-picker mode (empty or trip day, current or past-with-trip)
   * — the caller owns select-vs-open-sheet semantics. In picker mode, called for future days
   * only (date-picker behavior). */
  onPickDay: (isoDate: string) => void;
  /** "picker": pure date-picker mode for the add-trip stepper - no trip markers, no open-trip
   * behavior, but today-gating (future days only) stays the same as the default trip view. */
  mode?: "picker";
  /** ISO dates added this rapid-entry session but not yet reflected in `trips` (no refetch
   * happened yet) — marked on the grid like a trip day, but tapping still opens the add flow
   * since there's no trip object for them yet. */
  optimisticIsoDates?: ReadonlySet<string>;
  /** Currently selected day (tap-to-detail) - rendered with a stronger, filled ring distinct
   * from today's outline ring. Not used in picker mode. */
  selectedIso?: string | null;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Direction at a glance: away from base, back to base, out-and-back, outstation hop, slip. */
const DAY_GLYPH: Record<DayKind, string> = {
  outbound: "↗",
  return: "↙",
  turnaround: "⇄",
  sector: "→",
  layover: "·",
};

/** Colour rides on the GLYPH, not the station code: `accent` on `accent-soft` measures 3.97:1
 * in light mode, under the 4.5:1 text minimum, while a glyph is a non-text graphic held to
 * 3:1. The code itself stays `text-ink` (14.7:1 light / 11.1 dark), so the pair is legible and
 * direction is still carried by shape as well as colour. */
const DAY_TONE: Record<DayKind, string> = {
  outbound: "text-accent",
  return: "text-ink",
  turnaround: "text-accent",
  sector: "text-ink-muted",
  layover: "text-ink-muted",
};

const DAY_LABEL: Record<DayKind, string> = {
  outbound: "outbound to",
  return: "return from",
  turnaround: "turnaround via",
  sector: "sector to",
  layover: "layover at",
};
// Swipe thresholds. 50px of horizontal travel rules out an accidental brush; the 1.5x
// horizontal/vertical ratio rejects a vertical scroll that happens to also drift >50px sideways
// (a straight-down drag on a phone is rarely perfectly vertical). Pointer Events, not touch-only,
// so a trackpad drag works too and the gesture is testable without a touch-emulating harness.
const SWIPE_MIN_DISTANCE = 50;
const SWIPE_DIRECTIONAL_RATIO = 1.5;
// Well under SWIPE_MIN_DISTANCE: a drag that falls short of a real swipe should still cancel the
// tap it would otherwise leave behind, so releasing mid-gesture never also selects a day.
const TAP_CANCEL_DISTANCE = 10;

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
  mode,
  optimisticIsoDates,
  selectedIso,
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
  // Direction glyphs come from the real trip days only: an optimistic day has no legs yet, and
  // the layover fallback would otherwise label it with a station from some earlier trip.
  const dutyMarks = dutyDayMarks(
    tripSpans.map(({ trip }) => trip),
    homeTz,
    HOME_BASE_IATA,
    dayMarks.keys(),
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

  // Swipe state lives in refs, not useState — it's read/written only inside pointer handlers on
  // the same render, never needs to trigger a re-render itself.
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  // Set once a gesture has moved past TAP_CANCEL_DISTANCE; consumed (and reset) by
  // handleGridClickCapture so a dragged release never also fires the day button underneath it.
  const dragMoved = useRef(false);

  function handlePointerDown(e: React.PointerEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragMoved.current = false;
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > TAP_CANCEL_DISTANCE || Math.abs(dy) > TAP_CANCEL_DISTANCE) {
      dragMoved.current = true;
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = null;
    if (Math.abs(dx) > SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * SWIPE_DIRECTIONAL_RATIO) {
      if (dx < 0) goNextMonth();
      else goPrevMonth();
    }
  }

  // Capture phase runs before the day button's own onClick (bubble phase), so this swallows the
  // click a swipe leaves in its wake before it ever reaches the button.
  function handleGridClickCapture(e: React.MouseEvent) {
    if (dragMoved.current) {
      e.stopPropagation();
      dragMoved.current = false;
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
    if (isPicker) {
      if (iso >= today) onPickDay(iso);
      return;
    }
    const trip = tripByDay.get(iso);
    if (trip || iso >= today) {
      onPickDay(iso);
    }
  }

  return (
    // w-full, not shrink-to-fit: the grid is dropped into both a stretched column (trips) and
    // an `items-center` one (empty state), and without it the two render at different widths.
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="calendar-prev"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="min-h-[44px] min-w-[44px] rounded border border-edge px-2 py-1 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
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
          className="min-h-[44px] min-w-[44px] rounded border border-edge px-2 py-1 text-ink transition-colors duration-[120ms] hover:border-ink-muted"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-wide text-ink-muted">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {/* gap-2 (8px), not gap-1: adjacent tap targets need 8px of separation, and 7 cells plus
          six 8px gaps still leaves 44px cells at a 390px viewport.
          touch-pan-y: the browser keeps owning vertical scrolling outright (we never
          preventDefault on it) - horizontal movement is left free for the pointer handlers
          below to read as a swipe. */}
      <div
        data-testid="calendar-grid"
        className="grid touch-pan-y grid-cols-7 gap-2"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClickCapture={handleGridClickCapture}
      >
        {grid.flat().map((cell) => {
          const isToday = cell.iso === today;
          const isSelected = cell.iso === selectedIso;
          const isPast = cell.iso < today;
          const mark = dayMarks.get(cell.iso);
          const hasTrip = mark !== undefined;
          const duty = dutyMarks.get(cell.iso);
          const disabled = !hasTrip && isPast;

          return (
            <button
              key={cell.iso}
              type="button"
              data-testid={`calendar-day-${cell.iso}`}
              disabled={disabled}
              aria-label={duty ? `${cell.day} ${DAY_LABEL[duty.kind]} ${duty.code}` : undefined}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              onClick={() => handleDayClick(cell.iso)}
              className={[
                "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border py-2 transition-[background-color,border-color,transform] duration-[120ms]",
                hasTrip ? "border-transparent bg-accent-soft" : "border-edge",
                // Selected (tap-to-detail) gets a stronger, filled ring - visually distinct
                // from today's plain outline ring so both can be told apart when they coincide.
                isSelected ? "ring-2 ring-accent ring-offset-1 ring-offset-ground" : isToday ? "ring-2 ring-accent" : "",
                !cell.inMonth ? "opacity-40" : "",
                isPast && !hasTrip ? "opacity-60" : "",
                // Press feedback: transform only, so a pressed cell never nudges its neighbours.
                disabled ? "cursor-default" : "hover:bg-raised active:scale-[0.96]",
              ].join(" ")}
            >
              <span className="num text-sm text-ink">{cell.day}</span>
              {duty ? (
                <span
                  data-testid={`day-mark-${cell.iso}`}
                  className="num flex items-center gap-px text-xs leading-none text-ink"
                >
                  <span aria-hidden="true" className={DAY_TONE[duty.kind]}>
                    {DAY_GLYPH[duty.kind]}
                  </span>
                  {duty.code}
                </span>
              ) : (
                // Optimistically added day: marked, but the legs haven't been refetched yet.
                hasTrip && <span className="h-1 w-3 rounded-full bg-accent" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
