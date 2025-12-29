import { CoffeeIcon } from '@/components/CoffeeIcon';
import { ThemedLoader } from '@/components/ThemedLoader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFlightCodePrefix } from '@/lib/secure-storage';
import { Roster } from '@/lib/supabase/types';
import { useRostersStore } from '@/stores/use-rosters-store';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, CalendarTheme, fromDateId, toDateId } from '@marceloterreiro/flash-calendar';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Helper functions for month navigation using Luxon
const getFirstDayOfMonth = (dateTime: DateTime): DateTime => {
  return dateTime.startOf('month');
};

const addMonths = (dateTime: DateTime, months: number): DateTime => {
  return dateTime.plus({months});
};

const formatMonthYear = (dateTime: DateTime): string => {
  return dateTime.toFormat('MMMM yyyy');
};

// Helper function to get status color
const getStatusColor = (status: Roster['status'], colorScheme: 'light' | 'dark'): string => {
  const themeColors = Colors[colorScheme];
  switch (status) {
    case 'Scheduled':
      return colorScheme === 'dark' ? '#3B82F6' : '#2563EB'; // Blue
    case 'Confirmed':
      return themeColors.tint; // Roaster color
    case 'Delayed':
      return colorScheme === 'dark' ? '#F59E0B' : '#D97706'; // Amber
    case 'Cancelled':
      return colorScheme === 'dark' ? '#EF4444' : '#DC2626'; // Red
    case 'Completed':
      return colorScheme === 'dark' ? '#10B981' : '#059669'; // Green
    default:
      return themeColors.tint;
  }
};

