import { CoffeeIcon } from '@/components/CoffeeIcon';
import { ThemedHeader } from '@/components/ThemedHeader';
import { ThemedLoader } from '@/components/ThemedLoader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlightTypeToggle } from '@/components/ui/FlightTypeToggle';
import { ModalContainer } from '@/components/ui/ModalContainer';
import { RosterCalendar } from '@/components/ui/RosterCalendar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getFlightCodePrefix } from '@/lib/secure-storage';
import { useRostersStore } from '@/stores/use-rosters-store';
import { Ionicons } from '@expo/vector-icons';
import { fromDateId, toDateId } from '@marceloterreiro/flash-calendar';
import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, TouchableOpacity, View } from 'react-native';

// Helper function for month navigation
const getFirstDayOfMonth = (dateTime: DateTime): DateTime => {
  return dateTime.startOf('month');
};

function AddMonthlyButton() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel="Add monthly roster"
      testID="add-monthly-button"
      onPress={() => router.push('/schedule/add-monthly')}
      className="mr-4 p-2 rounded-full bg-[#800020]/10 dark:bg-[#A0002A]/20 border border-[#800020]/30 dark:border-[#A0002A]/40"
      activeOpacity={0.7}>
      <Ionicons
        name="add-circle-outline"
        size={24}
        color={themeColors.tint}
        testID="add-monthly-icon"
        accessibilityElementsHidden={false}
        accessibilityLabel="Add monthly roster"
        importantForAccessibility="yes"
      />
    </TouchableOpacity>
  );
}

export default function ScheduleScreen() {
  const colorScheme = useColorScheme();
  const {rosters, isLoading, fetchRosters, createRoster} = useRostersStore();
  const now = DateTime.now();
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateId(now.toJSDate()));
  const [currentMonth, setCurrentMonth] = useState<DateTime>(getFirstDayOfMonth(now));

  // Convert selectedDate (dateId) to ISO format for dateHasFlights comparison
  const selectedDateISO = useMemo(() => {
    if (!selectedDate) return null;
    try {
      const dateObj = fromDateId(selectedDate);
      return DateTime.fromJSDate(dateObj).toISODate();
    } catch {
      return null;
    }
  }, [selectedDate]);
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
    if (!selectedDateISO) return [];
    return rosters.filter((roster) => roster.flight_date === selectedDateISO);
  }, [rosters, selectedDateISO]);

  // Get all dates with rosters for calendar active ranges (in dateId format)
  const calendarActiveDateRanges = useMemo(() => {
    const dateSet = new Set<string>();
    rosters.forEach((roster) => {
      dateSet.add(roster.flight_date);
    });

    return Array.from(dateSet).map((dateId) => {
      // Convert ISO date to dateId format
      try {
        const date = DateTime.fromISO(dateId);
        if (date.isValid) {
          const dateIdFormatted = toDateId(date.toJSDate());
          return {
            startId: dateIdFormatted,
            endId: dateIdFormatted,
          };
        }
      } catch {
        // If already in dateId format, use as-is
        return {
          startId: dateId,
          endId: dateId,
        };
      }
      return {
        startId: dateId,
        endId: dateId,
      };
    });
  }, [rosters]);

  // Check if a date has flights (in ISO format for RosterCalendar)
  const dateHasFlights = useMemo(() => {
    const dateSet = new Set<string>();
    rosters.forEach((roster) => {
      dateSet.add(roster.flight_date);
    });
    return dateSet;
  }, [rosters]);

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
        setCurrentMonth(selectedMonth);

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
      setCurrentMonth(selectedMonth);

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

  const handleMonthChange = (month: DateTime) => {
    setCurrentMonth(month);
  };

  return (
    <ScreenContainer
      edges={[]}
      scrollable={false}
      enableKeyboardAvoiding={true}
      keyboardBehavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView className="flex-1 px-6 py-6 pt-10">
        <ThemedHeader title="Schedule" right={<AddMonthlyButton />} />
        {/* Calendar - Single Month View */}
        <View className="mb-8">
          <RosterCalendar
            selectedDate={selectedDate}
            onDayPress={handleDayPress}
            activeDateRanges={calendarActiveDateRanges}
            dateHasFlights={dateHasFlights}
            rosters={rosters}
            currentMonth={currentMonth}
            onMonthChange={handleMonthChange}
          />
        </View>

        {/* Flight Code Input Modal */}
        <ModalContainer
          visible={isInputMode && departureDate !== null}
          onClose={handleCloseModal}
          title="Add Flight"
          subtitle={
            departureDate
              ? (() => {
                  try {
                    const dateObj = fromDateId(departureDate);
                    return DateTime.fromJSDate(dateObj).toFormat('EEEE, MMMM d, yyyy');
                  } catch {
                    return DateTime.fromISO(departureDate).toFormat('EEEE, MMMM d, yyyy');
                  }
                })()
              : undefined
          }>
          <View className="mb-6">
            <ThemedInput
              label="Flight Code"
              placeholder={flightPrefix ? `e.g., ${flightPrefix} 321 or full code` : 'e.g., SQ 321'}
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
                Tip: Enter just the number (e.g., "321") and it will become "{flightPrefix} 321"
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
            <FlightTypeToggle value={flightType} onChange={setFlightType} disabled={isSaving} />
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
        </ModalContainer>

        {/* Selected Date Rosters - Show when not in input mode */}
        {selectedDate && !isInputMode && (
          <View className="mb-6">
            <SectionHeader
              title={
                selectedDateRosters.length > 0
                  ? `${selectedDateRosters.length} Flight${
                      selectedDateRosters.length > 1 ? 's' : ''
                    }`
                  : 'No Flights'
              }
              subtitle={
                selectedDateISO
                  ? DateTime.fromISO(selectedDateISO).toFormat('EEEE, MMMM d, yyyy')
                  : undefined
              }
            />

            {selectedDateRosters.length === 0 ? (
              <EmptyState
                icon="airplane-outline"
                iconSize={40}
                message="No flights scheduled for this date… maybe grab a ☕?"
              />
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
                          <CoffeeIcon size={16} color={themeColors.tint} animated />
                          <View
                            className="px-2 py-1 rounded-full"
                            style={{
                              backgroundColor: themeColors.tint + '20',
                            }}>
                            <View className="flex-row items-center gap-1">
                              <Ionicons
                                name={
                                  roster.flight_type === 'Depart' ? 'airplane-outline' : 'airplane'
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
                          <StatusBadge status={roster.status} />
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
    </ScreenContainer>
  );
}
