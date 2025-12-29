import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Calendar,
  CalendarTheme,
  fromDateId,
  toDateId,
  type CalendarActiveDateRange,
} from '@marceloterreiro/flash-calendar';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

type CalendarWrapperProps = {
  currentMonth: DateTime;
  selectedDate: string | null;
  activeDateRanges: CalendarActiveDateRange[];
  onDayPress: (dateId: string) => void;
  dateHasFlights?: Set<string>;
  dateToFlags?: Map<string, string[]>;
};

export function CalendarWrapper({
  currentMonth,
  selectedDate,
  activeDateRanges,
  onDayPress,
  dateHasFlights,
  dateToFlags,
}: CalendarWrapperProps) {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  // Create calendar theme
  const calendarTheme: CalendarTheme = useMemo(
    () => ({
      rowMonth: {
        container: {
          display: 'none',
        },
        content: {
          display: 'none',
        },
      },
      rowWeek: {
        container: {
          borderBottomWidth: 1,
          borderBottomColor: colorScheme === 'dark' ? '#3A3A3A' : '#E5E5E5',
          paddingVertical: 4,
        },
      },
      itemWeekName: {
        content: {
          color: colorScheme === 'dark' ? '#9BA1A6' : '#687076',
          fontWeight: '600',
          fontSize: 13,
        },
      },
      itemDayContainer: {
        activeDayFiller: {
          backgroundColor: themeColors.tint,
        },
      },
      itemDay: {
        idle: ({isToday, id}) => {
          const dateId = DateTime.fromJSDate(fromDateId(id)).toISODate() || '';
          const hasFlights = dateHasFlights?.has(dateId) || false;
          return {
            container: {
              backgroundColor: isToday
                ? themeColors.tint + '20'
                : hasFlights
                  ? themeColors.tint + '10'
                  : 'transparent',
              borderRadius: 10,
              borderWidth: hasFlights && !isToday ? 1 : 0,
              borderColor: hasFlights && !isToday ? themeColors.tint + '40' : 'transparent',
            },
            content: {
              color: isToday
                ? themeColors.tint
                : hasFlights
                  ? colorScheme === 'dark'
                    ? '#ECEDEE'
                    : '#11181C'
                  : colorScheme === 'dark'
                    ? '#ECEDEE'
                    : '#11181C',
              fontWeight: isToday || hasFlights ? '600' : '400',
              fontSize: 15,
            },
          };
        },
        today: ({isPressed}) => ({
          container: {
            borderWidth: 2.5,
            borderColor: themeColors.tint,
            borderRadius: 10,
            backgroundColor: isPressed ? themeColors.tint : 'transparent',
            shadowColor: themeColors.tint,
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 3,
          },
          content: {
            color: isPressed ? '#FFFFFF' : themeColors.tint,
            fontWeight: '700',
            fontSize: 15,
          },
        }),
        active: () => ({
          container: {
            backgroundColor: themeColors.tint,
            borderRadius: 10,
            shadowColor: themeColors.tint,
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 4,
          },
          content: {
            color: '#FFFFFF',
            fontWeight: '700',
            fontSize: 15,
          },
        }),
        disabled: () => ({
          container: {
            backgroundColor: 'transparent',
          },
          content: {
            color: colorScheme === 'dark' ? '#4A4A4A' : '#CCCCCC',
            fontWeight: '400',
          },
        }),
      },
    }),
    [colorScheme, themeColors.tint, dateHasFlights],
  );

  // Filter active ranges to current month
  const filteredActiveRanges = useMemo(() => {
    const getFirstDayOfMonth = (dateTime: DateTime): DateTime => {
      return dateTime.startOf('month');
    };

    return [
      ...activeDateRanges.filter((range) => {
        const rangeDate = fromDateId(range.startId || '');
        const rangeDateTime = DateTime.fromJSDate(rangeDate);
        const rangeMonth = getFirstDayOfMonth(rangeDateTime);
        return rangeMonth.hasSame(currentMonth, 'month');
      }),
      ...(selectedDate
        ? [
            {
              startId: selectedDate,
              endId: selectedDate,
            },
          ]
        : []),
    ];
  }, [activeDateRanges, currentMonth, selectedDate]);

  // Generate all days in the current month for flag overlay
  const monthDays = useMemo(() => {
    if (!dateToFlags || dateToFlags.size === 0) return [];

    const days: Array<{
      dateId: string;
      isoDate: string;
      flags: string[];
      row: number;
      col: number;
    }> = [];
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const firstDayOfMonth = startOfMonth;
    const firstWeekday = firstDayOfMonth.weekday; // 1 = Monday, 7 = Sunday

    let currentDate = startOfMonth;
    while (currentDate <= endOfMonth) {
      const isoDate = currentDate.toISODate();
      if (isoDate) {
        const dateId = toDateId(currentDate.toJSDate());
        if (dateId) {
          const flags = dateToFlags.get(isoDate) || [];
          if (flags.length > 0) {
            const dayOfMonth = currentDate.day;
            const weekday = currentDate.weekday;
            const daysFromStart = dayOfMonth - 1;
            const row = Math.floor((daysFromStart + firstWeekday - 1) / 7);
            const col = (weekday - 1) % 7;
            days.push({dateId, isoDate, flags, row, col});
          }
        }
      }
      currentDate = currentDate.plus({days: 1});
    }

    return days;
  }, [currentMonth, dateToFlags]);

  return (
    <View style={styles.calendarContainer}>
      <Calendar
        calendarActiveDateRanges={filteredActiveRanges}
        calendarMonthId={toDateId(currentMonth.startOf('month').toJSDate())}
        onCalendarDayPress={onDayPress}
        calendarDayHeight={50}
        calendarMonthHeaderHeight={0}
        calendarRowVerticalSpacing={12}
        calendarRowHorizontalSpacing={12}
        theme={calendarTheme}
      />
      {/* Flag overlay - positioned absolutely underneath days */}
      {monthDays.length > 0 && (
        <View style={styles.flagOverlay} pointerEvents="none">
          {monthDays.map(({dateId, flags, row, col}) => {
            // Calculate position: each day is approximately 14.28% width (100% / 7)
            // With 12px spacing, we need to account for spacing
            // Position flags at the bottom of each day cell
            const dayWidthPercent = 100 / 7;
            const left = `${col * dayWidthPercent + dayWidthPercent / 2}%`;
            const top = `${row * 62 + 38}px`; // 50px day height + 12px spacing, position at ~38px from top of cell

            return (
              <View
                key={dateId}
                style={[
                  styles.flagContainer,
                  {
                    left: parseFloat(left),
                    top: parseFloat(top),
                    transform: [{translateX: -7}], // Center the flag (approximate half width)
                  },
                ]}>
                <ThemedText style={styles.flagText}>
                  {flags.slice(0, 2).join(' ')}
                  {flags.length > 2 ? ' +' : ''}
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  calendarContainer: {
    position: 'relative',
  },
  flagOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  flagContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
  },
  flagText: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
});
