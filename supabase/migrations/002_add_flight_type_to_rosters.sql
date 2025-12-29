-- Add flight_type column to rosters table
-- This field indicates whether the flight is a 'Depart' or 'Return' flight

ALTER TABLE public.rosters
ADD COLUMN IF NOT EXISTS flight_type TEXT DEFAULT 'Depart' CHECK (flight_type IN ('Depart', 'Return'));

-- Add comment to column
COMMENT ON COLUMN public.rosters.flight_type IS 'Indicates whether the flight is a Depart or Return flight';

-- Create index for faster queries by flight type
CREATE INDEX IF NOT EXISTS rosters_flight_type_idx ON public.rosters(flight_type);

