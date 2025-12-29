// Supabase types will be generated here when using Supabase CLI
// For now, this file serves as a placeholder for custom types

export type Database = {
  // Add your database types here when using Supabase CLI:
  // npx supabase gen types typescript --project-id <project-id> > lib/supabase/types.ts
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      rosters: {
        Row: {
          id: string;
          user_id: string;
          flight_code: string;
          route: string;
          origin: string | null;
          destination: string;
          flight_date: string;
          departure_time: string;
          arrival_time: string;
          aircraft_type: string | null;
          flight_type: 'Depart' | 'Return';
          status: 'Scheduled' | 'Confirmed' | 'Delayed' | 'Cancelled' | 'Completed';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          flight_code: string;
          route: string;
          origin?: string | null;
          destination: string;
          flight_date: string;
          departure_time: string;
          arrival_time: string;
          aircraft_type?: string | null;
          flight_type?: 'Depart' | 'Return';
          status?: 'Scheduled' | 'Confirmed' | 'Delayed' | 'Cancelled' | 'Completed';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          flight_code?: string;
          route?: string;
          origin?: string | null;
          destination?: string;
          flight_date?: string;
          departure_time?: string;
          arrival_time?: string;
          aircraft_type?: string | null;
          flight_type?: 'Depart' | 'Return';
          status?: 'Scheduled' | 'Confirmed' | 'Delayed' | 'Cancelled' | 'Completed';
          created_at?: string;
          updated_at?: string;
        };
      };
      connections: {
        Row: {
          id: string;
          user_id: string;
          connected_user_id: string;
          status: 'pending' | 'accepted' | 'blocked' | 'declined';
          role: 'family' | 'friend' | 'colleague';
          invited_by: string | null;
          invitation_token: string | null;
          invitation_method: 'email' | 'sms' | 'in_app' | 'link' | null;
          invitation_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          connected_user_id: string;
          status?: 'pending' | 'accepted' | 'blocked' | 'declined';
          role?: 'family' | 'friend' | 'colleague';
          invited_by?: string | null;
          invitation_token?: string | null;
          invitation_method?: 'email' | 'sms' | 'in_app' | 'link' | null;
          invitation_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          connected_user_id?: string;
          status?: 'pending' | 'accepted' | 'blocked' | 'declined';
          role?: 'family' | 'friend' | 'colleague';
          invited_by?: string | null;
          invitation_token?: string | null;
          invitation_method?: 'email' | 'sms' | 'in_app' | 'link' | null;
          invitation_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      shared_rosters: {
        Row: {
          id: string;
          roster_id: string;
          shared_with_user_id: string;
          shared_by_user_id: string;
          can_edit: boolean;
          share_type: 'single' | 'week' | 'month' | 'all_future';
          share_start_date: string | null;
          share_end_date: string | null;
          shared_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          roster_id: string;
          shared_with_user_id: string;
          shared_by_user_id: string;
          can_edit?: boolean;
          share_type?: 'single' | 'week' | 'month' | 'all_future';
          share_start_date?: string | null;
          share_end_date?: string | null;
          shared_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          roster_id?: string;
          shared_with_user_id?: string;
          shared_by_user_id?: string;
          can_edit?: boolean;
          share_type?: 'single' | 'week' | 'month' | 'all_future';
          share_start_date?: string | null;
          share_end_date?: string | null;
          shared_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'flight_departure' | 'flight_arrival' | 'flight_countdown' | 'roster_created' | 'roster_updated' | 'roster_deleted' | 'connection_request' | 'connection_accepted' | 'connection_declined' | 'roster_shared' | 'roster_unshared';
          title: string;
          body: string;
          data: Record<string, any>;
          read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'flight_departure' | 'flight_arrival' | 'flight_countdown' | 'roster_created' | 'roster_updated' | 'roster_deleted' | 'connection_request' | 'connection_accepted' | 'connection_declined' | 'roster_shared' | 'roster_unshared';
          title: string;
          body: string;
          data?: Record<string, any>;
          read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'flight_departure' | 'flight_arrival' | 'flight_countdown' | 'roster_created' | 'roster_updated' | 'roster_deleted' | 'connection_request' | 'connection_accepted' | 'connection_declined' | 'roster_shared' | 'roster_unshared';
          title?: string;
          body?: string;
          data?: Record<string, any>;
          read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
      };
      notification_preferences: {
        Row: {
          id: string;
          user_id: string;
          push_token: string | null;
          flight_departure_enabled: boolean;
          hours_before_departure: number[];
          flight_arrival_enabled: boolean;
          hours_before_arrival: number[];
          flight_countdown_enabled: boolean;
          countdown_interval_hours: number;
          roster_created_enabled: boolean;
          roster_updated_enabled: boolean;
          roster_deleted_enabled: boolean;
          connection_request_enabled: boolean;
          connection_accepted_enabled: boolean;
          connection_declined_enabled: boolean;
          roster_shared_enabled: boolean;
          roster_unshared_enabled: boolean;
          push_enabled: boolean;
          email_enabled: boolean;
          sms_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          push_token?: string | null;
          flight_departure_enabled?: boolean;
          hours_before_departure?: number[];
          flight_arrival_enabled?: boolean;
          hours_before_arrival?: number[];
          flight_countdown_enabled?: boolean;
          countdown_interval_hours?: number;
          roster_created_enabled?: boolean;
          roster_updated_enabled?: boolean;
          roster_deleted_enabled?: boolean;
          connection_request_enabled?: boolean;
          connection_accepted_enabled?: boolean;
          connection_declined_enabled?: boolean;
          roster_shared_enabled?: boolean;
          roster_unshared_enabled?: boolean;
          push_enabled?: boolean;
          email_enabled?: boolean;
          sms_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          push_token?: string | null;
          flight_departure_enabled?: boolean;
          hours_before_departure?: number[];
          flight_arrival_enabled?: boolean;
          hours_before_arrival?: number[];
          flight_countdown_enabled?: boolean;
          countdown_interval_hours?: number;
          roster_created_enabled?: boolean;
          roster_updated_enabled?: boolean;
          roster_deleted_enabled?: boolean;
          connection_request_enabled?: boolean;
          connection_accepted_enabled?: boolean;
          connection_declined_enabled?: boolean;
          roster_shared_enabled?: boolean;
          roster_unshared_enabled?: boolean;
          push_enabled?: boolean;
          email_enabled?: boolean;
          sms_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

// Profile type for use in the app
export type Profile = Database['public']['Tables']['profiles']['Row'];

// Roster type for use in the app
export type Roster = Database['public']['Tables']['rosters']['Row'];

// Connection type for use in the app
export type Connection = Database['public']['Tables']['connections']['Row'];

// SharedRoster type for use in the app
export type SharedRoster = Database['public']['Tables']['shared_rosters']['Row'];

// Notification type for use in the app
export type Notification = Database['public']['Tables']['notifications']['Row'];

// NotificationPreferences type for use in the app
export type NotificationPreferences = Database['public']['Tables']['notification_preferences']['Row'];
