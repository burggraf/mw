-- Add per-display tracking columns
-- Each physical monitor gets its own display_id based on EDID fingerprinting

-- Add new columns for per-display identification and hardware info
ALTER TABLE displays ADD COLUMN IF NOT EXISTS display_id TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS physical_width_cm INTEGER;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS physical_height_cm INTEGER;

-- Migrate existing records: set display_id = device_id for backward compatibility
UPDATE displays SET display_id = device_id WHERE display_id IS NULL;

-- Make display_id required (NOT NULL)
ALTER TABLE displays ALTER COLUMN display_id SET NOT NULL;

-- Add unique constraint on display_id (this is now the primary identifier for each display)
ALTER TABLE displays ADD CONSTRAINT displays_display_id_unique UNIQUE (display_id);

-- Remove unique constraint from device_id (multiple displays can belong to same device)
ALTER TABLE displays DROP CONSTRAINT IF EXISTS displays_device_id_key;

-- Add non-unique index on device_id for grouping queries
CREATE INDEX IF NOT EXISTS idx_displays_device_id ON displays(device_id);

-- Add index on display_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_displays_display_id ON displays(display_id);

-- Drop existing function first to allow parameter rename
DROP FUNCTION IF EXISTS update_display_connection(TEXT, TEXT, INTEGER);

-- Create updated function that uses display_id instead of device_id
CREATE OR REPLACE FUNCTION update_display_connection(
  p_display_id TEXT,
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
  WHERE display_id = p_display_id;

  -- Don't raise an error if no rows updated - the display might not be registered yet
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION update_display_connection(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION update_display_connection(TEXT, TEXT, INTEGER) TO authenticated;
