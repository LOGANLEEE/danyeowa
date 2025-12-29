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

