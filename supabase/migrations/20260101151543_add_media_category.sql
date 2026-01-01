-- ============================================================================
-- Add category column to media table
-- Distinguishes between backgrounds (behind lyrics) and slides (standalone content)
-- ============================================================================

-- Add category column with default 'background' for existing records
ALTER TABLE media
ADD COLUMN category TEXT NOT NULL DEFAULT 'background'
CHECK (category IN ('background', 'slide'));

-- Add index for efficient filtering by category
CREATE INDEX idx_media_category ON media(church_id, category);

-- Update the comment on the table to reflect the new dual purpose
COMMENT ON TABLE media IS 'Stores images and videos for use as backgrounds (behind lyrics) or slides (standalone content like announcements, welcome screens, etc.)';
COMMENT ON COLUMN media.category IS 'Type of media: background (displayed behind lyrics) or slide (standalone content)';
