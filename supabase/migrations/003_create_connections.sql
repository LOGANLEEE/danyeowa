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

