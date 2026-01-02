import { ThemedView } from '@/components/ThemedView';
import { CalendarWrapper } from '@/components/ui/CalendarWrapper';
import { MonthNavigation } from '@/components/ui/MonthNavigation';
import { Roster } from '@/lib/supabase/types';
import { getCountryFlag } from '@/utils/country-flags';
import { fromDateId, toDateId, type CalendarActiveDateRange } from '@marceloterreiro/flash-calendar';
import { DateTime } from 'luxon';
import { useCallback, useMemo, useState } from 'react';

type RosterCalendarProps = {
  /**
   * Selected date in either dateId format (YYYYMMDD) or ISO format (YYYY-MM-DD)
   * If null, no date is selected
   */
  selectedDate: string | null;
  /**
   * Callback when a day is pressed
   * Receives the dateId (YYYYMMDD format)
   */
  onDayPress: (dateId: string) => void;
  /**
   * Active date ranges for calendar highlighting
   */
  activeDateRanges: CalendarActiveDateRange[];
  /**
   * Set of dates (in ISO format YYYY-MM-DD) that have flights
   * Used for visual indicators on calendar
   */
  dateHasFlights?: Set<string>;
  /**
   * Rosters data to extract country flags from destinations
   */
  rosters?: Roster[];
  /**
   * Initial month to display (defaults to current month)
   */
  initialMonth?: DateTime;
  /**
   * Controlled current month (if provided, component becomes controlled)
   * If not provided, component manages its own state
   */
  currentMonth?: DateTime;
  /**
   * Callback when month changes (only used in controlled mode)
   */
  onMonthChange?: (month: DateTime) => void;
  /**
   * Whether to show the styled wrapper (default: true)
   */
  showWrapper?: boolean;
  /**
   * Custom className for the wrapper
   */
  wrapperClassName?: string;
};

/**
 * Converts a date string to dateId format (YYYYMMDD)
 */
const toDateIdFormat = (dateStr: string): string | null => {
  if (/^\d{8}$/.test(dateStr)) return dateStr;
  try {
    const date = DateTime.fromISO(dateStr);
    return date.isValid ? toDateId(date.toJSDate()) : null;
  } catch {
    return null;
  }
};

/**
 * Converts a dateId string to ISO format (YYYY-MM-DD)
 */
const toISOFormat = (dateId: string): string | null => {
  try {
    const dateObj = fromDateId(dateId);
    return DateTime.fromJSDate(dateObj).toISODate() || null;
  } catch {
    return null;
  }
};

/**
 * Reusable calendar component for roster management
 * Combines MonthNavigation and CalendarWrapper with shared logic
 */
export function RosterCalendar({
  selectedDate,
  onDayPress,
  activeDateRanges,
  dateHasFlights,
  rosters,
  initialMonth,
  currentMonth: controlledCurrentMonth,
  onMonthChange,
  showWrapper = true,
  wrapperClassName,
}: RosterCalendarProps) {
  const [internalCurrentMonth, setInternalCurrentMonth] = useState<DateTime>(
    () => initialMonth || DateTime.now().startOf('month'),
  );

  const currentMonth = controlledCurrentMonth ?? internalCurrentMonth;
  const isControlled = controlledCurrentMonth !== undefined;

  // Normalize selectedDate to dateId format
  const selectedDateId = useMemo(
    () => (selectedDate ? toDateIdFormat(selectedDate) : null),
    [selectedDate],
  );

  // Convert dateHasFlights to ISO format if needed
  const dateHasFlightsISO = useMemo(() => {
    if (!dateHasFlights) return undefined;
    const firstEntry = Array.from(dateHasFlights)[0];
    if (!firstEntry || firstEntry.includes('-')) return dateHasFlights;

    const isoSet = new Set<string>();
    dateHasFlights.forEach((dateId) => {
      const iso = toISOFormat(dateId);
      if (iso) isoSet.add(iso);
    });
    return isoSet;
  }, [dateHasFlights]);

  // Map dates to country flags
  const dateToFlags = useMemo(() => {
    if (!rosters?.length) return new Map<string, string[]>();

    const flagsMap = new Map<string, string[]>();
    rosters.forEach((roster) => {
      if (!roster.flight_date) return;
      const flag = getCountryFlag(roster.destination);
      const displayFlag = flag === '✈️' ? '🏁' : flag;
      const existing = flagsMap.get(roster.flight_date) || [];
      if (!existing.includes(displayFlag)) {
        flagsMap.set(roster.flight_date, [...existing, displayFlag]);
      }
    });
    return flagsMap;
  }, [rosters]);

  // Normalize activeDateRanges to dateId format
  const normalizedActiveDateRanges = useMemo(
    () =>
      activeDateRanges.map((range) => {
        if (!range.startId || !range.endId) return range;
        if (/^\d{8}$/.test(range.startId) && /^\d{8}$/.test(range.endId)) {
          return range;
        }
        const startId = toDateIdFormat(range.startId);
        const endId = toDateIdFormat(range.endId);
        return startId && endId ? {startId, endId} : range;
      }),
    [activeDateRanges],
  );

  // Month navigation handler
  const handleMonthChange = useCallback(
    (delta: number) => {
      const newMonth = currentMonth.plus({months: delta});
      if (!isControlled) setInternalCurrentMonth(newMonth);
      onMonthChange?.(newMonth);
    },
    [currentMonth, isControlled, onMonthChange],
  );

  const handleToday = useCallback(() => {
    const today = DateTime.now().startOf('month');
    if (!isControlled) setInternalCurrentMonth(today);
    onMonthChange?.(today);
    const todayDateId = toDateId(DateTime.now().toJSDate());
    if (todayDateId) onDayPress(todayDateId);
  }, [isControlled, onMonthChange, onDayPress]);

  const calendarContent = (
    <>
      <MonthNavigation
        currentMonth={currentMonth}
        onPreviousMonth={() => handleMonthChange(-1)}
        onNextMonth={() => handleMonthChange(1)}
        onToday={handleToday}
      />
      <CalendarWrapper
        currentMonth={currentMonth}
        selectedDate={selectedDateId}
        activeDateRanges={normalizedActiveDateRanges}
        onDayPress={onDayPress}
        dateHasFlights={dateHasFlightsISO}
        dateToFlags={dateToFlags}
      />
    </>
  );

  if (!showWrapper) return calendarContent;

  return (
    <ThemedView
      animated
      delay={0}
      className={
        wrapperClassName ||
        'rounded-3xl p-6 border-2 border-[#800020]/30 dark:border-[#A0002A]/40 bg-gradient-to-br from-[#800020]/10 to-[#A0002A]/5 dark:from-[#A0002A]/20 dark:to-[#800020]/10 shadow-lg'
      }>
      {calendarContent}
    </ThemedView>
  );
}
