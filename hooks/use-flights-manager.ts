import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { useRostersStore } from '@/stores/use-rosters-store';
import {
  checkDateConflict,
  createFlightEntry,
  flightEntryToRoster,
  rostersToFlightEntries,
  validateFlightEntry,
  type FlightEntry,
} from '@/utils/add-monthly.utils';

/**
 * Hook to manage flight entries state and operations
 */
export function useFlightsManager(
  monthRosters: any[],
  prefix: string | null,
  currentMonth: DateTime
) {
  const [flights, setFlights] = useState<FlightEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const { createMultipleRosters, fetchRosters } = useRostersStore();

  // Load existing rosters as flight entries when month changes
  useEffect(() => {
    if (monthRosters.length > 0 && flights.length === 0) {
      const entries = rostersToFlightEntries(monthRosters, prefix);
      setFlights(entries);
    }
  }, [monthRosters, prefix]);

  // Update a specific field of a flight
  const updateFlightField = useCallback(
    <K extends keyof FlightEntry>(flightId: string, field: K, value: FlightEntry[K]) => {
      setFlights((prev) => prev.map((f) => (f.id === flightId ? { ...f, [field]: value } : f)));
    },
    []
  );

  // Handle day press from calendar (receives ISO date string)
  const handleDayPress = useCallback(
    (date: string) => {
      // Validate ISO date format
      const dateObj = DateTime.fromISO(date);
      if (!dateObj.isValid) return;

      // If editing a Depart flight, check if this can be a return date
      if (editingFlightId) {
        const currentFlight = flights.find((f) => f.id === editingFlightId);
        if (currentFlight && currentFlight.flightType === 'Depart' && !currentFlight.returnDate) {
          const departDate = DateTime.fromISO(currentFlight.date);
          const selectedDateObj = DateTime.fromISO(date);

          if (selectedDateObj > departDate) {
            // Set as return date
            updateFlightField(editingFlightId, 'returnDate', date);
            setSelectedDate(date);
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
        setFlights((prev) => [...prev, newFlight]);
        setSelectedDate(date);
        setEditingFlightId(newFlight.id);
      }
    },
    [flights, editingFlightId, updateFlightField]
  );

  // Handle return date selection
  const handleReturnDateSelect = useCallback(
    (date: string, flightId?: string) => {
      const flightIdToUse = flightId || editingFlightId;
      if (!flightIdToUse) return;

      const flight = flights.find((f) => f.id === flightIdToUse);
      if (!flight) return;

      const departDate = DateTime.fromISO(flight.date);
      const returnDateObj = DateTime.fromISO(date);

      if (returnDateObj <= departDate) {
        Alert.alert('Invalid Date', 'Return date must be after depart date');
        return;
      }

      updateFlightField(flightIdToUse, 'returnDate', date);
      setSelectedDate(date);
    },
    [flights, editingFlightId, updateFlightField]
  );

  // Delete a flight
  const handleDeleteFlight = useCallback(
    (flightId: string) => {
      Alert.alert('Delete Flight', 'Are you sure you want to delete this flight?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setFlights((prev) => prev.filter((f) => f.id !== flightId));
            if (editingFlightId === flightId) {
              setEditingFlightId(null);
              setSelectedDate(null);
            }
          },
        },
      ]);
    },
    [editingFlightId]
  );

  // Duplicate a flight
  const handleDuplicateFlight = useCallback(
    (flightId: string) => {
      const flight = flights.find((f) => f.id === flightId);
      if (!flight) return;

      const nextDate = DateTime.fromISO(flight.date).plus({ days: 1 }).toISODate();
      if (!nextDate) return;

      const conflict = checkDateConflict(flights, nextDate);
      if (conflict.hasConflict) {
        Alert.alert('Date Conflict', conflict.error || 'Cannot duplicate to this date');
        return;
      }

      const newFlight = createFlightEntry(nextDate, flight.flightNumber, flight.flightType);
      newFlight.departureTime = flight.departureTime;
      newFlight.arrivalTime = flight.arrivalTime;
      setFlights((prev) => [...prev, newFlight]);
      setSelectedDate(nextDate);
      setEditingFlightId(newFlight.id);
    },
    [flights]
  );

  // Save all flights
  const handleSaveAll = useCallback(async () => {
    // Validate all flights
    const invalidFlights = flights.filter((f) => !validateFlightEntry(f).valid);
    if (invalidFlights.length > 0) {
      Alert.alert(
        'Validation Error',
        `Please fix ${invalidFlights.length} invalid flight${invalidFlights.length > 1 ? 's' : ''} before saving.`
      );
      return { success: false };
    }

    if (flights.length === 0) {
      Alert.alert('No Flights', 'Please add at least one flight before saving.');
      return { success: false };
    }

    // Convert all flights to rosters
    const allRosters = flights.flatMap((flight) => flightEntryToRoster(flight, prefix));

    // Save all rosters
    const { error, successCount, failedCount } = await createMultipleRosters(allRosters);

    if (error && failedCount === allRosters.length) {
      Alert.alert('Error', error.message || 'Failed to save flights');
      return { success: false };
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
              await fetchRosters();
            },
          },
        ]
      );
      return { success: true };
    } else {
      Alert.alert('Error', 'Failed to save flights');
      return { success: false };
    }
  }, [flights, prefix, createMultipleRosters, fetchRosters]);

  // Reset state when month changes
  const resetForMonth = useCallback(() => {
    setSelectedDate(null);
    setEditingFlightId(null);
  }, []);

  return {
    flights,
    selectedDate,
    editingFlightId,
    updateFlightField,
    handleDayPress,
    handleReturnDateSelect,
    handleDeleteFlight,
    handleDuplicateFlight,
    handleSaveAll,
    setEditingFlightId,
    setSelectedDate,
    resetForMonth,
  };
}

