import { supabase } from '@/lib/supabase/client';
import { Notification, NotificationPreferences } from '@/lib/supabase/types';
import { create } from 'zustand';

interface NotificationsState {
  notifications: Notification[];
  preferences: NotificationPreferences | null;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
}

interface NotificationsActions {
  fetchNotifications: (limit?: number) => Promise<{ error: Error | null }>;
  fetchPreferences: () => Promise<{ error: Error | null }>;
  updatePreferences: (preferences: Partial<NotificationPreferences>) => Promise<{ error: Error | null }>;
  markAsRead: (notificationId: string) => Promise<{ error: Error | null }>;
  markAllAsRead: () => Promise<{ error: Error | null }>;
  deleteNotification: (notificationId: string) => Promise<{ error: Error | null }>;
  createNotification: (notification: {
    type: Notification['type'];
    title: string;
    body: string;
    data?: Record<string, any>;
  }) => Promise<{ error: Error | null }>;
  updatePushToken: (pushToken: string) => Promise<{ error: Error | null }>;
  clearNotifications: () => void;
  setError: (error: string | null) => void;
}

type NotificationsStore = NotificationsState & NotificationsActions;

export const useNotificationsStore = create<NotificationsStore>()((set, get) => ({
  // State
  notifications: [],
  preferences: null,
  unreadCount: 0,
  isLoading: false,
  error: null,

  // Actions
  setError: (error: string | null) => {
    set({ error });
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0, error: null });
  },

  fetchNotifications: async (limit = 50) => {
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

      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        set({ isLoading: false, error: fetchError.message });
        console.error('[NotificationsStore] Error fetching notifications:', fetchError);
        return { error: new Error(fetchError.message || 'Failed to fetch notifications') };
      }

      const unreadCount = (data || []).filter((n) => !n.read).length;

      set({
        notifications: data || [],
        unreadCount,
        isLoading: false,
        error: null,
      });

      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to fetch notifications' });
      console.error('[NotificationsStore] Exception fetching notifications:', error);
      return { error: error instanceof Error ? error : new Error('Failed to fetch notifications') };
    }
  },

  fetchPreferences: async () => {
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

      const { data, error: fetchError } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        // If preferences don't exist, create default ones
        if (fetchError.code === 'PGRST116') {
          const { data: newPrefs, error: createError } = await supabase
            .from('notification_preferences')
            .insert({ user_id: user.id })
            .select()
            .single();

          if (createError) {
            set({ isLoading: false, error: createError.message });
            return { error: new Error(createError.message || 'Failed to create preferences') };
          }

          set({ preferences: newPrefs, isLoading: false, error: null });
          return { error: null };
        }

        set({ isLoading: false, error: fetchError.message });
        return { error: new Error(fetchError.message || 'Failed to fetch preferences') };
      }

      set({ preferences: data, isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to fetch preferences' });
      return { error: error instanceof Error ? error : new Error('Failed to fetch preferences') };
    }
  },

  updatePreferences: async (updates: Partial<NotificationPreferences>) => {
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

      const { data, error: updateError } = await supabase
        .from('notification_preferences')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) {
        set({ isLoading: false, error: updateError.message });
        return { error: new Error(updateError.message || 'Failed to update preferences') };
      }

      set({ preferences: data, isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to update preferences' });
      return { error: error instanceof Error ? error : new Error('Failed to update preferences') };
    }
  },

  markAsRead: async (notificationId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (updateError) {
        return { error: new Error(updateError.message || 'Failed to mark as read') };
      }

      // Update local state
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to mark as read') };
    }
  },

  markAllAsRead: async () => {
    try {
      const { error } = await supabase.rpc('mark_all_notifications_read');

      if (error) {
        return { error: new Error(error.message || 'Failed to mark all as read') };
      }

      // Update local state
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() })),
        unreadCount: 0,
      }));

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to mark all as read') };
    }
  },

  deleteNotification: async (notificationId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (deleteError) {
        return { error: new Error(deleteError.message || 'Failed to delete notification') };
      }

      // Update local state
      set((state) => {
        const notification = state.notifications.find((n) => n.id === notificationId);
        return {
          notifications: state.notifications.filter((n) => n.id !== notificationId),
          unreadCount: notification && !notification.read ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      });

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to delete notification') };
    }
  },

  createNotification: async ({ type, title, body, data = {} }) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { error: new Error('User not authenticated') };
      }

      const { error: createError } = await supabase
        .from('notifications')
        .insert({
          user_id: user.id,
          type,
          title,
          body,
          data,
        });

      if (createError) {
        return { error: new Error(createError.message || 'Failed to create notification') };
      }

      // Refresh notifications
      await get().fetchNotifications();

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to create notification') };
    }
  },

  updatePushToken: async (pushToken: string) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { error: new Error('User not authenticated') };
      }

      const { error: updateError } = await supabase
        .from('notification_preferences')
        .update({ push_token: pushToken })
        .eq('user_id', user.id);

      if (updateError) {
        return { error: new Error(updateError.message || 'Failed to update push token') };
      }

      // Refresh preferences
      await get().fetchPreferences();

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to update push token') };
    }
  },
}));

