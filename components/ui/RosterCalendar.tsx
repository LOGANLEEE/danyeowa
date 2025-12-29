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
  // Normalize selectedDate to dateId format for CalendarWrapper
  const selectedDateId = useMemo(() => {
    if (!selectedDate) return null;

    // Check if it's already in dateId format (8 digits, no dashes)
    if (/^\d{8}$/.test(selectedDate)) {
      return selectedDate;
    }

    // Assume it's ISO format (YYYY-MM-DD) and convert
    try {
      const date = DateTime.fromISO(selectedDate);
      if (date.isValid) {
        return toDateId(date.toJSDate());
      }
    } catch {
      // Invalid date format
    }

    return null;
  }, [selectedDate]);

  // CalendarWrapper expects dateHasFlights in ISO format (YYYY-MM-DD)
  // So we pass it through as-is if it's already in ISO format
  // If it's in dateId format, we convert it to ISO
  const dateHasFlightsISO = useMemo(() => {
    if (!dateHasFlights) return undefined;

    // Check if the first entry is in dateId format (8 digits) or ISO format
    const firstEntry = Array.from(dateHasFlights)[0];
    if (!firstEntry) return dateHasFlights;

    // If it's already in ISO format (has dashes), use as-is
    if (firstEntry.includes('-')) {
      return dateHasFlights;
    }

    // Convert from dateId format to ISO format
    const isoSet = new Set<string>();
    dateHasFlights.forEach((dateId) => {
      try {
        const dateObj = fromDateId(dateId);
        const isoDate = DateTime.fromJSDate(dateObj).toISODate();
        if (isoDate) {
          isoSet.add(isoDate);
        }
      } catch {
        // Skip invalid dates
      }
    });
    return isoSet;
  }, [dateHasFlights]);

  // Create a map of dates (ISO format) to country flags
  const dateToFlags = useMemo(() => {
    if (!rosters || rosters.length === 0) return new Map<string, string[]>();

    const flagsMap = new Map<string, string[]>();

    rosters.forEach((roster) => {
      const date = roster.flight_date;
      if (!date) return;

      const flag = getCountryFlag(roster.destination);
      // Replace fallback flag (✈️) with checkered flag (🏁) when no country data
      const displayFlag = flag === '✈️' ? '🏁' : flag;

      const existingFlags = flagsMap.get(date) || [];
      if (!existingFlags.includes(displayFlag)) {
        flagsMap.set(date, [...existingFlags, displayFlag]);
      }
    });

    return flagsMap;
  }, [rosters]);

  // Helper functions
  const getFirstDayOfMonth = (dateTime: DateTime): DateTime => {
    return dateTime.startOf('month');
  };

  // Internal state for uncontrolled mode
  const [internalCurrentMonth, setInternalCurrentMonth] = useState<DateTime>(
    () => initialMonth || getFirstDayOfMonth(DateTime.now()),
  );

  // Use controlled or uncontrolled month
  const currentMonth = controlledCurrentMonth ?? internalCurrentMonth;

  const addMonths = (dateTime: DateTime, months: number): DateTime => {
    return dateTime.plus({months});
  };

  // Month navigation handlers
  const handlePreviousMonth = useCallback(() => {
    const newMonth = addMonths(currentMonth, -1);
    if (controlledCurrentMonth === undefined) {
      setInternalCurrentMonth(newMonth);
    }
    onMonthChange?.(newMonth);
  }, [currentMonth, controlledCurrentMonth, onMonthChange]);

  const handleNextMonth = useCallback(() => {
    const newMonth = addMonths(currentMonth, 1);
    if (controlledCurrentMonth === undefined) {
      setInternalCurrentMonth(newMonth);
    }
    onMonthChange?.(newMonth);
  }, [currentMonth, controlledCurrentMonth, onMonthChange]);

  const handleToday = useCallback(() => {
    const today = getFirstDayOfMonth(DateTime.now());
    if (controlledCurrentMonth === undefined) {
      setInternalCurrentMonth(today);
    }
    onMonthChange?.(today);

    // Also select today's date
    const todayDateId = toDateId(DateTime.now().toJSDate());
    if (todayDateId) {
      onDayPress(todayDateId);
    }
  }, [controlledCurrentMonth, onMonthChange, onDayPress]);

  // Convert activeDateRanges to ensure they're in dateId format
  const normalizedActiveDateRanges = useMemo(() => {
    return activeDateRanges.map((range) => {
      // Ensure startId and endId exist
      if (!range.startId || !range.endId) {
        return range;
      }

      // If startId/endId are already in dateId format, use them
      if (/^\d{8}$/.test(range.startId) && /^\d{8}$/.test(range.endId)) {
        return range;
      }

      // Try to convert from ISO format
      try {
        const startDate = DateTime.fromISO(range.startId);
        const endDate = DateTime.fromISO(range.endId);
        if (startDate.isValid && endDate.isValid) {
          const startId = toDateId(startDate.toJSDate());
          const endId = toDateId(endDate.toJSDate());
          if (startId && endId) {
            return {
              startId,
              endId,
            };
          }
        }
      } catch {
        // Invalid format, return as-is
      }

      return range;
    });
  }, [activeDateRanges]);

  const calendarContent = (
    <>
      <MonthNavigation
        currentMonth={currentMonth}
        onPreviousMonth={handlePreviousMonth}
        onNextMonth={handleNextMonth}
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

  if (!showWrapper) {
    return calendarContent;
  }

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
