-- Add style reference and solid color support to media
ALTER TABLE media
ADD COLUMN style_id UUID REFERENCES styles(id) ON DELETE SET NULL,
ADD COLUMN background_color TEXT;

-- Index for style lookups
CREATE INDEX idx_media_style_id ON media(style_id);

-- Update type enum to include 'color' (if needed later)
-- For now, solid colors will have type='image', storagePath=null, background_color set
