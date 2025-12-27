-- ============================================================================
-- Media Table
-- Stores images and videos for use as backgrounds
-- ============================================================================

CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,

    -- Core fields
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image', 'video')),
    mime_type TEXT NOT NULL,

    -- Storage references
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,

    -- Metadata
    file_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration INTEGER,  -- seconds, videos only

    -- Source tracking
    source TEXT NOT NULL DEFAULT 'upload',  -- 'upload', 'pexels', 'unsplash'
    source_id TEXT,
    source_url TEXT,

    -- Organization
    tags JSONB DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_media_church_id ON media(church_id);
CREATE INDEX idx_media_type ON media(church_id, type);
CREATE INDEX idx_media_source ON media(church_id, source);
CREATE INDEX idx_media_tags ON media USING GIN(tags);
CREATE INDEX idx_media_created ON media(church_id, created_at DESC);

-- Updated at trigger
CREATE TRIGGER media_updated_at
    BEFORE UPDATE ON media
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE media ENABLE ROW LEVEL SECURITY;

-- Users can view media in their churches
CREATE POLICY "Users can view media in their churches"
    ON media FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = media.church_id
            AND user_church_memberships.user_id = auth.uid()
        )
    );

-- Admins and Editors can create media
CREATE POLICY "Admins and Editors can create media"
    ON media FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = media.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Admins and Editors can update media
CREATE POLICY "Admins and Editors can update media"
    ON media FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = media.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Admins and Editors can delete media
CREATE POLICY "Admins and Editors can delete media"
    ON media FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = media.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );
