import { supabase } from '@/lib/supabase/client';
import { SharedRoster } from '@/lib/supabase/types';
import { create } from 'zustand';

interface SharedRostersState {
  sharedRosters: SharedRoster[];
  isLoading: boolean;
  error: string | null;
}

interface SharedRostersActions {
  fetchSharedRosters: () => Promise<{ error: Error | null }>;
  shareRoster: (params: {
    rosterId: string;
    sharedWithUserId: string;
    canEdit?: boolean;
    shareType: 'single' | 'week' | 'month' | 'all_future';
    shareStartDate?: string;
    shareEndDate?: string;
  }) => Promise<{ error: Error | null }>;
  shareRostersBulk: (params: {
    rosterIds: string[];
    sharedWithUserId: string;
    canEdit?: boolean;
  }) => Promise<{ error: Error | null; successCount: number; failedCount: number }>;
  unshareRoster: (sharedRosterId: string) => Promise<{ error: Error | null }>;
  unshareAllWithUser: (userId: string) => Promise<{ error: Error | null }>;
  getSharedRostersForRoster: (rosterId: string) => Promise<{ error: Error | null; sharedRosters: SharedRoster[] }>;
  clearSharedRosters: () => void;
  setError: (error: string | null) => void;
}

type SharedRostersStore = SharedRostersState & SharedRostersActions;

export const useSharedRostersStore = create<SharedRostersStore>()((set, get) => ({
  // State
  sharedRosters: [],
  isLoading: false,
  error: null,

  // Actions
  setError: (error: string | null) => {
    set({ error });
  },

  clearSharedRosters: () => {
    set({ sharedRosters: [], error: null });
  },

  fetchSharedRosters: async () => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        set({ isLoading: false, error: 'User not authenticated' });
        return { error: new Error('User not authenticated') };
      }

      // Fetch rosters shared with this user
      const { data, error: fetchError } = await supabase
        .from('shared_rosters')
        .select('*')
        .eq('shared_with_user_id', user.id)
        .order('shared_at', { ascending: false });

      if (fetchError) {
        set({ isLoading: false, error: fetchError.message });
        console.error('[SharedRostersStore] Error fetching shared rosters:', fetchError);
        return { error: new Error(fetchError.message || 'Failed to fetch shared rosters') };
      }

      set({
        sharedRosters: data || [],
        isLoading: false,
        error: null,
      });

      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to fetch shared rosters' });
      console.error('[SharedRostersStore] Exception fetching shared rosters:', error);
      return { error: error instanceof Error ? error : new Error('Failed to fetch shared rosters') };
    }
  },

  shareRoster: async ({ rosterId, sharedWithUserId, canEdit = false, shareType, shareStartDate, shareEndDate }) => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        set({ isLoading: false, error: 'User not authenticated' });
        return { error: new Error('User not authenticated') };
      }

      // Verify user owns the roster
      const { data: roster, error: rosterError } = await supabase
        .from('rosters')
        .select('user_id')
        .eq('id', rosterId)
        .single();

      if (rosterError || !roster || roster.user_id !== user.id) {
        set({ isLoading: false, error: 'Roster not found or access denied' });
        return { error: new Error('Roster not found or access denied') };
      }

      const { error: shareError } = await supabase
        .from('shared_rosters')
        .insert({
          roster_id: rosterId,
          shared_with_user_id: sharedWithUserId,
          shared_by_user_id: user.id,
          can_edit: canEdit,
          share_type: shareType,
          share_start_date: shareStartDate || null,
          share_end_date: shareEndDate || null,
        });

      if (shareError) {
        set({ isLoading: false, error: shareError.message });
        console.error('[SharedRostersStore] Error sharing roster:', shareError);
        return { error: new Error(shareError.message || 'Failed to share roster') };
      }

      // Refresh shared rosters
      await get().fetchSharedRosters();

      set({ isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to share roster' });
      console.error('[SharedRostersStore] Exception sharing roster:', error);
      return { error: error instanceof Error ? error : new Error('Failed to share roster') };
    }
  },

  shareRostersBulk: async ({ rosterIds, sharedWithUserId, canEdit = false }) => {
    set({ isLoading: true, error: null });

    let successCount = 0;
    let failedCount = 0;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        set({ isLoading: false, error: 'User not authenticated' });
        return { error: new Error('User not authenticated'), successCount: 0, failedCount: rosterIds.length };
      }

      // Share each roster
      for (const rosterId of rosterIds) {
        try {
          const { error: shareError } = await supabase
            .from('shared_rosters')
            .insert({
              roster_id: rosterId,
              shared_with_user_id: sharedWithUserId,
              shared_by_user_id: user.id,
              can_edit: canEdit,
              share_type: 'single',
            });

          if (shareError) {
            failedCount++;
            console.error('[SharedRostersStore] Error sharing roster:', shareError);
          } else {
            successCount++;
          }
        } catch (error) {
          failedCount++;
          console.error('[SharedRostersStore] Exception sharing roster:', error);
        }
      }

      // Refresh shared rosters
      await get().fetchSharedRosters();

      set({ isLoading: false, error: null });
      return { error: null, successCount, failedCount };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to share rosters' });
      return { error: error instanceof Error ? error : new Error('Failed to share rosters'), successCount, failedCount };
    }
  },

  unshareRoster: async (sharedRosterId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { error: deleteError } = await supabase
        .from('shared_rosters')
        .delete()
        .eq('id', sharedRosterId);

      if (deleteError) {
        set({ isLoading: false, error: deleteError.message });
        return { error: new Error(deleteError.message || 'Failed to unshare roster') };
      }

      await get().fetchSharedRosters();
      set({ isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to unshare roster' });
      return { error: error instanceof Error ? error : new Error('Failed to unshare roster') };
    }
  },

  unshareAllWithUser: async (userId: string) => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        set({ isLoading: false, error: 'User not authenticated' });
        return { error: new Error('User not authenticated') };
      }

      const { error: deleteError } = await supabase
        .from('shared_rosters')
        .delete()
        .eq('shared_with_user_id', userId)
        .eq('shared_by_user_id', user.id);

      if (deleteError) {
        set({ isLoading: false, error: deleteError.message });
        return { error: new Error(deleteError.message || 'Failed to unshare rosters') };
      }

      await get().fetchSharedRosters();
      set({ isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to unshare rosters' });
      return { error: error instanceof Error ? error : new Error('Failed to unshare rosters') };
    }
  },

  getSharedRostersForRoster: async (rosterId: string) => {
    try {
      const { data, error } = await supabase
        .from('shared_rosters')
        .select('*')
        .eq('roster_id', rosterId);

      if (error) {
        return { error: new Error(error.message || 'Failed to get shared rosters'), sharedRosters: [] };
      }

      return { error: null, sharedRosters: data || [] };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to get shared rosters'), sharedRosters: [] };
    }
  },
}));

