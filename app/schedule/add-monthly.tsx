import { fromDateId } from '@marceloterreiro/flash-calendar';
import { router } from 'expo-router';
import { DateTime } from 'luxon';
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { FlightCard } from '@/components/add-monthly/FlightCard';
import { ThemedLoader } from '@/components/ThemedLoader';
import { ThemedView } from '@/components/ThemedView';
import { EmptyState } from '@/components/ui/EmptyState';
import { RosterCalendar } from '@/components/ui/RosterCalendar';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ThemedButton } from '@/components/ui/ThemedButton';
import { Colors } from '@/constants/theme';
import { useFlightPrefix, useRostersLoader } from '@/hooks/add-monthly.hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFlightsManager } from '@/hooks/use-flights-manager';

/**
 * Helper function to get the first day of a month
 */
const getFirstDayOfMonth = (dateTime: DateTime): DateTime => {
  return dateTime.startOf('month');
};

/**
 * Add Monthly Screen - Simplified version
 *
 * This screen allows users to add multiple flight entries for a month.
 *
 * Main sections:
 * 1. Calendar - Select dates to add flights
 * 2. Flight List - View and edit flight entries
 * 3. Save Button - Save all flights to database
 *
 * State management is handled by custom hooks:
 * - useFlightsManager: Manages flight entries, CRUD operations
 */
export default function AddMonthlyScreen() {
  // ===== Theme & UI Setup =====
  const colorScheme = useColorScheme();
  const themeColors = Colors[colorScheme ?? 'light'];
  const scrollViewRef = useRef<ScrollView>(null);

  // ===== Data Loading =====
  const {prefix, isLoading: isLoadingPrefix} = useFlightPrefix();
  const now = DateTime.now();
  const [currentMonth, setCurrentMonth] = useState<DateTime>(getFirstDayOfMonth(now));
  const {rosters: monthRosters, isLoading: isLoadingRosters} = useRostersLoader(currentMonth);

  // ===== Flight Management =====
  // All flight-related state and operations are handled by this hook
  // Note: One date = one flight (users add flights by tapping calendar dates)
  const {
    flights,
    selectedDate,
    editingFlightId,
    updateFlightField,
    handleDayPress: handleDayPressFromManager,
    handleDeleteFlight,
    handleDuplicateFlight,
    handleSaveAll: handleSaveAllFromManager,
    setEditingFlightId,
    setSelectedDate,
    resetForMonth,
  } = useFlightsManager(monthRosters, prefix, currentMonth);

  // ===== Local State =====
  const [isSaving, setIsSaving] = useState(false);

  // ===== Effects =====
  // Reset editing state when month changes
  useEffect(() => {
    resetForMonth();
  }, [currentMonth, resetForMonth]);

  // ===== Event Handlers =====

  /**
   * Convert calendar dateId format to ISO date format
   * The calendar uses dateId, but our flight manager uses ISO dates
   */
  const handleDayPress = useCallback(
    (dateId: string) => {
      const dateObj = fromDateId(dateId);
      const date = DateTime.fromJSDate(dateObj).toISODate();
      if (!date) return;
      handleDayPressFromManager(date);
    },
    [handleDayPressFromManager],
  );

  /**
   * Handle month navigation
   */
  const handleMonthChange = useCallback((month: DateTime) => {
    setCurrentMonth(month);
  }, []);

  /**
   * Save all flights with loading state management
   */
  const handleSaveAll = useCallback(async () => {
    setIsSaving(true);
    try {
      const result = await handleSaveAllFromManager();
      if (result?.success) {
        router.back();
      }
    } catch (error) {
      console.error('[AddMonthlyScreen] Error saving flights:', error);
    } finally {
      setIsSaving(false);
    }
  }, [handleSaveAllFromManager]);

  // ===== Computed Values =====

  /**
   * Get date ranges for calendar highlighting
   * Shows which dates have flights (depart or return)
   */
  const calendarActiveDateRanges = useMemo(() => {
    const dateSet = new Set<string>();
    flights.forEach((flight) => {
      dateSet.add(flight.date);
      if (flight.returnDate) {
        dateSet.add(flight.returnDate);
      }
    });
    return Array.from(dateSet).map((dateId) => ({
      startId: dateId,
      endId: dateId,
    }));
  }, [flights]);

  /**
   * Set of dates that have depart flights (for calendar highlighting)
   */
  const dateHasFlights = useMemo(() => {
    const dateSet = new Set<string>();
    flights.forEach((flight) => {
      dateSet.add(flight.date);
    });
    return dateSet;
  }, [flights]);

  /**
   * Find flight for selected date (one date = one flight)
   */
  const selectedFlight = useMemo(() => {
    if (!selectedDate) return null;
    return flights.find((flight) => flight.date === selectedDate) ?? null;
  }, [flights, selectedDate]);

  return (
    <ScreenContainer
      edges={[]}
      keyboardBehavior={Platform.OS === 'ios' ? 'padding' : undefined}
      scrollViewRef={scrollViewRef as RefObject<ScrollView>}
      contentContainerStyle={styles.scrollContent}>
      <ThemedView className="min-h-full px-6 py-6">
        {/* Calendar */}
        <View className="mb-8">
          <RosterCalendar
            selectedDate={selectedDate} // ISO format (YYYY-MM-DD)
            onDayPress={handleDayPress}
            activeDateRanges={calendarActiveDateRanges}
            dateHasFlights={dateHasFlights}
            rosters={monthRosters}
            currentMonth={currentMonth}
            onMonthChange={handleMonthChange}
          />
        </View>

        {/* Flight Entries List */}
        <View className="mb-6">
          <SectionHeader title={`Flights (${selectedFlight ? 1 : 0})`} />
          {!selectedFlight ? (
            <EmptyState
              icon="airplane-outline"
              iconSize={40}
              message="No flights added yet. Tap calendar dates to add flights."
            />
          ) : (
            <FlightCard
              key={selectedFlight.id}
              flight={selectedFlight}
              index={0}
              isEditing={editingFlightId === selectedFlight.id}
              prefix={prefix}
              onEdit={() => {
                setEditingFlightId(selectedFlight.id);
                setSelectedDate(selectedFlight.date);
              }}
              onDelete={() => handleDeleteFlight(selectedFlight.id)}
              onDuplicate={() => handleDuplicateFlight(selectedFlight.id)}
              onUpdateField={(field, value) =>
                updateFlightField(selectedFlight.id, field, value)
              }
            />
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});
