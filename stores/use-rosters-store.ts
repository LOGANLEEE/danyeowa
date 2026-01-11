import { OfflineStorage } from '@/lib/offline-storage';
import { supabase } from '@/lib/supabase/client';
import { Roster } from '@/lib/supabase/types';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

// Types
type RosterInput = {
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
};

type RosterUpdate = Partial<RosterInput>;

interface RostersState {
  rosters: Roster[];
  isLoading: boolean;
  error: string | null;
}

interface RostersActions {
  fetchRosters: () => Promise<{error: Error | null}>;
  fetchRostersByDateRange: (startDate: string, endDate: string) => Promise<{error: Error | null}>;
  createRoster: (roster: RosterInput) => Promise<{error: Error | null}>;
  createMultipleRosters: (
    rosters: RosterInput[],
  ) => Promise<{error: Error | null; successCount: number; failedCount: number}>;
  updateRoster: (id: string, roster: RosterUpdate) => Promise<{error: Error | null}>;
  updateMultipleRosters: (
    updates: Array<{id: string} & RosterUpdate>,
  ) => Promise<{error: Error | null; successCount: number; failedCount: number}>;
  clearRosters: () => void;
  setError: (error: string | null) => void;
}

type RostersStore = RostersState & RostersActions;

// Helper functions
const checkNetworkConnection = async (): Promise<boolean> => {
  const networkState = await NetInfo.fetch();
  return networkState.isConnected ?? false;
};

const getCurrentUser = async () => {
  const {data, error} = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('User not authenticated');
  }
  return data.user;
};

const sortRosters = (rosters: Roster[]): Roster[] => {
  return [...rosters].sort((a, b) => {
    if (a.flight_date !== b.flight_date) {
      return a.flight_date.localeCompare(b.flight_date);
    }
    return a.departure_time.localeCompare(b.departure_time);
  });
};

const updateCache = async (rosters: Roster[]): Promise<void> => {
  await OfflineStorage.cacheRosters(rosters);
};

const loadCachedRosters = async (): Promise<Roster[]> => {
  const cached = await OfflineStorage.getCachedRosters();
  return cached || [];
};

const filterRostersByDateRange = (
  rosters: Roster[],
  startDate: string,
  endDate: string,
): Roster[] => {
  return rosters.filter(
    (roster) => roster.flight_date >= startDate && roster.flight_date <= endDate,
  );
};

const createRosterPayload = (roster: RosterInput, userId: string) => ({
  user_id: userId,
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
});

