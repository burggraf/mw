-- ============================================================================
-- Events Table
-- Scheduled worship services or gatherings
-- ============================================================================

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,

    -- Event details
    name TEXT NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_church_id ON events(church_id);
CREATE INDEX idx_events_scheduled ON events(church_id, scheduled_at DESC);

-- Updated at trigger
CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Event Items Table
-- Ordered list of songs, media, etc. within an event
-- ============================================================================

CREATE TABLE event_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,

    -- Ordering
    position INTEGER NOT NULL DEFAULT 0,

    -- Item reference (polymorphic - references songs, media, etc.)
    item_type TEXT NOT NULL CHECK (item_type IN ('song', 'media', 'scripture', 'deck')),
    item_id UUID NOT NULL,

    -- Event-specific customizations (overrides item defaults)
    customizations JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_event_items_event_id ON event_items(event_id);
CREATE INDEX idx_event_items_position ON event_items(event_id, position);

-- Updated at trigger
CREATE TRIGGER event_items_updated_at
    BEFORE UPDATE ON event_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_items ENABLE ROW LEVEL SECURITY;

-- Events: Users can view events in their churches
CREATE POLICY "Users can view events in their churches"
    ON events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = events.church_id
            AND user_church_memberships.user_id = auth.uid()
        )
    );

-- Events: Admins and Editors can create
CREATE POLICY "Admins and Editors can create events"
    ON events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = events.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Events: Admins and Editors can update
CREATE POLICY "Admins and Editors can update events"
    ON events FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = events.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Events: Admins and Editors can delete
CREATE POLICY "Admins and Editors can delete events"
    ON events FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = events.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Event Items: Users can view items in events they can access
CREATE POLICY "Users can view event items"
    ON event_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM events
            JOIN user_church_memberships ON user_church_memberships.church_id = events.church_id
            WHERE events.id = event_items.event_id
            AND user_church_memberships.user_id = auth.uid()
        )
    );

-- Event Items: Admins and Editors can create
CREATE POLICY "Admins and Editors can create event items"
    ON event_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM events
            JOIN user_church_memberships ON user_church_memberships.church_id = events.church_id
            WHERE events.id = event_items.event_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Event Items: Admins and Editors can update
CREATE POLICY "Admins and Editors can update event items"
    ON event_items FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM events
            JOIN user_church_memberships ON user_church_memberships.church_id = events.church_id
            WHERE events.id = event_items.event_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- Event Items: Admins and Editors can delete
CREATE POLICY "Admins and Editors can delete event items"
    ON event_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM events
            JOIN user_church_memberships ON user_church_memberships.church_id = events.church_id
            WHERE events.id = event_items.event_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );
