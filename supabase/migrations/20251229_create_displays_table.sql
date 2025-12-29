-- Create displays table for church-scoped display registration
CREATE TABLE displays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,

  -- Registration info
  pairing_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT,
  display_class TEXT NOT NULL DEFAULT 'audience' CHECK (display_class IN ('audience', 'stage', 'lobby')),

  -- Device identification
  device_id TEXT,

  -- Status tracking
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE displays ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view displays for their church"
  ON displays FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = displays.church_id
      AND user_church_memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert displays for their church"
  ON displays FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = displays.church_id
      AND user_church_memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update displays for their church"
  ON displays FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = displays.church_id
      AND user_church_memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete displays for their church"
  ON displays FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = displays.church_id
      AND user_church_memberships.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_displays_pairing_code ON displays(pairing_code);
CREATE INDEX idx_displays_church_id ON displays(church_id);
CREATE INDEX idx_displays_last_seen ON displays(last_seen_at);

-- Trigger to auto-update updated_at
CREATE TRIGGER displays_updated_at
    BEFORE UPDATE ON displays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
