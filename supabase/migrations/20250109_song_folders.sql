-- ============================================================================
-- Song Folders Table
-- Stores folder organization for songs with church-scoped access control
-- ============================================================================

CREATE TABLE song_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add folder_id to songs table
ALTER TABLE songs ADD COLUMN folder_id UUID REFERENCES song_folders(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_song_folders_church_id ON song_folders(church_id);
CREATE INDEX idx_songs_folder_id ON songs(folder_id);

-- Enable Row Level Security
ALTER TABLE song_folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for song_folders
-- Users can view folders if they belong to the church
CREATE POLICY "Users can view song folders from their church"
  ON song_folders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = song_folders.church_id
      AND user_church_memberships.user_id = auth.uid()
    )
  );

-- Users can create folders for their churches
CREATE POLICY "Users can create song folders in their church"
  ON song_folders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = song_folders.church_id
      AND user_church_memberships.user_id = auth.uid()
      AND user_church_memberships.role IN ('admin', 'editor')
    )
  );

-- Users can update folders in their church
CREATE POLICY "Users can update song folders in their church"
  ON song_folders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = song_folders.church_id
      AND user_church_memberships.user_id = auth.uid()
      AND user_church_memberships.role IN ('admin', 'editor')
    )
  );

-- Users can delete folders in their church
CREATE POLICY "Users can delete song folders in their church"
  ON song_folders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = song_folders.church_id
      AND user_church_memberships.user_id = auth.uid()
      AND user_church_memberships.role IN ('admin', 'editor')
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER song_folders_updated_at
  BEFORE UPDATE ON song_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
