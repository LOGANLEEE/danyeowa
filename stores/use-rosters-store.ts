import { supabase } from '@/lib/supabase/client';
import { OfflineStorage } from '@/lib/offline-storage';
import { SyncService } from '@/lib/sync-service';
import { Roster } from '@/lib/supabase/types';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

interface RostersState {
  rosters: Roster[];
  isLoading: boolean;
  error: string | null;
}

interface RostersActions {
  fetchRosters: () => Promise<{ error: Error | null }>;
  fetchRostersByDateRange: (
    startDate: string,
    endDate: string,
  ) => Promise<{ error: Error | null }>;
  createRoster: (roster: {
    flight_code: string;
    route: string;
    destination: string;
    flight_date: string;
    departure_time: string;
    arrival_time: string;
    origin?: string | null;
    aircraft_type?: string | null;
    flight_type?: 'Depart' | 'Return';
    status?: Roster['status'];
  }) => Promise<{ error: Error | null }>;
  createMultipleRosters: (rosters: Array<{
    flight_code: string;
    route: string;
    destination: string;
    flight_date: string;
    departure_time: string;
    arrival_time: string;
    origin?: string | null;
    aircraft_type?: string | null;
    flight_type?: 'Depart' | 'Return';
    status?: Roster['status'];
  }>) => Promise<{ error: Error | null; successCount: number; failedCount: number }>;
  clearRosters: () => void;
  setError: (error: string | null) => void;
}

type RostersStore = RostersState & RostersActions;

