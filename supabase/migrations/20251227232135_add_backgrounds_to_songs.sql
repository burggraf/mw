-- Add display class background references to songs
ALTER TABLE songs
ADD COLUMN audience_background_id UUID REFERENCES media(id) ON DELETE SET NULL,
ADD COLUMN stage_background_id UUID REFERENCES media(id) ON DELETE SET NULL,
ADD COLUMN lobby_background_id UUID REFERENCES media(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_songs_audience_bg ON songs(audience_background_id);
CREATE INDEX idx_songs_stage_bg ON songs(stage_background_id);
CREATE INDEX idx_songs_lobby_bg ON songs(lobby_background_id);
