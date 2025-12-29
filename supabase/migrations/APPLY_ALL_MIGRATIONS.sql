-- ============================================
-- ROASTER ME - ALL MIGRATIONS (003-008)
-- Apply this file in Supabase SQL Editor
-- ============================================
-- 
-- This file combines all new migrations for social features:
-- - Connections (user relationships)
-- - Shared Rosters (roster sharing)
-- - Notifications (notification history)
-- - Notification Preferences (user settings)
-- - Connection Limits (5 max connections)
-- - RLS Updates (shared roster access)
--
-- Run this in order, or apply individual migration files
-- ============================================

-- ============================================
-- MIGRATION 003: Create Connections Table
-- ============================================
-- Create connections table
-- Tracks relationships between users (cabin crew and family/friends)
-- Supports invitation system with tokens

CREATE TABLE IF NOT EXISTS public.connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connected_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked', 'declined')) NOT NULL,
  role TEXT DEFAULT 'friend' CHECK (role IN ('family', 'friend', 'colleague')) NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invitation_token TEXT UNIQUE,
  invitation_method TEXT CHECK (invitation_method IN ('email', 'sms', 'in_app', 'link')),
  invitation_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  
  -- Ensure unique connection between two users
  CONSTRAINT unique_connection UNIQUE (user_id, connected_user_id),
  -- Ensure user cannot connect to themselves
  CONSTRAINT no_self_connection CHECK (user_id != connected_user_id)
);

-- Enable Row Level Security
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS connections_user_id_idx ON public.connections(user_id);
CREATE INDEX IF NOT EXISTS connections_connected_user_id_idx ON public.connections(connected_user_id);
CREATE INDEX IF NOT EXISTS connections_status_idx ON public.connections(status);
CREATE INDEX IF NOT EXISTS connections_invitation_token_idx ON public.connections(invitation_token) WHERE invitation_token IS NOT NULL;

-- RLS Policies

-- Users can view connections where they are involved (as user or connected_user)
CREATE POLICY "Users can view own connections"
  ON public.connections
  FOR SELECT
  USING (
    auth.uid() = user_id OR 
    auth.uid() = connected_user_id
  );

-- Users can create connections (send invitations)
CREATE POLICY "Users can create connections"
  ON public.connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update connections they received (accept/decline)
CREATE POLICY "Users can update received connections"
  ON public.connections
  FOR UPDATE
  USING (auth.uid() = connected_user_id)
  WITH CHECK (auth.uid() = connected_user_id);

-- Users can delete connections they created
CREATE POLICY "Users can delete own connections"
  ON public.connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on connection updates
CREATE TRIGGER on_connection_updated
  BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_connections_updated_at();

-- Add comment
COMMENT ON TABLE public.connections IS 'Tracks relationships between users (cabin crew and family/friends) with invitation system';

-- ============================================
-- MIGRATION 004: Create Shared Rosters Table
-- ============================================
-- Create shared_rosters table
-- Tracks which rosters are shared with which users
-- Supports granular sharing (per-roster, week-based, month-based)

CREATE TABLE IF NOT EXISTS public.shared_rosters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  roster_id UUID REFERENCES public.rosters(id) ON DELETE CASCADE NOT NULL,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  shared_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  can_edit BOOLEAN DEFAULT false NOT NULL,
  share_type TEXT DEFAULT 'single' CHECK (share_type IN ('single', 'week', 'month', 'all_future')) NOT NULL,
  share_start_date DATE, -- For week/month sharing
  share_end_date DATE,   -- For week/month sharing
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  
  -- Ensure unique sharing relationship per roster
  CONSTRAINT unique_shared_roster UNIQUE (roster_id, shared_with_user_id)
);

-- Enable Row Level Security
ALTER TABLE public.shared_rosters ENABLE ROW LEVEL SECURITY;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS shared_rosters_roster_id_idx ON public.shared_rosters(roster_id);
CREATE INDEX IF NOT EXISTS shared_rosters_shared_with_user_id_idx ON public.shared_rosters(shared_with_user_id);
CREATE INDEX IF NOT EXISTS shared_rosters_shared_by_user_id_idx ON public.shared_rosters(shared_by_user_id);
CREATE INDEX IF NOT EXISTS shared_rosters_share_type_idx ON public.shared_rosters(share_type);
CREATE INDEX IF NOT EXISTS shared_rosters_date_range_idx ON public.shared_rosters(share_start_date, share_end_date) WHERE share_start_date IS NOT NULL;