export default function ScheduleScreen() {
  const colorScheme = useColorScheme();
  const {rosters, isLoading, fetchRosters, createRoster} = useRostersStore();
  const now = DateTime.now();
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateId(now.toJSDate()));
  const [currentMonth, setCurrentMonth] = useState<DateTime>(getFirstDayOfMonth(now));
  const [isInputMode, setIsInputMode] = useState(false);
  const [departureDate, setDepartureDate] = useState<string | null>(null);
  const [flightCode, setFlightCode] = useState('');
  const [flightType, setFlightType] = useState<'Depart' | 'Return'>('Depart');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [flightPrefix, setFlightPrefix] = useState<string | null>(null);
  const themeColors = Colors[colorScheme ?? 'light'];

  // Double tap detection
  const lastTapRef = useRef<{dateId: string | null; timestamp: number}>({
    dateId: null,
    timestamp: 0,
  });
  const doubleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Fetch rosters on mount
  useEffect(() => {
    fetchRosters();
  }, [fetchRosters]);

  // Load flight code prefix on mount
  useEffect(() => {
    const loadPrefix = async () => {
      try {
        const prefix = await getFlightCodePrefix();
        setFlightPrefix(prefix);
      } catch (error) {
        console.error('[ScheduleScreen] Error loading prefix:', error);
      }
    };
    loadPrefix();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
    };
  }, []);

  // Get rosters for selected date
  const selectedDateRosters = useMemo(() => {
    if (!selectedDate) return [];
    return rosters.filter((roster) => roster.flight_date === selectedDate);
  }, [rosters, selectedDate]);

  // Get all dates with rosters for calendar active ranges
  const calendarActiveDateRanges = useMemo(() => {
    const dateSet = new Set<string>();
    rosters.forEach((roster) => {
      dateSet.add(roster.flight_date);
    });

    return Array.from(dateSet).map((dateId) => ({
      startId: dateId,
      endId: dateId,
    }));
  }, [rosters]);

  // Check if a date has flights
  const dateHasFlights = useMemo(() => {
    const dateSet = new Set<string>();
    rosters.forEach((roster) => {
      dateSet.add(roster.flight_date);
    });
    return dateSet;
  }, [rosters]);

  // Create custom theme with roaster colors - enhanced for better visibility
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
          const hasFlights = dateHasFlights.has(id);
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

  const handleDayPress = useCallback(
    (dateId: string) => {
      // If modal is open, don't handle day press
      if (isInputMode) return;

      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300; // milliseconds

      // Check if this is a double tap on the same date
      if (
        lastTapRef.current.dateId === dateId &&
        now - lastTapRef.current.timestamp < DOUBLE_TAP_DELAY
      ) {
        // Clear the timeout if it exists
        if (doubleTapTimeoutRef.current) {
          clearTimeout(doubleTapTimeoutRef.current);
          doubleTapTimeoutRef.current = null;
        }

        // Double tap detected - open input modal
        setSelectedDate(dateId);
        setDepartureDate(dateId);
        setIsInputMode(true);
        setFlightCode(''); // User will enter full code or just number
        setFlightType('Depart');

        // Navigate to the month of the selected date
        const selectedDateObj = fromDateId(dateId);
        const selectedDateTime = DateTime.fromJSDate(selectedDateObj);
        const selectedMonth = getFirstDayOfMonth(selectedDateTime);
        setCurrentMonth((prevMonth) => {
          if (!selectedMonth.hasSame(prevMonth, 'month')) {
            return selectedMonth;
          }
          return prevMonth;
        });

        // Reset double tap detection
        lastTapRef.current = {dateId: null, timestamp: 0};
        return;
      }

      // Single tap - just select the date
      setSelectedDate(dateId);

      // Navigate to the month of the selected date
      const selectedDateObj = fromDateId(dateId);
      const selectedDateTime = DateTime.fromJSDate(selectedDateObj);
      const selectedMonth = getFirstDayOfMonth(selectedDateTime);
      setCurrentMonth((prevMonth) => {
        if (!selectedMonth.hasSame(prevMonth, 'month')) {
          return selectedMonth;
        }
        return prevMonth;
      });

      // Update last tap info
      lastTapRef.current = {dateId, timestamp: now};

      // Clear any existing timeout
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }

      // Set timeout to reset double tap detection after delay
      // Only update if component is still mounted
      doubleTapTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          lastTapRef.current = {dateId: null, timestamp: 0};
        }
        doubleTapTimeoutRef.current = null;
      }, DOUBLE_TAP_DELAY);
    },
    [isInputMode],
  );

  const handleCancelInput = () => {
    setIsInputMode(false);
    setDepartureDate(null);
    setFlightCode('');
    setFlightType('Depart');
    setSaveError(null);
    setIsSaving(false);
  };

  const handleCloseModal = () => {
    handleCancelInput();
  };

  const handleFlightCodeSubmit = async () => {
    if (!flightCode.trim() || !departureDate) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      // Convert dateId to ISO date string (YYYY-MM-DD)
      const dateObj = fromDateId(departureDate);
      const flightDate = DateTime.fromJSDate(dateObj).toISODate();

      if (!flightDate) {
        throw new Error('Invalid date format');
      }

      // Format flight code: if prefix exists and code doesn't contain space, add prefix
      let formattedFlightCode = flightCode.trim().toUpperCase();
      if (flightPrefix && !formattedFlightCode.includes(' ')) {
        // If it's just numbers, add prefix
        if (/^\d+$/.test(formattedFlightCode)) {
          formattedFlightCode = `${flightPrefix} ${formattedFlightCode}`;
        }
      }

      // Create roster with minimal required fields
      // User can edit details later
      const {error} = await createRoster({
        flight_code: formattedFlightCode,
        route: 'TBD', // To be determined - user can edit later
        destination: 'TBD', // To be determined - user can edit later
        flight_date: flightDate,
        departure_time: '00:00', // Default time - user can edit later
        arrival_time: '00:00', // Default time - user can edit later
        flight_type: flightType,
        status: 'Scheduled',
      });

      if (error) {
        setSaveError(error.message);
        Alert.alert('Error', error.message || 'Failed to save flight');
        return;
      }

      // Success - close modal and refresh rosters
      handleCancelInput();

      // Refresh rosters to show the new flight
      await fetchRosters();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save flight';
      setSaveError(errorMessage);
      Alert.alert('Error', errorMessage);
      console.error('[ScheduleScreen] Error saving flight:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviousMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, -1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  const handleToday = () => {
    const today = getFirstDayOfMonth(DateTime.now());
    setCurrentMonth(today);
    setSelectedDate(toDateId(DateTime.now().toJSDate()));
  };

  return (
    <SafeAreaView edges={[]} className="flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <ThemedView className="min-h-full px-6 py-6">
            {/* Calendar - Single Month View */}
            <ThemedView
              animated
              delay={0}
              className="rounded-3xl p-6 border-2 border-[#800020]/30 dark:border-[#A0002A]/40 bg-gradient-to-br from-[#800020]/10 to-[#A0002A]/5 dark:from-[#A0002A]/20 dark:to-[#800020]/10 shadow-lg mb-8">
              {/* Month Navigation */}
              <View className="flex-row items-center justify-between mb-6">
                <TouchableOpacity
                  onPress={handlePreviousMonth}
                  className="p-2 rounded-full bg-white dark:bg-gray-700 shadow-sm">
                  <Ionicons
                    name="chevron-back"
                    size={24}
                    color={colorScheme === 'dark' ? '#ECEDEE' : '#11181C'}
                  />
                </TouchableOpacity>

                <View className="flex-1 items-center">
                  <ThemedText className="text-xl font-bold">
                    {formatMonthYear(currentMonth)}
                  </ThemedText>
                  <TouchableOpacity onPress={handleToday} className="mt-1">
                    <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                      Today
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleNextMonth}
                  className="p-2 rounded-full bg-white dark:bg-gray-700 shadow-sm">
                  <Ionicons
                    name="chevron-forward"
                    size={24}
                    color={colorScheme === 'dark' ? '#ECEDEE' : '#11181C'}
                  />
                </TouchableOpacity>
              </View>

              {/* Single Month Calendar */}
              <Calendar
                calendarActiveDateRanges={[
                  ...calendarActiveDateRanges.filter((range) => {
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
                ]}
                calendarMonthId={toDateId(currentMonth.startOf('month').toJSDate())}
                onCalendarDayPress={handleDayPress}
                calendarDayHeight={50}
                calendarMonthHeaderHeight={0}
                calendarRowVerticalSpacing={12}
                calendarRowHorizontalSpacing={12}
                theme={calendarTheme}
              />
            </ThemedView>

            {/* Flight Code Input Modal */}
            <Modal
              visible={isInputMode && departureDate !== null}
              transparent
              animationType="slide"
              onRequestClose={handleCloseModal}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1">
                <View className="flex-1 bg-black/50 justify-end">
                  <ThemedView className="rounded-t-3xl p-6 pb-8">
                    <View className="flex-row items-center justify-between mb-6">
                      <View className="flex-1">
                        <ThemedText type="subtitle" className="text-xl font-semibold mb-1">
                          Add Flight
                        </ThemedText>
                        <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                          {departureDate
                            ? DateTime.fromISO(departureDate).toFormat('EEEE, MMMM d, yyyy')
                            : ''}
                        </ThemedText>
                      </View>
                      <TouchableOpacity onPress={handleCloseModal} className="p-2">
                        <Ionicons
                          name="close"
                          size={28}
                          color={colorScheme === 'dark' ? '#9BA1A6' : '#687076'}
                        />
                      </TouchableOpacity>
                    </View>

                    <View className="mb-6">
                      <ThemedInput
                        label="Flight Code"
                        placeholder={
                          flightPrefix ? `e.g., ${flightPrefix} 321 or full code` : 'e.g., SQ 321'
                        }
                        value={flightCode}
                        onChangeText={(text) => {
                          setFlightCode(text);
                          if (saveError) setSaveError(null);
                        }}
                        error={saveError || undefined}
                        autoCapitalize="characters"
                        autoFocus
                        onSubmitEditing={handleFlightCodeSubmit}
                        returnKeyType="done"
                        editable={!isSaving}
                      />
                      {flightPrefix && !flightCode.includes(' ') && (
                        <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Tip: Enter just the number (e.g., "321") and it will become "
                          {flightPrefix} 321"
                        </ThemedText>
                      )}
                      {saveError && (
                        <ThemedText className="text-red-600 dark:text-red-400 text-sm mt-2">
                          {saveError}
                        </ThemedText>
                      )}
                    </View>

                    {/* Flight Type Toggle */}
                    <View className="mb-6">
                      <ThemedText className="text-sm font-semibold mb-3">Flight Type</ThemedText>
                      <View className="flex-row gap-3">
                        <TouchableOpacity
                          onPress={() => setFlightType('Depart')}
                          disabled={isSaving}
                          className={`flex-1 py-3 px-4 rounded-xl border-2 ${
                            flightType === 'Depart'
                              ? 'border-[#800020] dark:border-[#A0002A] bg-[#800020]/10 dark:bg-[#A0002A]/20'
                              : 'border-gray-300 dark:border-gray-600 bg-transparent'
                          }`}>
                          <View className="flex-row items-center justify-center gap-2">
                            <Ionicons
                              name="airplane-outline"
                              size={20}
                              color={
                                flightType === 'Depart'
                                  ? themeColors.tint
                                  : colorScheme === 'dark'
                                    ? '#9BA1A6'
                                    : '#687076'
                              }
                            />
                            <ThemedText
                              className={`font-semibold ${
                                flightType === 'Depart' ? '' : 'text-gray-500 dark:text-gray-400'
                              }`}
                              style={
                                flightType === 'Depart' ? {color: themeColors.tint} : undefined
                              }>
                              Depart
                            </ThemedText>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setFlightType('Return')}
                          disabled={isSaving}
                          className={`flex-1 py-3 px-4 rounded-xl border-2 ${
                            flightType === 'Return'
                              ? 'border-[#800020] dark:border-[#A0002A] bg-[#800020]/10 dark:bg-[#A0002A]/20'
                              : 'border-gray-300 dark:border-gray-600 bg-transparent'
                          }`}>
                          <View className="flex-row items-center justify-center gap-2">
                            <Ionicons
                              name="airplane"
                              size={20}
                              color={
                                flightType === 'Return'
                                  ? themeColors.tint
                                  : colorScheme === 'dark'
                                    ? '#9BA1A6'
                                    : '#687076'
                              }
                            />
                            <ThemedText
                              className={`font-semibold ${
                                flightType === 'Return' ? '' : 'text-gray-500 dark:text-gray-400'
                              }`}
                              style={
                                flightType === 'Return' ? {color: themeColors.tint} : undefined
                              }>
                              Return
                            </ThemedText>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <ThemedButton
                          title="Cancel"
                          onPress={handleCloseModal}
                          variant="secondary"
                          fullWidth
                          disabled={isSaving}
                        />
                      </View>
                      <View className="flex-1">
                        <ThemedButton
                          title={isSaving ? 'Saving...' : 'Save'}
                          onPress={handleFlightCodeSubmit}
                          disabled={!flightCode.trim() || isSaving}
                          isLoading={isSaving}
                          fullWidth
                        />
                      </View>
                    </View>
                  </ThemedView>
                </View>
              </KeyboardAvoidingView>
            </Modal>

            {/* Selected Date Rosters - Show when not in input mode */}
            {selectedDate && !isInputMode && (
              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <ThemedText type="subtitle" className="text-lg font-semibold">
                    {selectedDateRosters.length > 0
                      ? `${selectedDateRosters.length} Flight${selectedDateRosters.length > 1 ? 's' : ''}`
                      : 'No Flights'}
                  </ThemedText>
                  <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                    {DateTime.fromISO(selectedDate).toFormat('EEEE, MMMM d, yyyy')}
                  </ThemedText>
                </View>

                {selectedDateRosters.length === 0 ? (
                  <ThemedView
                    animated
                    delay={0}
                    className="rounded-2xl p-6 border-2 border-[#800020]/20 dark:border-[#A0002A]/30 bg-[#800020]/5 dark:bg-[#A0002A]/10">
                    <View className="items-center">
                      <View className="flex-row items-center justify-center mb-2">
                        <Ionicons
                          name="airplane-outline"
                          size={40}
                          color={colorScheme === 'dark' ? '#A0002A' : '#800020'}
                        />
                        <CoffeeIcon size={32} color={themeColors.coffeeMedium} animated />
                      </View>
                      <ThemedText
                        animated
                        delay={100}
                        className="text-gray-500 dark:text-gray-400 text-sm text-center mt-4">
                        No flights scheduled for this date… maybe grab a ☕?
                      </ThemedText>
                    </View>
                  </ThemedView>
                ) : (
                  <View className="gap-3">
                    {selectedDateRosters.map((roster, index) => (
                      <ThemedView
                        key={roster.id}
                        animated
                        delay={index * 50}
                        className="rounded-xl p-4 border-2 border-[#800020]/30 dark:border-[#A0002A]/40 shadow-sm bg-[#800020]/5 dark:bg-[#A0002A]/10">
                        <View className="flex-row items-start justify-between mb-3">
                          <View className="flex-1">
                            <View className="flex-row items-center mb-2 flex-wrap gap-2">
                              <ThemedText
                                className="text-2xl font-bold"
                                style={{color: themeColors.tint}}>
                                {roster.flight_code}
                              </ThemedText>
                              <CoffeeIcon size={16} color={themeColors.coffeeMedium} animated />
                              <View
                                className="px-2 py-1 rounded-full"
                                style={{
                                  backgroundColor: themeColors.tint + '20',
                                }}>
                                <View className="flex-row items-center gap-1">
                                  <Ionicons
                                    name={
                                      roster.flight_type === 'Depart'
                                        ? 'airplane-outline'
                                        : 'airplane'
                                    }
                                    size={12}
                                    color={themeColors.tint}
                                  />
                                  <ThemedText
                                    className="text-xs font-semibold"
                                    style={{
                                      color: themeColors.tint,
                                    }}>
                                    {roster.flight_type}
                                  </ThemedText>
                                </View>
                              </View>
                              <View
                                className="px-2 py-1 rounded-full"
                                style={{
                                  backgroundColor:
                                    getStatusColor(roster.status, colorScheme ?? 'light') + '20',
                                }}>
                                <ThemedText
                                  className="text-xs font-semibold"
                                  style={{
                                    color: getStatusColor(roster.status, colorScheme ?? 'light'),
                                  }}>
                                  {roster.status}
                                </ThemedText>
                              </View>
                            </View>
                            <ThemedText className="text-base mb-1">{roster.route}</ThemedText>
                            {roster.aircraft_type && (
                              <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                                {roster.aircraft_type}
                              </ThemedText>
                            )}
                          </View>
                        </View>

                        <View className="flex-row justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                          <View className="flex-1">
                            <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Departure
                            </ThemedText>
                            <View className="flex-row items-center">
                              <Ionicons name="time-outline" size={14} color={themeColors.icon} />
                              <ThemedText className="text-sm font-semibold ml-1">
                                {roster.departure_time}
                              </ThemedText>
                            </View>
                            {roster.origin && (
                              <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {roster.origin}
                              </ThemedText>
                            )}
                          </View>

                          <View className="flex-1 items-end">
                            <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Arrival
                            </ThemedText>
                            <View className="flex-row items-center">
                              <Ionicons name="time-outline" size={14} color={themeColors.icon} />
                              <ThemedText className="text-sm font-semibold ml-1">
                                {roster.arrival_time}
                              </ThemedText>
                            </View>
                            <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {roster.destination}
                            </ThemedText>
                          </View>
                        </View>
                      </ThemedView>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Loading State */}
            {isLoading && rosters.length === 0 && (
              <ThemedView
                animated
                delay={0}
                className="rounded-2xl p-6 border-2 border-[#800020]/20 dark:border-[#A0002A]/30 bg-[#800020]/5 dark:bg-[#A0002A]/10">
                <ThemedLoader size="small" message="Loading your roster..." />
              </ThemedView>
            )}
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});
