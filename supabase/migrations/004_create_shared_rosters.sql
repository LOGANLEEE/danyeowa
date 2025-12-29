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

