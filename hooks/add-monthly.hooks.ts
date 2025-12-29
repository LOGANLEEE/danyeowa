import { getFlightCodePrefix, saveFlightCodePrefix } from '@/lib/secure-storage';
import { useRostersStore } from '@/stores/use-rosters-store';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';
import { rostersToFlightEntries } from '@/utils/add-monthly.utils';
import { getMonthDateRange } from '@/utils/add-monthly.utils';

/**
 * Hook to manage flight code prefix state and persistence
 */
export function useFlightPrefix() {
  const [prefix, setPrefix] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load prefix on mount
  useEffect(() => {
    const loadPrefix = async () => {
      try {
        const savedPrefix = await getFlightCodePrefix();
        setPrefix(savedPrefix);
      } catch (error) {
        console.error('[useFlightPrefix] Error loading prefix:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPrefix();
  }, []);

  // Save prefix when it changes
  const updatePrefix = useCallback(async (newPrefix: string) => {
    try {
      const trimmedPrefix = newPrefix.trim().toUpperCase();
      if (trimmedPrefix) {
        await saveFlightCodePrefix(trimmedPrefix);
        setPrefix(trimmedPrefix);
      } else {
        // Clear prefix if empty
        await saveFlightCodePrefix('');
        setPrefix(null);
      }
    } catch (error) {
      console.error('[useFlightPrefix] Error saving prefix:', error);
      throw error;
    }
  }, []);

  return {
    prefix,
    isLoading,
    updatePrefix,
  };
}

/**
 * Hook to load rosters for a specific month
 */
export function useRostersLoader(month: DateTime) {
  const { rosters, fetchRostersByDateRange, isLoading } = useRostersStore();
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);

  // Load rosters for the month
  const loadRostersForMonth = useCallback(async () => {
    setIsLoadingMonth(true);
    try {
      const { startDate, endDate } = getMonthDateRange(month);
      await fetchRostersByDateRange(startDate, endDate);
    } catch (error) {
      console.error('[useRostersLoader] Error loading rosters:', error);
    } finally {
      setIsLoadingMonth(false);
    }
  }, [month, fetchRostersByDateRange]);

  // Auto-load when month changes
  useEffect(() => {
    loadRostersForMonth();
  }, [loadRostersForMonth]);

  // Filter rosters for the current month
  const monthRosters = rosters.filter((roster) => {
    const rosterDate = DateTime.fromISO(roster.flight_date);
    return rosterDate.hasSame(month, 'month');
  });

  return {
    rosters: monthRosters,
    isLoading: isLoading || isLoadingMonth,
    reload: loadRostersForMonth,
  };
}

