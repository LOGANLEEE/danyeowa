import { Ionicons } from '@expo/vector-icons';
import { fromDateId } from '@marceloterreiro/flash-calendar';
import { router } from 'expo-router';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedLoader } from '@/components/ThemedLoader';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { FlightTypeToggle } from '@/components/ui/FlightTypeToggle';
import { Numpad } from '@/components/ui/Numpad';
import { RosterCalendar } from '@/components/ui/RosterCalendar';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { ThemedInput } from '@/components/ui/ThemedInput';
import { Colors } from '@/constants/theme';
import { useFlightPrefix, useRostersLoader } from '@/hooks/add-monthly.hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRostersStore } from '@/stores/use-rosters-store';
import {
  checkDateConflict,
  createFlightEntry,
  flightEntryToRoster,
  formatDateForDisplay,
  rostersToFlightEntries,
  validateFlightEntry,
  type FlightEntry,
} from '@/utils/add-monthly.utils';

// Helper function for month navigation
const getFirstDayOfMonth = (dateTime: DateTime): DateTime => {
  return dateTime.startOf('month');
};

export default function AddMonthlyScreen() {
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const {prefix, isLoading: isLoadingPrefix, updatePrefix} = useFlightPrefix();
  const {createMultipleRosters, fetchRosters} = useRostersStore();

  const now = DateTime.now();
  const [currentMonth, setCurrentMonth] = useState<DateTime>(getFirstDayOfMonth(now));
  const [flights, setFlights] = useState<FlightEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [numpadValue, setNumpadValue] = useState('');
  const [numpadTarget, setNumpadTarget] = useState<'flightNumber' | 'returnFlightNumber' | null>(
    null,
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);

  // Load rosters for current month
  const {rosters: monthRosters, isLoading: isLoadingRosters} = useRostersLoader(currentMonth);

  // Convert existing rosters to flight entries when month changes or rosters load
  useEffect(() => {
    if (monthRosters.length > 0 && flights.length === 0) {
      const entries = rostersToFlightEntries(monthRosters, prefix);
      setFlights(entries);
    }
  }, [monthRosters, prefix]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Get dates with flights for calendar (in ISO format for RosterCalendar)
  const calendarActiveDateRanges = useMemo(() => {
    const dateSet = new Set<string>();
    flights.forEach((flight) => {
      dateSet.add(flight.date);
      if (flight.returnDate) {
        dateSet.add(flight.returnDate);
      }
    });

    // RosterCalendar will convert ISO dates to dateId format internally
    return Array.from(dateSet).map((dateId) => ({
      startId: dateId, // ISO format (YYYY-MM-DD)
      endId: dateId,
    }));
  }, [flights]);

  // Check if date has flights (in ISO format for RosterCalendar)
  const dateHasFlights = useMemo(() => {
    const dateSet = new Set<string>();
    flights.forEach((flight) => {
      dateSet.add(flight.date);
    });
    return dateSet;
  }, [flights]);

  // Check if date has return flights
  const dateHasReturnFlights = useMemo(() => {
    const dateSet = new Set<string>();
    flights.forEach((flight) => {
      if (flight.returnDate) {
        dateSet.add(flight.returnDate);
      }
    });
    return dateSet;
  }, [flights]);

  // Get destinations for dates (for flags)
  const dateDestinations = useMemo(() => {
    const map = new Map<string, string[]>();
    flights.forEach((flight) => {
      // We don't have destination info in flight entries yet
      // This would need to be populated from rosters
    });
    return map;
  }, [flights]);

  // Update flight field
  const updateFlightField = <K extends keyof FlightEntry>(
    flightId: string,
    field: K,
    value: FlightEntry[K],
  ) => {
    setFlights(flights.map((f) => (f.id === flightId ? {...f, [field]: value} : f)));
  };

  // Handle return date selection
  const handleReturnDateSelect = useCallback(
    (date: string, flightId?: string) => {
      const flightIdToUse = flightId || editingFlightId;
      if (!flightIdToUse) return;

      const flight = flights.find((f) => f.id === flightIdToUse);
      if (!flight) return;

      const departDate = flight.date;
      const returnDateObj = DateTime.fromISO(date);
      const departDateObj = DateTime.fromISO(departDate);

      if (returnDateObj <= departDateObj) {
        Alert.alert('Invalid Date', 'Return date must be after depart date');
        return;
      }

      updateFlightField(flightIdToUse, 'returnDate', date);
      setSelectedDate(date);
    },
    [flights, editingFlightId],
  );

  // Handle day press (receives dateId, convert to ISO)
  const handleDayPress = useCallback(
    (dateId: string) => {
      const dateObj = fromDateId(dateId);
      const date = DateTime.fromJSDate(dateObj).toISODate();
      if (!date) return;

      // If editing a Depart flight, check if this date can be used as return date
      if (editingFlightId) {
        const currentFlight = flights.find((f) => f.id === editingFlightId);
        if (currentFlight && currentFlight.flightType === 'Depart' && !currentFlight.returnDate) {
          const departDate = DateTime.fromISO(currentFlight.date);
          const selectedDateObj = DateTime.fromISO(date);

          if (selectedDateObj > departDate) {
            // Set as return date
            handleReturnDateSelect(date, editingFlightId);
            return;
          }
        }
      }

      // Check if date already has a flight
      const existingFlight = flights.find((f) => f.date === date);
      if (existingFlight) {
        // Edit existing flight
        setSelectedDate(date);
        setEditingFlightId(existingFlight.id);
      } else {
        // Create new flight
        const conflict = checkDateConflict(flights, date);
        if (conflict.hasConflict) {
          Alert.alert('Date Conflict', conflict.error || 'Cannot add flight to this date');
          return;
        }

        const newFlight = createFlightEntry(date);
        setFlights([...flights, newFlight]);
        setSelectedDate(date);
        setEditingFlightId(newFlight.id);
      }
    },
    [flights, editingFlightId, handleReturnDateSelect],
  );

  // Handle month change
  const handleMonthChange = (month: DateTime) => {
    setCurrentMonth(month);
    setSelectedDate(null);
    setEditingFlightId(null);
  };

  // Handle add row
  const handleAddRow = () => {
    const today = DateTime.now().toISODate() || currentMonth.startOf('month').toISODate() || '';
    const conflict = checkDateConflict(flights, today);
    if (conflict.hasConflict) {
      // Find next available date
      let nextDate = DateTime.fromISO(today);
      for (let i = 0; i < 31; i++) {
        const checkDate = nextDate.plus({days: i}).toISODate() || '';
        const checkConflict = checkDateConflict(flights, checkDate);
        if (!checkConflict.hasConflict) {
          const newFlight = createFlightEntry(checkDate);
          setFlights([...flights, newFlight]);
          setSelectedDate(checkDate);
          setEditingFlightId(newFlight.id);
          return;
        }
      }
      Alert.alert('No Available Dates', 'All dates in this month are already used');
      return;
    }

    const newFlight = createFlightEntry(today);
    setFlights([...flights, newFlight]);
    setSelectedDate(today);
    setEditingFlightId(newFlight.id);
  };

  // Handle delete flight
  const handleDeleteFlight = (flightId: string) => {
    Alert.alert('Delete Flight', 'Are you sure you want to delete this flight?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setFlights(flights.filter((f) => f.id !== flightId));
          if (editingFlightId === flightId) {
            setEditingFlightId(null);
            setSelectedDate(null);
          }
        },
      },
    ]);
  };

  // Handle duplicate flight
  const handleDuplicateFlight = (flightId: string) => {
    const flight = flights.find((f) => f.id === flightId);
    if (!flight) return;

    const nextDate = DateTime.fromISO(flight.date).plus({days: 1}).toISODate();
    if (!nextDate) return;

    const conflict = checkDateConflict(flights, nextDate);
    if (conflict.hasConflict) {
      Alert.alert('Date Conflict', conflict.error || 'Cannot duplicate to this date');
      return;
    }

    const newFlight = createFlightEntry(nextDate, flight.flightNumber, flight.flightType);
    newFlight.departureTime = flight.departureTime;
    newFlight.arrivalTime = flight.arrivalTime;
    setFlights([...flights, newFlight]);
    setSelectedDate(nextDate);
    setEditingFlightId(newFlight.id);
  };

  // Handle save all flights
  const handleSaveAll = async () => {
    // Validate all flights
    const invalidFlights = flights.filter((f) => !validateFlightEntry(f).valid);
    if (invalidFlights.length > 0) {
      Alert.alert(
        'Validation Error',
        `Please fix ${invalidFlights.length} invalid flight${invalidFlights.length > 1 ? 's' : ''} before saving.`,
      );
      return;
    }

    if (flights.length === 0) {
      Alert.alert('No Flights', 'Please add at least one flight before saving.');
      return;
    }

    setIsSaving(true);

    try {
      // Convert all flights to rosters
      const allRosters: Array<{
        flight_code: string;
        route: string;
        destination: string;
        flight_date: string;
        departure_time: string;
        arrival_time: string;
        origin?: string | null;
        aircraft_type?: string | null;
        flight_type: 'Depart' | 'Return';
        status: 'Scheduled' | 'Confirmed' | 'Delayed' | 'Cancelled' | 'Completed';
      }> = [];

      flights.forEach((flight) => {
        const rosters = flightEntryToRoster(flight, prefix);
        allRosters.push(...rosters);
      });

      // Save all rosters
      const {error, successCount, failedCount} = await createMultipleRosters(allRosters);

      if (error && failedCount === allRosters.length) {
        Alert.alert('Error', error.message || 'Failed to save flights');
        return;
      }

      // Show success message
      if (successCount > 0) {
        Alert.alert(
          'Success',
          `Successfully saved ${successCount} flight${successCount > 1 ? 's' : ''}${
            failedCount > 0 ? ` (${failedCount} failed)` : ''
          }`,
          [
            {
              text: 'OK',
              onPress: async () => {
                // Refresh rosters
                await fetchRosters();
                // Navigate back
                router.back();
              },
            },
          ],
        );
      } else {
        Alert.alert('Error', 'Failed to save flights');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save flights';
      Alert.alert('Error', errorMessage);
      console.error('[AddMonthlyScreen] Error saving flights:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Get current editing flight
  const editingFlight = editingFlightId ? flights.find((f) => f.id === editingFlightId) : null;

  // Handle numpad
  const handleNumpadSubmit = () => {
    if (!editingFlight || !numpadTarget) return;

    if (numpadTarget === 'flightNumber') {
      updateFlightField(editingFlight.id, 'flightNumber', numpadValue);
    } else if (numpadTarget === 'returnFlightNumber') {
      updateFlightField(editingFlight.id, 'returnFlightNumber', numpadValue);
    }

    setShowNumpad(false);
    setNumpadValue('');
    setNumpadTarget(null);
  };

  const openNumpad = (target: 'flightNumber' | 'returnFlightNumber') => {
    if (!editingFlight) return;
    setNumpadTarget(target);
    setNumpadValue(
      target === 'flightNumber'
        ? editingFlight.flightNumber
        : editingFlight.returnFlightNumber || '',
    );
    setShowNumpad(true);
  };

  return (
    <SafeAreaView edges={[]} className="flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <ThemedView className="min-h-full px-6 py-6">
            {/* Header */}
            <View className="flex-row items-center justify-between mb-6">
              <TouchableOpacity onPress={() => router.back()} className="p-2">
                <Ionicons
                  name="arrow-back"
                  size={24}
                  color={colorScheme === 'dark' ? '#ECEDEE' : '#11181C'}
                />
              </TouchableOpacity>
              <ThemedText type="title" className="text-2xl font-bold">
                Add Monthly Flights
              </ThemedText>
              <View className="w-[40px]" />
            </View>

            {/* Prefix Input */}
            {!isLoadingPrefix && (
              <View className="mb-4">
                <ThemedInput
                  label="Airline Code Prefix"
                  placeholder="e.g., EK, SQ, CX"
                  value={prefix || ''}
                  onChangeText={async (text) => {
                    await updatePrefix(text);
                  }}
                  autoCapitalize="characters"
                  maxLength={3}
                />
                {prefix && (
                  <View className="flex-row items-center mt-2">
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={themeColors.tint}
                      style={{marginRight: 6}}
                    />
                    <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                      Prefix: {prefix} (will be prepended to flight numbers)
                    </ThemedText>
                  </View>
                )}
              </View>
            )}

            {/* Calendar */}
            <View className="mb-8">
              <RosterCalendar
                selectedDate={selectedDate} // ISO format (YYYY-MM-DD)
                onDayPress={handleDayPress}
                activeDateRanges={calendarActiveDateRanges}
                dateHasFlights={dateHasFlights}
                currentMonth={currentMonth}
                onMonthChange={handleMonthChange}
              />
            </View>

            {/* Flight Entries List */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-4">
                <ThemedText type="subtitle" className="text-lg font-semibold">
                  Flights ({flights.length})
                </ThemedText>
                <TouchableOpacity
                  onPress={handleAddRow}
                  className="flex-row items-center px-4 py-2 rounded-lg bg-[#800020]/10 dark:bg-[#A0002A]/20 border border-[#800020]/30 dark:border-[#A0002A]/40">
                  <Ionicons name="add" size={20} color={themeColors.tint} />
                  <ThemedText className="ml-2 font-semibold" style={{color: themeColors.tint}}>
                    Add Row
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {flights.length === 0 ? (
                <ThemedView
                  animated
                  delay={0}
                  className="rounded-2xl p-6 border-2 border-[#800020]/20 dark:border-[#A0002A]/30 bg-[#800020]/5 dark:bg-[#A0002A]/10">
                  <View className="items-center">
                    <Ionicons
                      name="airplane-outline"
                      size={40}
                      color={colorScheme === 'dark' ? '#A0002A' : '#800020'}
                    />
                    <ThemedText className="text-gray-500 dark:text-gray-400 text-sm text-center mt-4">
                      No flights added yet. Tap calendar dates or use "Add Row" to get started.
                    </ThemedText>
                  </View>
                </ThemedView>
              ) : (
                <View className="gap-3">
                  {flights.map((flight, index) => {
                    const isEditing = editingFlightId === flight.id;
                    return (
                      <ThemedView
                        key={flight.id}
                        animated
                        delay={index * 50}
                        className={`rounded-xl p-4 border-2 ${
                          isEditing
                            ? 'border-[#800020] dark:border-[#A0002A] bg-[#800020]/10 dark:bg-[#A0002A]/20'
                            : 'border-[#800020]/30 dark:border-[#A0002A]/40 bg-[#800020]/5 dark:bg-[#A0002A]/10'
                        } shadow-sm`}>
                        {/* Header */}
                        <View className="flex-row items-start justify-between mb-3">
                          <View className="flex-1">
                            <ThemedText className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">
                              {formatDateForDisplay(flight.date)}
                            </ThemedText>
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <ThemedText
                                className="text-xl font-bold"
                                style={{color: themeColors.tint}}>
                                {prefix ? `${prefix} ` : ''}
                                {flight.flightNumber || '___'}
                              </ThemedText>
                              <View
                                className="px-2 py-1 rounded-full"
                                style={{backgroundColor: themeColors.tint + '20'}}>
                                <ThemedText
                                  className="text-xs font-semibold"
                                  style={{color: themeColors.tint}}>
                                  {flight.flightType}
                                </ThemedText>
                              </View>
                            </View>
                          </View>
                          <View className="flex-row gap-2">
                            <TouchableOpacity
                              onPress={() => handleDuplicateFlight(flight.id)}
                              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                              <Ionicons
                                name="copy-outline"
                                size={18}
                                color={colorScheme === 'dark' ? '#9BA1A6' : '#687076'}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteFlight(flight.id)}
                              className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Editing Fields */}
                        {isEditing && (
                          <View className="gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            {/* Flight Number */}
                            <View>
                              <ThemedText className="text-sm font-semibold mb-2">
                                Flight Number
                              </ThemedText>
                              <TouchableOpacity
                                onPress={() => openNumpad('flightNumber')}
                                className="px-4 py-3 rounded-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600">
                                <ThemedText className="text-lg font-semibold">
                                  {flight.flightNumber || 'Tap to enter'}
                                </ThemedText>
                              </TouchableOpacity>
                            </View>

                            {/* Flight Type Toggle */}
                            <View>
                              <ThemedText className="text-sm font-semibold mb-2">
                                Flight Type
                              </ThemedText>
                              <FlightTypeToggle
                                value={flight.flightType}
                                onChange={(value) =>
                                  updateFlightField(flight.id, 'flightType', value)
                                }
                              />
                            </View>

                            {/* Times */}
                            <View className="flex-row gap-3">
                              <View className="flex-1">
                                <ThemedText className="text-sm font-semibold mb-2">
                                  Departure
                                </ThemedText>
                                <ThemedInput
                                  value={flight.departureTime}
                                  onChangeText={(text) =>
                                    updateFlightField(flight.id, 'departureTime', text)
                                  }
                                  placeholder="08:00"
                                  keyboardType="numeric"
                                />
                              </View>
                              <View className="flex-1">
                                <ThemedText className="text-sm font-semibold mb-2">
                                  Arrival
                                </ThemedText>
                                <ThemedInput
                                  value={flight.arrivalTime}
                                  onChangeText={(text) =>
                                    updateFlightField(flight.id, 'arrivalTime', text)
                                  }
                                  placeholder="14:00"
                                  keyboardType="numeric"
                                />
                              </View>
                            </View>

                            {/* Return Flight (only for Depart flights) */}
                            {flight.flightType === 'Depart' && (
                              <View className="mt-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                                <ThemedText className="text-sm font-semibold mb-2">
                                  Return Flight (Optional)
                                </ThemedText>
                                {flight.returnDate ? (
                                  <View className="gap-3">
                                    <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                                      Return Date: {formatDateForDisplay(flight.returnDate)}
                                    </ThemedText>
                                    <TouchableOpacity
                                      onPress={() => openNumpad('returnFlightNumber')}
                                      className="px-4 py-3 rounded-lg bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600">
                                      <ThemedText className="text-lg font-semibold">
                                        {flight.returnFlightNumber ||
                                          'Tap to enter return flight number'}
                                      </ThemedText>
                                    </TouchableOpacity>
                                    <View className="flex-row gap-3">
                                      <View className="flex-1">
                                        <ThemedText className="text-sm font-semibold mb-2">
                                          Return Departure
                                        </ThemedText>
                                        <ThemedInput
                                          value={flight.returnDepartureTime || '08:00'}
                                          onChangeText={(text) =>
                                            updateFlightField(
                                              flight.id,
                                              'returnDepartureTime',
                                              text,
                                            )
                                          }
                                          placeholder="08:00"
                                          keyboardType="numeric"
                                        />
                                      </View>
                                      <View className="flex-1">
                                        <ThemedText className="text-sm font-semibold mb-2">
                                          Return Arrival
                                        </ThemedText>
                                        <ThemedInput
                                          value={flight.returnArrivalTime || '14:00'}
                                          onChangeText={(text) =>
                                            updateFlightField(flight.id, 'returnArrivalTime', text)
                                          }
                                          placeholder="14:00"
                                          keyboardType="numeric"
                                        />
                                      </View>
                                    </View>
                                    <TouchableOpacity
                                      onPress={() => {
                                        updateFlightField(flight.id, 'returnDate', null);
                                        updateFlightField(flight.id, 'returnFlightNumber', null);
                                        updateFlightField(flight.id, 'returnDepartureTime', null);
                                        updateFlightField(flight.id, 'returnArrivalTime', null);
                                      }}
                                      className="self-start px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                                      <ThemedText className="text-sm font-semibold text-red-600 dark:text-red-400">
                                        Remove Return Flight
                                      </ThemedText>
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                    Tap a calendar date after the depart date to set return flight
                                  </ThemedText>
                                )}
                              </View>
                            )}
                          </View>
                        )}

                        {/* View Mode (not editing) */}
                        {!isEditing && (
                          <TouchableOpacity
                            onPress={() => {
                              setEditingFlightId(flight.id);
                              setSelectedDate(flight.date);
                            }}
                            className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <ThemedText
                              className="text-sm font-semibold text-center"
                              style={{color: themeColors.tint}}>
                              Tap to Edit
                            </ThemedText>
                          </TouchableOpacity>
                        )}
                      </ThemedView>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Save Button */}
            {flights.length > 0 && (
              <View className="mb-6">
                <ThemedButton
                  title={
                    isSaving
                      ? 'Saving...'
                      : `Save ${flights.length} Flight${flights.length > 1 ? 's' : ''}`
                  }
                  onPress={handleSaveAll}
                  disabled={isSaving}
                  isLoading={isSaving}
                  fullWidth
                />
              </View>
            )}

            {/* Loading State */}
            {(isLoadingPrefix || isLoadingRosters) && flights.length === 0 && (
              <ThemedView
                animated
                delay={0}
                className="rounded-2xl p-6 border-2 border-[#800020]/20 dark:border-[#A0002A]/30 bg-[#800020]/5 dark:bg-[#A0002A]/10">
                <ThemedLoader size="small" message="Loading..." />
              </ThemedView>
            )}
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Numpad Modal */}
      {showNumpad && (
        <View className="absolute inset-0 bg-black/50 justify-end">
          <ThemedView className="rounded-t-3xl p-6 pb-8">
            <View className="flex-row items-center justify-between mb-4">
              <ThemedText type="subtitle" className="text-xl font-semibold">
                Enter Flight Number
              </ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setShowNumpad(false);
                  setNumpadValue('');
                  setNumpadTarget(null);
                }}
                className="p-2">
                <Ionicons
                  name="close"
                  size={28}
                  color={colorScheme === 'dark' ? '#9BA1A6' : '#687076'}
                />
              </TouchableOpacity>
            </View>
            <Numpad value={numpadValue} onChange={setNumpadValue} maxLength={10} />
            <View className="mt-4">
              <ThemedButton
                title="Done"
                onPress={handleNumpadSubmit}
                disabled={!numpadValue.trim()}
                fullWidth
              />
            </View>
          </ThemedView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});
