-- Update displays table for auto-discovery workflow
-- Remove pairing_code (no longer needed), make device_id unique and required
-- Add connection info (host, port) for WebSocket communication

-- First, drop existing pairing code index since we're removing the column
DROP INDEX IF EXISTS idx_displays_pairing_code;

-- Remove pairing_code column (no longer needed with auto-discovery)
ALTER TABLE displays DROP COLUMN IF EXISTS pairing_code;

-- Make device_id required and unique (this is the display's self-generated UUID)
ALTER TABLE displays ALTER COLUMN device_id SET NOT NULL;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'displays_device_id_unique'
  ) THEN
    ALTER TABLE displays ADD CONSTRAINT displays_device_id_unique UNIQUE (device_id);
  END IF;
END $$;

-- Add connection info for WebSocket communication
ALTER TABLE displays ADD COLUMN IF NOT EXISTS host TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS port INTEGER;

-- Add index on device_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_displays_device_id ON displays(device_id);
