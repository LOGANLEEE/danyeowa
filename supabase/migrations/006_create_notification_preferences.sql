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

