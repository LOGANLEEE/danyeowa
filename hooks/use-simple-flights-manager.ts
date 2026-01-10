import { DateTime } from 'luxon';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Alert } from 'react-native';

import { useRostersStore } from '@/stores/use-rosters-store';
import {
  flightEntryToRoster,
  rostersToFlightEntries,
  type FlightEntry,
} from '@/utils/add-monthly.utils';

/**
 * Simplified hook for managing flights with auto-save
 * Removes bulk save - each entry saves immediately
 */
export function useSimpleFlightsManager(
  monthRosters: any[],
  prefix: string | null,
  currentMonth: DateTime
) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [lastSavedTimes, setLastSavedTimes] = useState<{
    departureTime: string;
    arrivalTime: string;
  } | null>(null);
  const { createRoster, fetchRosters } = useRostersStore();

  // Track existing flights for the month (loaded from rosters)
  const existingFlights = rostersToFlightEntries(monthRosters, prefix);

  /**
   * Save a single flight entry immediately
   */
  const saveFlight = useCallback(
    async (data: {
      date: string;
      flightNumber: string;
      departureTime: string;
      arrivalTime: string;
      addReturn?: boolean;
      returnFlightNumber?: string;
      returnDepartureTime?: string;
      returnArrivalTime?: string;
    }) => {
      const { date, flightNumber, departureTime, arrivalTime, addReturn, returnFlightNumber, returnDepartureTime, returnArrivalTime } = data;

      // Format flight code with prefix
      let flightCode = flightNumber.trim();
      if (prefix && !flightCode.includes(' ')) {
        if (/^\d+$/.test(flightCode)) {
          flightCode = `${prefix} ${flightCode}`;
        }
      }

      // Create depart roster
      const departRoster = {
        flight_code: flightCode.toUpperCase(),
        route: 'TBD',
        destination: 'TBD',
        flight_date: date,
        departure_time: departureTime,
        arrival_time: arrivalTime,
        origin: null,
        aircraft_type: null,
        flight_type: 'Depart' as const,
        status: 'Scheduled' as const,
      };

      const { error: departError } = await createRoster(departRoster);

      if (departError) {
        throw new Error(departError.message || 'Failed to save flight');
      }

      // Save return flight if requested
      if (addReturn && returnFlightNumber && returnDepartureTime && returnArrivalTime) {
        const departDateObj = DateTime.fromISO(date);
        if (!departDateObj.isValid) {
          throw new Error('Invalid depart date');
        }
        const returnDate = departDateObj.plus({ days: 1 }).toISODate();
        if (!returnDate) {
          throw new Error('Invalid return date');
        }

        let returnFlightCode = returnFlightNumber.trim();
        if (prefix && !returnFlightCode.includes(' ')) {
          if (/^\d+$/.test(returnFlightCode)) {
            returnFlightCode = `${prefix} ${returnFlightCode}`;
          }
        }

        const returnRoster = {
          flight_code: returnFlightCode.toUpperCase(),
          route: 'TBD',
          destination: 'TBD',
          flight_date: returnDate,
          departure_time: returnDepartureTime,
          arrival_time: returnArrivalTime,
          origin: null,
          aircraft_type: null,
          flight_type: 'Return' as const,
          status: 'Scheduled' as const,
        };

        const { error: returnError } = await createRoster(returnRoster);
        if (returnError) {
          // Depart saved but return failed - show warning but don't fail
          console.warn('[useSimpleFlightsManager] Return flight save failed:', returnError);
        }
      }

      // Remember times for next entry
      setLastSavedTimes({ departureTime, arrivalTime });

      // Refresh rosters to show new entry
      await fetchRosters();

      return { success: true };
    },
    [prefix, createRoster, fetchRosters]
  );

  /**
   * Check if a date already has a flight
   */
  const dateHasFlight = useCallback(
    (date: string): boolean => {
      return existingFlights.some((flight) => flight.date === date);
    },
    [existingFlights]
  );

  /**
   * Get default times (use last saved or defaults)
   */
  const getDefaultTimes = useCallback(() => {
    if (lastSavedTimes) {
      return {
        departureTime: lastSavedTimes.departureTime,
        arrivalTime: lastSavedTimes.arrivalTime,
      };
    }
    return {
      departureTime: '08:00',
      arrivalTime: '14:00',
    };
  }, [lastSavedTimes]);

  /**
   * Handle day press - opens input sheet
   */
  const handleDayPress = useCallback(
    (date: string) => {
      const dateObj = DateTime.fromISO(date);
      if (!dateObj.isValid) return;

      // Check if date already has a flight
      if (dateHasFlight(date)) {
        Alert.alert('Date Already Has Flight', 'This date already has a flight. Please edit it from the calendar view.');
        return;
      }

      setSelectedDate(date);
    },
    [dateHasFlight]
  );

  /**
   * Close input sheet
   */
  const closeInput = useCallback(() => {
    setSelectedDate(null);
  }, []);

  return {
    selectedDate,
    handleDayPress,
    closeInput,
    saveFlight,
    dateHasFlight,
    getDefaultTimes,
    existingFlights,
  };
}