const createOfflineRoster = (roster: RosterInput, userId: string): Roster => ({
  id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  ...createRosterPayload(roster, userId),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const useRostersStore = create<RostersStore>()((set, get) => ({
  // State
  rosters: [],
  isLoading: false,
  error: null,

  // Actions
  setError: (error: string | null) => {
    set({error});
  },

  clearRosters: () => {
    set({rosters: [], error: null});
  },

  fetchRosters: async () => {
    set({isLoading: true, error: null});

    try {
      const isConnected = await checkNetworkConnection();

      // If offline, load from cache
      if (!isConnected) {
        const cached = await loadCachedRosters();
        set({rosters: cached, isLoading: false, error: null});
        return {error: null};
      }

      // Fetch rosters (RLS policies filter based on user permissions)
      const {data, error: fetchError} = await supabase
        .from('rosters')
        .select('*')
        .order('flight_date', {ascending: true})
        .order('departure_time', {ascending: true});

      if (fetchError) {
        console.error('[RostersStore] Error fetching rosters:', fetchError);
        const cached = await loadCachedRosters();
        set({
          rosters: cached,
          isLoading: false,
          error: fetchError.message,
        });
        return {error: new Error(fetchError.message || 'Failed to fetch rosters')};
      }

      // Cache and update state
      if (data) {
        await updateCache(data);
      }

      set({rosters: data || [], isLoading: false, error: null});
      return {error: null};
    } catch (error) {
      console.error('[RostersStore] Exception fetching rosters:', error);
      const cached = await loadCachedRosters();
      set({
        rosters: cached,
        isLoading: false,
        error: 'Failed to fetch rosters',
      });
      return {error: error instanceof Error ? error : new Error('Failed to fetch rosters')};
    }
  },

  fetchRostersByDateRange: async (startDate: string, endDate: string) => {
    set({isLoading: true, error: null});

    try {
      const isConnected = await checkNetworkConnection();

      // If offline, filter cached rosters by date range
      if (!isConnected) {
        const cached = await loadCachedRosters();
        const filtered = filterRostersByDateRange(cached, startDate, endDate);
        set({rosters: filtered, isLoading: false, error: null});
        return {error: null};
      }

      const {data, error: fetchError} = await supabase
        .from('rosters')
        .select('*')
        .gte('flight_date', startDate)
        .lte('flight_date', endDate)
        .order('flight_date', {ascending: true})
        .order('departure_time', {ascending: true});

      if (fetchError) {
        console.error('[RostersStore] Error fetching rosters by date range:', fetchError);
        const cached = await loadCachedRosters();
        const filtered = filterRostersByDateRange(cached, startDate, endDate);
        set({
          rosters: filtered,
          isLoading: false,
          error: fetchError.message,
        });
        return {error: new Error(fetchError.message || 'Failed to fetch rosters')};
      }

      // Update cache with fetched data
      if (data) {
        const cached = await loadCachedRosters();
        const updated = [...cached];

        // Update existing rosters or add new ones
        data.forEach((roster) => {
          const index = updated.findIndex((r) => r.id === roster.id);
          if (index >= 0) {
            updated[index] = roster;
          } else {
            updated.push(roster);
          }
        });

        await updateCache(updated);
      }

      set({rosters: data || [], isLoading: false, error: null});
      return {error: null};
    } catch (error) {
      console.error('[RostersStore] Exception fetching rosters by date range:', error);
      const cached = await loadCachedRosters();
      const filtered = filterRostersByDateRange(cached, startDate, endDate);
      set({
        rosters: filtered,
        isLoading: false,
        error: 'Failed to fetch rosters',
      });
      return {error: error instanceof Error ? error : new Error('Failed to fetch rosters')};
    }
  },

  createRoster: async (roster) => {
    set({isLoading: true, error: null});

    try {
      const user = await getCurrentUser();

      const {data, error: createError} = await supabase
        .from('rosters')
        .insert(createRosterPayload(roster, user.id))
        .select()
        .single();

      if (createError) {
        set({isLoading: false, error: createError.message});
        console.error('[RostersStore] Error creating roster:', createError);
        return {error: new Error(createError.message || 'Failed to create roster')};
      }

      // Add new roster to state
      set((state) => ({
        rosters: sortRosters([...state.rosters, data]),
        isLoading: false,
        error: null,
      }));

      return {error: null};
    } catch (error) {
      set({isLoading: false, error: 'Failed to create roster'});
      console.error('[RostersStore] Exception creating roster:', error);
      return {error: error instanceof Error ? error : new Error('Failed to create roster')};
    }
  },

  createMultipleRosters: async (rosters) => {
    set({isLoading: true, error: null});

    let successCount = 0;
    let failedCount = 0;
    const errors: Error[] = [];

    try {
      const user = await getCurrentUser();
      const isConnected = await checkNetworkConnection();

      // Handle offline mode
      if (!isConnected) {
        const tempRosters: Roster[] = [];

        for (const roster of rosters) {
          try {
            const tempRoster = createOfflineRoster(roster, user.id);
            await OfflineStorage.addToQueue({
              type: 'create',
              table: 'rosters',
              data: createRosterPayload(roster, user.id),
              userId: user.id,
            });
            tempRosters.push(tempRoster);
            successCount++;
          } catch (error) {
            failedCount++;
            errors.push(error instanceof Error ? error : new Error('Failed to queue roster'));
          }
        }

        const updated = sortRosters([...get().rosters, ...tempRosters]);
        set({rosters: updated, isLoading: false, error: null});
        await updateCache(updated);

        return {
          error: failedCount === rosters.length ? new Error('Failed to queue all rosters') : null,
          successCount,
          failedCount,
        };
      }

      // Online: Create rosters sequentially
      for (const roster of rosters) {
        try {
          const {data, error: createError} = await supabase
            .from('rosters')
            .insert(createRosterPayload(roster, user.id))
            .select()
            .single();

          if (createError) {
            failedCount++;
            errors.push(new Error(createError.message || 'Failed to create roster'));
            console.error('[RostersStore] Error creating roster:', createError);
          } else if (data) {
            successCount++;
            set((state) => ({rosters: sortRosters([...state.rosters, data])}));
          } else {
            failedCount++;
            errors.push(new Error('Insert succeeded but no data returned'));
          }
        } catch (error) {
          failedCount++;
          errors.push(error instanceof Error ? error : new Error('Failed to create roster'));
          console.error('[RostersStore] Exception creating roster:', error);
        }
      }

      // Update cache and refresh if needed
      await updateCache(get().rosters);
      if (successCount > 0) {
        await get().fetchRosters();
      }

      set({isLoading: false, error: null});

      const finalError =
        failedCount === rosters.length
          ? new Error(`Failed to create all rosters: ${errors[0]?.message || 'Unknown error'}`)
          : null;

      return {error: finalError, successCount, failedCount};
    } catch (error) {
      set({isLoading: false, error: 'Failed to create rosters'});
      console.error('[RostersStore] Exception creating multiple rosters:', error);
      return {
        error: error instanceof Error ? error : new Error('Failed to create rosters'),
        successCount,
        failedCount: rosters.length - successCount,
      };
    }
  },

  updateRoster: async (id, roster) => {
    set({isLoading: true, error: null});

    try {
      const isConnected = await checkNetworkConnection();

      // If offline, queue the update
      if (!isConnected) {
        const user = await getCurrentUser();

        await OfflineStorage.addToQueue({
          type: 'update',
          table: 'rosters',
          data: {id, ...roster},
          userId: user.id,
        });

        // Update local state optimistically
        set((state) => ({
          rosters: sortRosters(
            state.rosters.map((r) =>
              r.id === id ? {...r, ...roster, updated_at: new Date().toISOString()} : r,
            ),
          ),
          isLoading: false,
          error: null,
        }));

        await updateCache(get().rosters);
        return {error: null};
      }

      const {data, error: updateError} = await supabase
        .from('rosters')
        .update(roster)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        set({isLoading: false, error: updateError.message});
        console.error('[RostersStore] Error updating roster:', updateError);
        return {error: new Error(updateError.message || 'Failed to update roster')};
      }

      // Update state and cache
      set((state) => ({
        rosters: sortRosters(state.rosters.map((r) => (r.id === id ? data : r))),
        isLoading: false,
        error: null,
      }));

      await updateCache(get().rosters);
      return {error: null};
    } catch (error) {
      set({isLoading: false, error: 'Failed to update roster'});
      console.error('[RostersStore] Exception updating roster:', error);
      return {error: error instanceof Error ? error : new Error('Failed to update roster')};
    }
  },

  updateMultipleRosters: async (updates) => {
    set({isLoading: true, error: null});

    let successCount = 0;
    let failedCount = 0;
    const errors: Error[] = [];

    try {
      const user = await getCurrentUser();
      const isConnected = await checkNetworkConnection();

      // If offline, queue all updates
      if (!isConnected) {
        for (const update of updates) {
          try {
            const {id, ...updateData} = update;
            await OfflineStorage.addToQueue({
              type: 'update',
              table: 'rosters',
              data: {id, ...updateData},
              userId: user.id,
            });
            successCount++;
          } catch (error) {
            failedCount++;
            errors.push(error instanceof Error ? error : new Error('Failed to queue update'));
          }
        }

        // Update state optimistically
        set((state) => ({
          rosters: sortRosters(
            state.rosters.map((r) => {
              const update = updates.find((u) => u.id === r.id);
              return update ? {...r, ...update, updated_at: new Date().toISOString()} : r;
            }),
          ),
          isLoading: false,
          error: null,
        }));

        await updateCache(get().rosters);

        return {
          error: failedCount === updates.length ? new Error('Failed to queue all updates') : null,
          successCount,
          failedCount,
        };
      }

      // Online: Update rosters sequentially
      for (const update of updates) {
        try {
          const {data, error: updateError} = await supabase
            .from('rosters')
            .update(update)
            .eq('id', update.id)
            .select()
            .single();

          if (updateError) {
            failedCount++;
            errors.push(new Error(updateError.message || 'Failed to update roster'));
            console.error('[RostersStore] Error updating roster:', updateError);
          } else if (data) {
            successCount++;
            set((state) => ({
              rosters: sortRosters(state.rosters.map((r) => (r.id === update.id ? data : r))),
            }));
          } else {
            failedCount++;
            errors.push(new Error('Update succeeded but no data returned'));
          }
        } catch (error) {
          failedCount++;
          errors.push(error instanceof Error ? error : new Error('Failed to update roster'));
          console.error('[RostersStore] Exception updating roster:', error);
        }
      }

      // Update cache and refresh if needed
      await updateCache(get().rosters);
      if (successCount > 0) {
        await get().fetchRosters();
      }

      set({isLoading: false, error: null});

      const finalError =
        failedCount === updates.length
          ? new Error(`Failed to update all rosters: ${errors[0]?.message || 'Unknown error'}`)
          : null;

      return {error: finalError, successCount, failedCount};
    } catch (error) {
      set({isLoading: false, error: 'Failed to update rosters'});
      console.error('[RostersStore] Exception updating multiple rosters:', error);
      return {
        error: error instanceof Error ? error : new Error('Failed to update rosters'),
        successCount,
        failedCount: updates.length - successCount,
      };
    }
  },
}));