-- RLS Policies

-- Users can view rosters shared with them
CREATE POLICY "Users can view rosters shared with them"
  ON public.shared_rosters
  FOR SELECT
  USING (auth.uid() = shared_with_user_id);

-- Users can view sharing records for their own rosters
CREATE POLICY "Users can view sharing of own rosters"
  ON public.shared_rosters
  FOR SELECT
  USING (
    auth.uid() = shared_by_user_id OR
    auth.uid() IN (SELECT user_id FROM public.rosters WHERE id = roster_id)
  );

-- Users can share their own rosters
CREATE POLICY "Users can share own rosters"
  ON public.shared_rosters
  FOR INSERT
  WITH CHECK (
    auth.uid() = shared_by_user_id AND
    auth.uid() IN (SELECT user_id FROM public.rosters WHERE id = roster_id)
  );

-- Users can update sharing settings for their own rosters
CREATE POLICY "Users can update sharing of own rosters"
  ON public.shared_rosters
  FOR UPDATE
  USING (
    auth.uid() = shared_by_user_id OR
    auth.uid() IN (SELECT user_id FROM public.rosters WHERE id = roster_id)
  );

-- Users can unshare their own rosters
CREATE POLICY "Users can unshare own rosters"
  ON public.shared_rosters
  FOR DELETE
  USING (
    auth.uid() = shared_by_user_id OR
    auth.uid() IN (SELECT user_id FROM public.rosters WHERE id = roster_id)
  );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_shared_rosters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on shared_rosters updates
CREATE TRIGGER on_shared_roster_updated
  BEFORE UPDATE ON public.shared_rosters
  FOR EACH ROW EXECUTE FUNCTION public.handle_shared_rosters_updated_at();

-- Add comment
COMMENT ON TABLE public.shared_rosters IS 'Tracks which rosters are shared with which users, supporting granular sharing options';

-- ============================================
-- MIGRATION 005: Create Notifications Table
-- ============================================
-- Create notifications table
-- Stores notification history and in-app notifications

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'flight_departure',
    'flight_arrival',
    'flight_countdown',
    'roster_created',
    'roster_updated',
    'roster_deleted',
    'connection_request',
    'connection_accepted',
    'connection_declined',
    'roster_shared',
    'roster_unshared'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb, -- Additional notification data (roster_id, connection_id, etc.)
  read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_type_idx ON public.notifications(type);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON public.notifications(read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, read, created_at DESC) WHERE read = false;

-- RLS Policies

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- System can create notifications (via service role or function)
-- For now, we'll allow users to create notifications for themselves (for testing)
-- In production, this should be done via database functions/triggers
CREATE POLICY "Users can create own notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to mark notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(notification_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.notifications
  SET read = true, read_at = TIMEZONE('utc', NOW())
  WHERE id = notification_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void AS $$
BEGIN
  UPDATE public.notifications
  SET read = true, read_at = TIMEZONE('utc', NOW())
  WHERE user_id = auth.uid() AND read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON TABLE public.notifications IS 'Stores notification history and in-app notifications for users';

-- ============================================
-- MIGRATION 006: Create Notification Preferences Table
-- ============================================
-- Create notification_preferences table
-- Stores user preferences for notification types and timing

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  
  -- Push notification token (Expo push token)
  push_token TEXT,
  
  -- Flight departure notifications
  flight_departure_enabled BOOLEAN DEFAULT true NOT NULL,
  hours_before_departure INTEGER[] DEFAULT ARRAY[3, 1] NOT NULL, -- Array of hours before departure to notify
  
  -- Flight arrival notifications
  flight_arrival_enabled BOOLEAN DEFAULT true NOT NULL,
  hours_before_arrival INTEGER[] DEFAULT ARRAY[3, 1] NOT NULL, -- Array of hours before arrival to notify
  
  -- Flight countdown notifications (every X hours)
  flight_countdown_enabled BOOLEAN DEFAULT true NOT NULL,
  countdown_interval_hours INTEGER DEFAULT 3 NOT NULL, -- Notify every 3 hours for active flights
  
  -- Roster update notifications
  roster_created_enabled BOOLEAN DEFAULT true NOT NULL,
  roster_updated_enabled BOOLEAN DEFAULT true NOT NULL,
  roster_deleted_enabled BOOLEAN DEFAULT true NOT NULL,
  
  -- Connection notifications
  connection_request_enabled BOOLEAN DEFAULT true NOT NULL,
  connection_accepted_enabled BOOLEAN DEFAULT true NOT NULL,
  connection_declined_enabled BOOLEAN DEFAULT false NOT NULL,
  
  -- Sharing notifications
  roster_shared_enabled BOOLEAN DEFAULT true NOT NULL,
  roster_unshared_enabled BOOLEAN DEFAULT false NOT NULL,
  
  -- Global settings
  push_enabled BOOLEAN DEFAULT true NOT NULL,
  email_enabled BOOLEAN DEFAULT false NOT NULL,
  sms_enabled BOOLEAN DEFAULT false NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS notification_preferences_push_token_idx ON public.notification_preferences(push_token) WHERE push_token IS NOT NULL;

