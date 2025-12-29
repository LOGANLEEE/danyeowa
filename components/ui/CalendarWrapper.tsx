import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Calendar, CalendarTheme, fromDateId, toDateId, type CalendarActiveDateRange } from '@marceloterreiro/flash-calendar';
import { DateTime } from 'luxon';
import { useMemo } from 'react';

type CalendarWrapperProps = {
  currentMonth: DateTime;
  selectedDate: string | null;
  activeDateRanges: CalendarActiveDateRange[];
  onDayPress: (dateId: string) => void;
  dateHasFlights?: Set<string>;
};

export function CalendarWrapper({
  currentMonth,
  selectedDate,
  activeDateRanges,
  onDayPress,
  dateHasFlights,
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
        idle: ({ isToday, id }) => {
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
        today: ({ isPressed }) => ({
          container: {
            borderWidth: 2.5,
            borderColor: themeColors.tint,
            borderRadius: 10,
            backgroundColor: isPressed ? themeColors.tint : 'transparent',
            shadowColor: themeColors.tint,
            shadowOffset: { width: 0, height: 2 },
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
            shadowOffset: { width: 0, height: 2 },
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
        const rangeDate = fromDateId(range.startId);
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

  return (
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
  );
}

