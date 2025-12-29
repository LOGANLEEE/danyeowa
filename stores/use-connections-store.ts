import { supabase } from '@/lib/supabase/client';
import { Connection } from '@/lib/supabase/types';
import { create } from 'zustand';

interface ConnectionsState {
  connections: Connection[];
  isLoading: boolean;
  error: string | null;
}

interface ConnectionsActions {
  fetchConnections: () => Promise<{ error: Error | null }>;
  sendInvitation: (params: {
    email?: string;
    phoneNumber?: string;
    role: 'family' | 'friend' | 'colleague';
    method: 'email' | 'sms' | 'in_app' | 'link';
  }) => Promise<{ error: Error | null; connection: Connection | null; invitationToken: string | null }>;
  acceptInvitation: (invitationToken: string) => Promise<{ error: Error | null }>;
  declineInvitation: (connectionId: string) => Promise<{ error: Error | null }>;
  removeConnection: (connectionId: string) => Promise<{ error: Error | null }>;
  blockConnection: (connectionId: string) => Promise<{ error: Error | null }>;
  getConnectionByToken: (token: string) => Promise<{ error: Error | null; connection: Connection | null }>;
  clearConnections: () => void;
  setError: (error: string | null) => void;
}

type ConnectionsStore = ConnectionsState & ConnectionsActions;

export const useConnectionsStore = create<ConnectionsStore>()((set, get) => ({
  // State
  connections: [],
  isLoading: false,
  error: null,

  // Actions
  setError: (error: string | null) => {
    set({ error });
  },

  clearConnections: () => {
    set({ connections: [], error: null });
  },

  fetchConnections: async () => {
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

      // Fetch connections where user is either the inviter or invitee
      const { data, error: fetchError } = await supabase
        .from('connections')
        .select('*')
        .or(`user_id.eq.${user.id},connected_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (fetchError) {
        set({ isLoading: false, error: fetchError.message });
        console.error('[ConnectionsStore] Error fetching connections:', fetchError);
        return { error: new Error(fetchError.message || 'Failed to fetch connections') };
      }

      set({
        connections: data || [],
        isLoading: false,
        error: null,
      });

      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to fetch connections' });
      console.error('[ConnectionsStore] Exception fetching connections:', error);
      return { error: error instanceof Error ? error : new Error('Failed to fetch connections') };
    }
  },

  sendInvitation: async ({ email, phoneNumber, role, method }) => {
    set({ isLoading: true, error: null });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        set({ isLoading: false, error: 'User not authenticated' });
        return { error: new Error('User not authenticated'), connection: null, invitationToken: null };
      }

      // Find user by email or phone
      let connectedUserId: string | null = null;

      if (email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single();

        if (profile) {
          connectedUserId = profile.id;
        }
      }

      // If user not found, we'll create a pending connection with invitation token
      // The token can be used when the user signs up
      const invitationToken = `${user.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const connectionData: any = {
        user_id: user.id,
        role,
        invited_by: user.id,
        invitation_token: invitationToken,
        invitation_method: method,
        invitation_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        status: 'pending',
      };

      if (connectedUserId) {
        connectionData.connected_user_id = connectedUserId;
      } else {
        // If user doesn't exist, we'll need to handle this differently
        // For now, we'll create a placeholder connection
        // In production, you might want to send an email/SMS invitation
        connectionData.connected_user_id = user.id; // Placeholder, will be updated when user accepts
      }

      const { data, error: createError } = await supabase
        .from('connections')
        .insert(connectionData)
        .select()
        .single();

      if (createError) {
        set({ isLoading: false, error: createError.message });
        console.error('[ConnectionsStore] Error creating connection:', createError);
        return { error: new Error(createError.message || 'Failed to send invitation'), connection: null, invitationToken: null };
      }

      // Refresh connections list
      await get().fetchConnections();

      set({ isLoading: false, error: null });
      return { error: null, connection: data, invitationToken };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to send invitation' });
      console.error('[ConnectionsStore] Exception sending invitation:', error);
      return { error: error instanceof Error ? error : new Error('Failed to send invitation'), connection: null, invitationToken: null };
    }
  },

  acceptInvitation: async (invitationToken: string) => {
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

      // Find connection by token
      const { data: connection, error: findError } = await supabase
        .from('connections')
        .select('*')
        .eq('invitation_token', invitationToken)
        .eq('status', 'pending')
        .single();

      if (findError || !connection) {
        set({ isLoading: false, error: 'Invalid or expired invitation' });
        return { error: new Error('Invalid or expired invitation') };
      }

      // Check if token is expired
      if (connection.invitation_expires_at && new Date(connection.invitation_expires_at) < new Date()) {
        set({ isLoading: false, error: 'Invitation has expired' });
        return { error: new Error('Invitation has expired') };
      }

      // Update connection status to accepted
      const { error: updateError } = await supabase
        .from('connections')
        .update({
          status: 'accepted',
          connected_user_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      if (updateError) {
        set({ isLoading: false, error: updateError.message });
        console.error('[ConnectionsStore] Error accepting invitation:', updateError);
        return { error: new Error(updateError.message || 'Failed to accept invitation') };
      }

      // Refresh connections list
      await get().fetchConnections();

      set({ isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to accept invitation' });
      console.error('[ConnectionsStore] Exception accepting invitation:', error);
      return { error: error instanceof Error ? error : new Error('Failed to accept invitation') };
    }
  },

  declineInvitation: async (connectionId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { error: updateError } = await supabase
        .from('connections')
        .update({ status: 'declined' })
        .eq('id', connectionId);

      if (updateError) {
        set({ isLoading: false, error: updateError.message });
        return { error: new Error(updateError.message || 'Failed to decline invitation') };
      }

      await get().fetchConnections();
      set({ isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to decline invitation' });
      return { error: error instanceof Error ? error : new Error('Failed to decline invitation') };
    }
  },

  removeConnection: async (connectionId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { error: deleteError } = await supabase
        .from('connections')
        .delete()
        .eq('id', connectionId);

      if (deleteError) {
        set({ isLoading: false, error: deleteError.message });
        return { error: new Error(deleteError.message || 'Failed to remove connection') };
      }

      await get().fetchConnections();
      set({ isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to remove connection' });
      return { error: error instanceof Error ? error : new Error('Failed to remove connection') };
    }
  },

  blockConnection: async (connectionId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { error: updateError } = await supabase
        .from('connections')
        .update({ status: 'blocked' })
        .eq('id', connectionId);

      if (updateError) {
        set({ isLoading: false, error: updateError.message });
        return { error: new Error(updateError.message || 'Failed to block connection') };
      }

      await get().fetchConnections();
      set({ isLoading: false, error: null });
      return { error: null };
    } catch (error) {
      set({ isLoading: false, error: 'Failed to block connection' });
      return { error: error instanceof Error ? error : new Error('Failed to block connection') };
    }
  },

  getConnectionByToken: async (token: string) => {
    try {
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .eq('invitation_token', token)
        .single();

      if (error) {
        return { error: new Error(error.message || 'Connection not found'), connection: null };
      }

      return { error: null, connection: data };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to get connection'), connection: null };
    }
  },
}));

