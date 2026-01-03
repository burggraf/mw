-- Remove the stale device_id unique constraint
-- This was supposed to be removed in the per_display_tracking migration
-- but the constraint name was wrong (displays_device_id_key vs displays_device_id_unique)

ALTER TABLE displays DROP CONSTRAINT IF EXISTS displays_device_id_unique;

-- Verify only display_id unique constraint remains
-- (no action, just documentation)