-- RLS Policies

-- Users can only view their own preferences
CREATE POLICY "Users can view own notification preferences"
  ON public.notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own preferences
CREATE POLICY "Users can create own notification preferences"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own notification preferences"
  ON public.notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to automatically create default preferences on user signup
CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to create default preferences when profile is created
CREATE TRIGGER on_profile_created_notification_prefs
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_preferences();

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on notification_preferences updates
CREATE TRIGGER on_notification_preferences_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_notification_preferences_updated_at();

-- Add comment
COMMENT ON TABLE public.notification_preferences IS 'Stores user preferences for notification types, timing, and delivery methods';

-- ============================================
-- MIGRATION 007: Add Connection Limits
-- ============================================
-- Add connection limit constraint
-- Enforces maximum of 5 connections per user

-- Create function to check connection limit
CREATE OR REPLACE FUNCTION public.check_connection_limit()
RETURNS TRIGGER AS $$
DECLARE
  connection_count INTEGER;
  max_connections INTEGER := 5;
BEGIN
  -- Count existing accepted connections for the user
  SELECT COUNT(*) INTO connection_count
  FROM public.connections
  WHERE (user_id = NEW.user_id OR connected_user_id = NEW.user_id)
    AND status = 'accepted';
  
  -- If adding a new connection would exceed limit, raise error
  IF connection_count >= max_connections THEN
    RAISE EXCEPTION 'Connection limit reached. Maximum of % connections allowed.', max_connections;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to check connection limit before insert
CREATE TRIGGER check_connection_limit_before_insert
  BEFORE INSERT ON public.connections
  FOR EACH ROW
  WHEN (NEW.status = 'accepted')
  EXECUTE FUNCTION public.check_connection_limit();

-- Also check when status changes to accepted
CREATE TRIGGER check_connection_limit_before_update
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  WHEN (OLD.status != 'accepted' AND NEW.status = 'accepted')
  EXECUTE FUNCTION public.check_connection_limit();

-- Add comment
COMMENT ON FUNCTION public.check_connection_limit() IS 'Enforces maximum of 5 accepted connections per user';

-- ============================================
-- MIGRATION 008: Update Rosters RLS for Sharing
-- ============================================
-- Update rosters RLS policies to allow viewing shared rosters
-- This enables users to see rosters that have been shared with them

-- Drop existing select policy (we'll create a new one that includes shared rosters)
DROP POLICY IF EXISTS "Users can view own rosters" ON public.rosters;

-- Create new policy that allows users to view:
-- 1. Their own rosters
-- 2. Rosters shared with them
CREATE POLICY "Users can view own and shared rosters"
  ON public.rosters
  FOR SELECT
  USING (
    -- User owns the roster
    auth.uid() = user_id OR
    -- Roster is shared with the user
    id IN (
      SELECT roster_id 
      FROM public.shared_rosters 
      WHERE shared_with_user_id = auth.uid()
    )
  );

-- Add comment
COMMENT ON POLICY "Users can view own and shared rosters" ON public.rosters IS 
  'Allows users to view their own rosters and rosters shared with them via shared_rosters table';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- All migrations have been applied successfully!
-- 
-- Next steps:
-- 1. Verify tables were created: Check Supabase Table Editor
-- 2. Test RLS policies: Try querying as different users
-- 3. Test triggers: Create a connection and verify limit enforcement
-- 4. Test functions: Call mark_all_notifications_read() as a user
-- ============================================

