-- Allow displays to update their own connection info without authentication
-- This uses a database function with SECURITY DEFINER to bypass RLS

-- Create a function that displays can call to update their connection info
-- The function is SECURITY DEFINER so it runs with elevated privileges
CREATE OR REPLACE FUNCTION update_display_connection(
  p_device_id TEXT,
  p_host TEXT,
  p_port INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE displays
  SET
    host = p_host,
    port = p_port,
    is_online = true,
    last_seen_at = NOW()
  WHERE device_id = p_device_id;

  -- Don't raise an error if no rows updated - the display might not be registered yet
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION update_display_connection(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION update_display_connection(TEXT, TEXT, INTEGER) TO authenticated;