export const useRostersStore = create<RostersStore>()((set, get) => ({
  // State
  rosters: [],
  isLoading: false,
  error: null,

  // Actions
  setError: (error: string | null) => {
    set({ error });
  },

  clearRosters: () => {
    set({ rosters: [], error: null });
  },

  fetchRosters: async () => {
    set({ isLoading: true, error: null });

    try {
      const networkState = await NetInfo.fetch();
      const isConnected = networkState.isConnected ?? false;

      // If offline, load from cache
      if (!isConnected) {
        const cached = await OfflineStorage.getCachedRosters();
        set({
          rosters: cached || [],
          isLoading: false,
          error: null,
        });
        return { error: null };
      }

      // Fetch both own rosters and shared rosters
      // RLS policies will automatically filter based on user permissions
      const { data, error: fetchError } = await supabase
        .from('rosters')
        .select('*')
        .order('flight_date', { ascending: true })
        .order('departure_time', { ascending: true });

      if (fetchError) {
        // On error, try to load from cache
        console.error('[RostersStore] Error fetching rosters:', fetchError);
        const cached = await OfflineStorage.getCachedRosters();
        set({
          rosters: cached || [],
          isLoading: false,
          error: fetchError.message,
        });
        return { error: new Error(fetchError.message || 'Failed to fetch rosters') };
      }

      // Cache the fetched data
      if (data) {
        await OfflineStorage.cacheRosters(data);
      }

      set({
        rosters: data || [],
        isLoading: false,
        error: null,
      });

      return { error: null };
    } catch (error) {
      // On exception, try to load from cache
      console.error('[RostersStore] Exception fetching rosters:', error);
      const cached = await OfflineStorage.getCachedRosters();
      set({
        rosters: cached || [],
        isLoading: false,
        error: 'Failed to fetch rosters',
      });
      return { error: error instanceof Error ? error : new Error('Failed to fetch rosters') };
    }
  },

  fetchRostersByDateRange: async (startDate: string, endDate: string) => {
    set({ isLoading: true, error: null });

    try {
      const networkState = await NetInfo.fetch();
      const isConnected = networkState.isConnected ?? false;

      // If offline, filter cached rosters by date range
      if (!isConnected) {
        const cached = await OfflineStorage.getCachedRosters();
        const filtered = (cached || []).filter(
          (roster) => roster.flight_date >= startDate && roster.flight_date <= endDate
        );
        set({
          rosters: filtered,
          isLoading: false,
          error: null,
        });
        return { error: null };
      }

      const { data, error: fetchError } = await supabase
        .from('rosters')
        .select('*')
        .gte('flight_date', startDate)
        .lte('flight_date', endDate)
        .order('flight_date', { ascending: true })
        .order('departure_time', { ascending: true });

      if (fetchError) {
        // On error, filter cached rosters
        console.error('[RostersStore] Error fetching rosters by date range:', fetchError);
        const cached = await OfflineStorage.getCachedRosters();
        const filtered = (cached || []).filter(
          (roster) => roster.flight_date >= startDate && roster.flight_date <= endDate
        );
        set({
          rosters: filtered,
          isLoading: false,
          error: fetchError.message,
        });
        return { error: new Error(fetchError.message || 'Failed to fetch rosters') };
      }

      // Update cache with fetched data
      if (data) {
        const cached = await OfflineStorage.getCachedRosters();
        const updated = (cached || []).map((cachedRoster) => {
          const updatedRoster = data.find((r) => r.id === cachedRoster.id);
          return updatedRoster || cachedRoster;
        });
        // Add new rosters
        data.forEach((roster) => {
          if (!updated.find((r) => r.id === roster.id)) {
            updated.push(roster);
          }
        });
        await OfflineStorage.cacheRosters(updated);
      }

      set({
        rosters: data || [],
        isLoading: false,
        error: null,
      });

      return { error: null };
    } catch (error) {
      // On exception, filter cached rosters
      console.error('[RostersStore] Exception fetching rosters by date range:', error);
      const cached = await OfflineStorage.getCachedRosters();
      const filtered = (cached || []).filter(
        (roster) => roster.flight_date >= startDate && roster.flight_date <= endDate
      );
      set({
        rosters: filtered,
        isLoading: false,
        error: 'Failed to fetch rosters',
      });
      return { error: error instanceof Error ? error : new Error('Failed to fetch rosters') };
    }
  },

  createRoster: async (roster) => {
    set({ isLoading: true, error: null });

    try {
      // Get current user from Supabase session
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        set({ isLoading: false, error: 'User not authenticated' });
        console.error('[RostersStore] Error getting user:', userError);
        return { error: new Error('User not authenticated') };
      }

      const { data, error: createError } = await supabase
        .from('rosters')
        .insert({
          user_id: user.id,
          flight_code: roster.flight_code,
          route: roster.route,
          destination: roster.destination,
          flight_date: roster.flight_date,
          departure_time: roster.departure_time,
          arrival_time: roster.arrival_time,
          origin: roster.origin || null,
          aircraft_type: roster.aircraft_type || null,
          flight_type: roster.flight_type || 'Depart',
          status: roster.status || 'Scheduled',
        })
        .select()
        .single();

      if (createError) {
        set({ isLoading: false, error: createError.message });
        console.error('[RostersStore] Error creating roster:', createError);
        return { error: new Error(createError.message || 'Failed to create roster') };
      }

      // Add new roster to state
      set((state) => ({
        rosters: [...state.rosters, data].sort((a, b) => {
          if (a.flight_date !== b.flight_date) {
            return a.flight_date.localeCompare(b.flight_date);
          }
          return a.departure_time.localeCompare(b.departure_time);
        }),
        isLoading: false,
        error: null,
      }));

      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to create roster' });
      console.error('[RostersStore] Exception creating roster:', error);
      return { error: error instanceof Error ? error : new Error('Failed to create roster') };
    }
  },

  createMultipleRosters: async (rosters) => {
    set({ isLoading: true, error: null });

    let successCount = 0;
    let failedCount = 0;
    const errors: Error[] = [];

    try {
      // Get current user from Supabase session
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        const errorMsg = 'User not authenticated';
        set({ isLoading: false, error: errorMsg });
        console.error('[RostersStore] Error getting user:', userError);
        return { 
          error: new Error(errorMsg), 
          successCount: 0, 
          failedCount: rosters.length 
        };
      }

      // Check network status
      const networkState = await NetInfo.fetch();
      const isConnected = networkState.isConnected ?? false;

      // If offline, queue all operations
      if (!isConnected) {
        const tempRosters: Roster[] = [];
        
        for (const roster of rosters) {
          try {
            // Create temporary roster with offline ID
            const tempRoster: Roster = {
              id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              user_id: user.id,
              flight_code: roster.flight_code,
              route: roster.route,
              destination: roster.destination,
              flight_date: roster.flight_date,
              departure_time: roster.departure_time,
              arrival_time: roster.arrival_time,
              origin: roster.origin || null,
              aircraft_type: roster.aircraft_type || null,
              flight_type: roster.flight_type || 'Depart',
              status: roster.status || 'Scheduled',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            // Queue the operation
            await OfflineStorage.addToQueue({
              type: 'create',
              table: 'rosters',
              data: {
                user_id: user.id,
                flight_code: roster.flight_code,
                route: roster.route,
                destination: roster.destination,
                flight_date: roster.flight_date,
                departure_time: roster.departure_time,
                arrival_time: roster.arrival_time,
                origin: roster.origin || null,
                aircraft_type: roster.aircraft_type || null,
                flight_type: roster.flight_type || 'Depart',
                status: roster.status || 'Scheduled',
              },
              userId: user.id,
            });

            tempRosters.push(tempRoster);
            successCount++;
          } catch (error) {
            failedCount++;
            errors.push(error instanceof Error ? error : new Error('Failed to queue roster'));
          }
        }

        // Update local state and cache
        const currentRosters = get().rosters;
        const updated = [...currentRosters, ...tempRosters].sort((a, b) => {
          if (a.flight_date !== b.flight_date) {
            return a.flight_date.localeCompare(b.flight_date);
          }
          return a.departure_time.localeCompare(b.departure_time);
        });
        
        set({ rosters: updated, isLoading: false, error: null });
        await OfflineStorage.cacheRosters(updated);

        return { 
          error: failedCount === rosters.length ? new Error('Failed to queue all rosters') : null,
          successCount, 
          failedCount 
        };
      }

      // Online: Create rosters sequentially
      for (let i = 0; i < rosters.length; i++) {
        const roster = rosters[i];
        try {
          const { data, error: createError } = await supabase
            .from('rosters')
            .insert({
              user_id: user.id,
              flight_code: roster.flight_code,
              route: roster.route,
              destination: roster.destination,
              flight_date: roster.flight_date,
              departure_time: roster.departure_time,
              arrival_time: roster.arrival_time,
              origin: roster.origin || null,
              aircraft_type: roster.aircraft_type || null,
              flight_type: roster.flight_type || 'Depart',
              status: roster.status || 'Scheduled',
            })
            .select()
            .single();

          if (createError) {
            failedCount++;
            const error = new Error(createError.message || 'Failed to create roster');
            errors.push(error);
            console.error(`[RostersStore] Error creating roster ${i + 1}:`, createError);
          } else if (data) {
            successCount++;
            // Add new roster to state
            set((state) => ({
              rosters: [...state.rosters, data].sort((a, b) => {
                if (a.flight_date !== b.flight_date) {
                  return a.flight_date.localeCompare(b.flight_date);
                }
                return a.departure_time.localeCompare(b.departure_time);
              }),
            }));
          } else {
            failedCount++;
            const error = new Error('Insert succeeded but no data returned');
            errors.push(error);
            console.error(`[RostersStore] No data returned for roster ${i + 1}`);
          }
        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error : new Error('Failed to create roster');
          errors.push(errorMessage);
          console.error(`[RostersStore] Exception creating roster ${i + 1}:`, error);
        }
      }

      // Update cache
      const currentRosters = get().rosters;
      await OfflineStorage.cacheRosters(currentRosters);

      // Refresh rosters to ensure consistency (only if online)
      if (successCount > 0) {
        await get().fetchRosters();
      }

      set({ isLoading: false, error: null });

      // Return error if all failed, otherwise return null (partial success is acceptable)
      const finalError = failedCount === rosters.length 
        ? new Error(`Failed to create all rosters: ${errors[0]?.message || 'Unknown error'}`)
        : null;

      return { 
        error: finalError, 
        successCount, 
        failedCount 
      };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to create rosters' });
      console.error('[RostersStore] Exception creating multiple rosters:', error);
      return { 
        error: error instanceof Error ? error : new Error('Failed to create rosters'), 
        successCount, 
        failedCount: rosters.length - successCount 
      };
    }
  },
}));

