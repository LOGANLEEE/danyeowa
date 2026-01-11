import { AnimatedWelcomeBackground } from '@/components/AnimatedWelcomeBackground';
import { CoffeeIcon } from '@/components/CoffeeIcon';
import { ThemedLoader } from '@/components/ThemedLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlightTypeToggle } from '@/components/ui/FlightTypeToggle';
import { RosterCalendar } from '@/components/ui/RosterCalendar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { getFlightCodePrefix } from '@/lib/secure-storage';
import { useRostersStore } from '@/stores/use-rosters-store';
import { Ionicons } from '@expo/vector-icons';
import { fromDateId, toDateId } from '@marceloterreiro/flash-calendar';
import { router } from 'expo-router';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  Dialog,
  IconButton,
  PaperProvider,
  Portal,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';

// Helper function for month navigation
const getFirstDayOfMonth = (dateTime: DateTime): DateTime => {
  return dateTime.startOf('month');
};

export default function ScheduleScreen() {
  const theme = useTheme();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleAddMonthlyRoster = useCallback(() => {
    // Only navigate if not in input mode and no departure date is set
    router.push({
      pathname: '/schedule/add-roster',
      params: {targetMonth: currentMonth.toISO()},
    });
  }, [currentMonth]);

  return (
    <PaperProvider>
      <ScreenContainer
        edges={[]}
        scrollable
        enableKeyboardAvoiding={true}
        keyboardShouldPersistTaps="handled"
        keyboardBehavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* todo animated weather */}
        <AnimatedWelcomeBackground />
        <View style={[styles.container]}>
          {/* Calendar - Single Month View */}
          <View style={styles.calendarContainer}>
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
          <Portal>
            <Dialog
              visible={isInputMode && departureDate !== null}
              onDismiss={handleCloseModal}
              style={styles.dialog}>
              <Dialog.Title>
                <View style={styles.dialogTitleContainer}>
                  <View style={styles.dialogTitleContent}>
                    <Text variant="titleLarge">Edit Flight</Text>
                    {departureDate && (
                      <Text
                        variant="bodyMedium"
                        style={[styles.dialogSubtitle, {color: theme.colors.onSurfaceVariant}]}>
                        {(() => {
                          try {
                            const dateObj = fromDateId(departureDate);
                            return DateTime.fromJSDate(dateObj).toFormat('EEEE, MMMM d, yyyy');
                          } catch {
                            return DateTime.fromISO(departureDate).toFormat('EEEE, MMMM d, yyyy');
                          }
                        })()}
                      </Text>
                    )}
                  </View>
                  <IconButton
                    icon="close"
                    size={24}
                    iconColor={theme.colors.onSurfaceVariant}
                    onPress={handleCloseModal}
                  />
                </View>
              </Dialog.Title>
              <Dialog.Content>
                <View style={styles.inputContainer}>
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
                    <Text
                      variant="bodySmall"
                      style={[styles.tipText, {color: theme.colors.onSurfaceVariant}]}>
                      Tip: Enter just the number (e.g., "321") and it will become "{flightPrefix}{' '}
                      321"
                    </Text>
                  )}
                  {saveError && (
                    <Text
                      variant="bodySmall"
                      style={[styles.errorText, {color: theme.colors.error}]}>
                      {saveError}
                    </Text>
                  )}
                </View>

                {/* Flight Type Toggle */}
                <View style={styles.toggleContainer}>
                  <Text
                    variant="labelLarge"
                    style={[styles.toggleLabel, {color: theme.colors.onSurface}]}>
                    Flight Type
                  </Text>
                  <FlightTypeToggle
                    value={flightType}
                    onChange={setFlightType}
                    disabled={isSaving}
                  />
                </View>
              </Dialog.Content>
              <Dialog.Actions>
                <View style={styles.buttonRow}>
                  <View style={styles.buttonWrapper}>
                    <ThemedButton
                      title="Cancel"
                      onPress={handleCloseModal}
                      variant="secondary"
                      fullWidth
                      disabled={isSaving}
                    />
                  </View>
                  <View style={styles.buttonWrapper}>
                    <ThemedButton
                      title={isSaving ? 'Saving...' : 'Save'}
                      onPress={handleFlightCodeSubmit}
                      disabled={!flightCode.trim() || isSaving}
                      isLoading={isSaving}
                      fullWidth
                    />
                  </View>
                </View>
              </Dialog.Actions>
            </Dialog>
          </Portal>

          {/* Selected Date Rosters - Show when not in input mode */}
          {selectedDate && !isInputMode && (
            <View style={styles.rostersContainer}>
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
                <View style={styles.rostersList}>
                  {selectedDateRosters.map((roster, index) => (
                    <Surface
                      key={roster.id}
                      style={[
                        styles.rosterCard,
                        index < selectedDateRosters.length - 1 && styles.rosterCardSpacing,
                        {
                          backgroundColor: theme.dark ? '#A0002A10' : '#80002005',
                          borderColor: theme.dark ? '#A0002A40' : '#80002030',
                        },
                      ]}
                      elevation={1}>
                      <View style={styles.rosterHeader}>
                        <View style={styles.rosterHeaderContent}>
                          <View style={styles.flightCodeRow}>
                            <Text
                              variant="headlineSmall"
                              style={[styles.flightCode, {color: theme.colors.primary}]}>
                              {roster.flight_code}
                            </Text>
                            <View style={styles.iconSpacer}>
                              <CoffeeIcon size={16} color={theme.colors.primary} animated />
                            </View>
                            <Surface
                              style={[
                                styles.flightTypeBadge,
                                {backgroundColor: `${theme.colors.primary}20`},
                              ]}
                              elevation={0}>
                              <View style={styles.flightTypeContent}>
                                <Ionicons
                                  name={
                                    roster.flight_type === 'Depart'
                                      ? 'airplane-outline'
                                      : 'airplane'
                                  }
                                  size={12}
                                  color={theme.colors.primary}
                                />
                                <Text
                                  variant="labelSmall"
                                  style={[styles.flightTypeText, {color: theme.colors.primary}]}>
                                  {roster.flight_type}
                                </Text>
                              </View>
                            </Surface>
                            <View style={styles.badgeSpacer}>
                              <StatusBadge status={roster.status} />
                            </View>
                          </View>
                          <Text
                            variant="bodyLarge"
                            style={[styles.routeText, {color: theme.colors.onSurface}]}>
                            {roster.route}
                          </Text>
                          {roster.aircraft_type && (
                            <Text
                              variant="bodySmall"
                              style={[styles.aircraftText, {color: theme.colors.onSurfaceVariant}]}>
                              {roster.aircraft_type}
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={[styles.rosterFooter, {borderTopColor: theme.colors.outline}]}>
                        <View style={styles.timeSection}>
                          <Text
                            variant="bodySmall"
                            style={[styles.timeLabel, {color: theme.colors.onSurfaceVariant}]}>
                            Departure
                          </Text>
                          <View style={styles.timeRow}>
                            <Ionicons
                              name="time-outline"
                              size={14}
                              color={theme.colors.onSurfaceVariant}
                            />
                            <Text
                              variant="bodyMedium"
                              style={[styles.timeValue, {color: theme.colors.onSurface}]}>
                              {roster.departure_time}
                            </Text>
                          </View>
                          {roster.origin && (
                            <Text
                              variant="bodySmall"
                              style={[styles.locationText, {color: theme.colors.onSurfaceVariant}]}>
                              {roster.origin}
                            </Text>
                          )}
                        </View>

                        <View style={[styles.timeSection, styles.timeSectionRight]}>
                          <Text
                            variant="bodySmall"
                            style={[styles.timeLabel, {color: theme.colors.onSurfaceVariant}]}>
                            Arrival
                          </Text>
                          <View style={styles.timeRow}>
                            <Ionicons
                              name="time-outline"
                              size={14}
                              color={theme.colors.onSurfaceVariant}
                            />
                            <Text
                              variant="bodyMedium"
                              style={[styles.timeValue, {color: theme.colors.onSurface}]}>
                              {roster.arrival_time}
                            </Text>
                          </View>
                          <Text
                            variant="bodySmall"
                            style={[styles.locationText, {color: theme.colors.onSurfaceVariant}]}>
                            {roster.destination}
                          </Text>
                        </View>
                      </View>
                    </Surface>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Loading State */}
          {isLoading && rosters.length === 0 && (
            <Surface
              style={[
                styles.loadingCard,
                {
                  backgroundColor: theme.dark ? '#A0002A10' : '#80002005',
                  borderColor: theme.dark ? '#A0002A30' : '#80002020',
                },
              ]}
              elevation={1}>
              <ThemedLoader size="small" message="Loading your roster..." />
            </Surface>
          )}
          <TouchableOpacity
            accessible
            accessibilityRole="button"
            accessibilityLabel="Add monthly roster"
            testID="add-monthly-button"
            onPress={handleAddMonthlyRoster}
            style={[
              styles.addMonthlyButton,
              {
                backgroundColor: theme.dark ? '#A0002A20' : '#80002010',
                borderColor: theme.dark ? '#A0002A40' : '#80002030',
              },
            ]}
            activeOpacity={0.7}>
            <Ionicons
              name="add-circle-outline"
              size={24}
              color={theme.colors.primary}
              testID="add-monthly-icon"
              accessibilityElementsHidden={false}
              accessibilityLabel="Add monthly roster"
              importantForAccessibility="yes"
            />
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  calendarContainer: {
    marginBottom: 32,
  },
  addMonthlyButton: {
    marginRight: 16,
    padding: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  dialog: {
    borderRadius: 24,
  },
  dialogTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dialogTitleContent: {
    flex: 1,
  },
  dialogSubtitle: {
    marginTop: 4,
    fontSize: 14,
  },
  inputContainer: {
    marginBottom: 24,
  },
  tipText: {
    marginTop: 8,
  },
  errorText: {
    marginTop: 8,
  },
  toggleContainer: {
    marginBottom: 24,
  },
  toggleLabel: {
    marginBottom: 12,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonWrapper: {
    flex: 1,
    marginHorizontal: 6,
  },
  rostersContainer: {
    marginBottom: 24,
  },
  rostersList: {
    // Gap handled by marginBottom on children
  },
  rosterCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
  },
  rosterCardSpacing: {
    marginBottom: 12,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rosterHeaderContent: {
    flex: 1,
  },
  flightCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  flightCode: {
    fontWeight: 'bold',
    marginRight: 8,
  },
  iconSpacer: {
    marginRight: 8,
  },
  flightTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 8,
  },
  flightTypeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flightTypeText: {
    marginLeft: 4,
    fontWeight: '600',
  },
  badgeSpacer: {
    marginRight: 8,
  },
  routeText: {
    marginBottom: 4,
  },
  aircraftText: {
    // Styled via inline style
  },
  rosterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  timeSection: {
    flex: 1,
  },
  timeSectionRight: {
    alignItems: 'flex-end',
  },
  timeLabel: {
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeValue: {
    marginLeft: 4,
    fontWeight: '600',
  },
  locationText: {
    marginTop: 4,
  },
  loadingCard: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
  },
});
