-- ============================================================================
-- Add style reference to songs table
-- Songs can reference a default style and override per display class
-- ============================================================================

-- Add style_id column (references the default style for this song)
ALTER TABLE songs
ADD COLUMN style_id UUID REFERENCES styles(id) ON DELETE SET NULL;

-- Add styles JSONB for context-specific style overrides
-- Structure: {"audience": "uuid", "stage": "uuid", "lobby": "uuid"}
-- Similar pattern to backgrounds
ALTER TABLE songs
ADD COLUMN styles JSONB NOT NULL DEFAULT '{}';

-- Set default style for existing songs (Modern style)
UPDATE songs SET style_id = 'a0000000-0000-0000-0000-000000000002' WHERE style_id IS NULL;

-- Index for style lookups
CREATE INDEX idx_songs_style_id ON songs(style_id);
