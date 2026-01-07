-- Add enabled column to displays table
-- Controls whether display windows should auto-open for this display

ALTER TABLE displays ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

-- Add index for queries filtering by enabled status
CREATE INDEX IF NOT EXISTS idx_displays_enabled ON displays(enabled) WHERE enabled = true;
