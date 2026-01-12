import { CalendarWrapper } from '@/components/ui/CalendarWrapper';
import { MonthNavigation } from '@/components/ui/MonthNavigation';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fromDateId, toDateId, type CalendarActiveDateRange } from '@marceloterreiro/flash-calendar';
import { LinearGradient } from 'expo-linear-gradient';
import { DateTime } from 'luxon';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Surface } from 'react-native-paper';

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
   * Custom style for the wrapper
   */
  wrapperStyle?: ViewStyle;
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
  initialMonth,
  currentMonth: controlledCurrentMonth,
  onMonthChange,
  showWrapper = true,
  wrapperStyle,
}: RosterCalendarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
      />
    </>
  );

  if (!showWrapper) return calendarContent;

  // Border color based on theme
  const borderColor = isDark ? 'rgba(160, 0, 42, 0.4)' : 'rgba(128, 0, 32, 0.3)';

  return (
    <Surface style={[styles.wrapper, { borderColor }, wrapperStyle]} elevation={4}>
      <LinearGradient
        colors={
          isDark
            ? (['rgba(160, 0, 42, 0.2)', 'rgba(128, 0, 32, 0.1)'] as const)
            : (['rgba(128, 0, 32, 0.1)', 'rgba(160, 0, 42, 0.05)'] as const)
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}>
        {calendarContent}
      </LinearGradient>
    </Surface>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
  },
});
