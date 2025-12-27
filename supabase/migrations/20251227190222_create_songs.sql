-- ============================================================================
-- Songs Table
-- Stores worship songs with markdown content and extracted metadata
-- ============================================================================

CREATE TABLE songs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,

    -- Extracted from frontmatter (for querying/listing)
    title TEXT NOT NULL,
    author TEXT,
    copyright_info TEXT,
    ccli_number TEXT,

    -- The full markdown (source of truth for lyrics)
    content TEXT NOT NULL,

    -- Named arrangements: {"default": ["verse-1", "chorus"], "short": ["verse-1"]}
    arrangements JSONB NOT NULL DEFAULT '{"default": []}',

    -- Background references by context: {"default": "uuid", "stage": "uuid", "christmas": "uuid"}
    backgrounds JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_songs_church_id ON songs(church_id);
CREATE INDEX idx_songs_title ON songs(church_id, title);
CREATE INDEX idx_songs_ccli ON songs(ccli_number) WHERE ccli_number IS NOT NULL;

-- Updated at trigger
CREATE TRIGGER songs_updated_at
    BEFORE UPDATE ON songs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

-- Users can view songs in churches they belong to
CREATE POLICY "Users can view songs in their churches"
    ON songs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = songs.church_id
            AND user_church_memberships.user_id = auth.uid()
        )
    );

-- Admins and Editors can create songs
CREATE POLICY "Admins and Editors can create songs"
    ON songs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = songs.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Admins and Editors can update songs
CREATE POLICY "Admins and Editors can update songs"
    ON songs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = songs.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Admins and Editors can delete songs
CREATE POLICY "Admins and Editors can delete songs"
    ON songs FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = songs.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );
