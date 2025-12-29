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

