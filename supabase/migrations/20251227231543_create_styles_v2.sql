-- ============================================================================
-- Styles V2 Table
-- Standalone styles with bounding box positioning and max lines
-- ============================================================================

CREATE TABLE styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    church_id UUID REFERENCES churches(id) ON DELETE CASCADE,

    -- Metadata
    name TEXT NOT NULL,
    description TEXT,
    is_builtin BOOLEAN NOT NULL DEFAULT false,

    -- Font settings
    font_family TEXT NOT NULL DEFAULT 'Inter',
    font_size TEXT NOT NULL DEFAULT '3rem',
    font_weight TEXT NOT NULL DEFAULT '500',
    text_color TEXT NOT NULL DEFAULT '#ffffff',

    -- Bounding box (percentages 0-100)
    text_box_left NUMERIC NOT NULL DEFAULT 10,
    text_box_top NUMERIC NOT NULL DEFAULT 10,
    text_box_width NUMERIC NOT NULL DEFAULT 80,
    text_box_height NUMERIC NOT NULL DEFAULT 80,

    -- Alignment within bounding box
    text_align TEXT NOT NULL DEFAULT 'center',
    vertical_align TEXT NOT NULL DEFAULT 'center',

    -- Chunking
    max_lines INTEGER NOT NULL DEFAULT 4,

    -- Effects
    line_height TEXT NOT NULL DEFAULT '1.4',
    text_shadow TEXT DEFAULT '0 2px 4px rgba(0,0,0,0.5)',
    background_overlay NUMERIC NOT NULL DEFAULT 0.3,

    -- Display options
    show_section_label BOOLEAN NOT NULL DEFAULT true,
    show_copyright BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_styles_church_id ON styles(church_id);
CREATE INDEX idx_styles_builtin ON styles(is_builtin) WHERE is_builtin = true;

-- Updated at trigger
CREATE TRIGGER styles_updated_at
    BEFORE UPDATE ON styles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE styles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view built-in styles"
    ON styles FOR SELECT
    USING (is_builtin = true);

CREATE POLICY "Users can view styles in their churches"
    ON styles FOR SELECT
    USING (
        church_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = styles.church_id
            AND user_church_memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Admins and Editors can create styles"
    ON styles FOR INSERT
    WITH CHECK (
        is_builtin = false AND
        church_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = styles.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

CREATE POLICY "Admins and Editors can update styles"
    ON styles FOR UPDATE
    USING (
        is_builtin = false AND
        church_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = styles.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

CREATE POLICY "Admins and Editors can delete styles"
    ON styles FOR DELETE
    USING (
        is_builtin = false AND
        church_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = styles.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role IN ('admin', 'editor')
        )
    );

-- ============================================================================
-- Built-in Default Styles
-- ============================================================================

INSERT INTO styles (id, church_id, name, description, is_builtin, font_family, font_size, font_weight, text_color, text_box_left, text_box_top, text_box_width, text_box_height, text_align, vertical_align, max_lines, line_height, text_shadow, background_overlay, show_section_label, show_copyright) VALUES
-- Black background style (white text, centered, no overlay)
(
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    'Centered White',
    'White text centered on dark backgrounds',
    true,
    'Inter',
    '3.5rem',
    '600',
    '#ffffff',
    10, 10, 80, 80,
    'center',
    'center',
    4,
    '1.4',
    '0 2px 8px rgba(0,0,0,0.8)',
    0,
    true,
    true
),
-- White background style (black text, centered, no overlay)
(
    'b0000000-0000-0000-0000-000000000002',
    NULL,
    'Centered Black',
    'Black text centered on light backgrounds',
    true,
    'Inter',
    '3.5rem',
    '600',
    '#000000',
    10, 10, 80, 80,
    'center',
    'center',
    4,
    '1.4',
    'none',
    0,
    true,
    true
),
-- Lower third style
(
    'b0000000-0000-0000-0000-000000000003',
    NULL,
    'Lower Third',
    'Text positioned in lower third of screen',
    true,
    'Inter',
    '2.5rem',
    '500',
    '#ffffff',
    5, 65, 90, 30,
    'left',
    'top',
    2,
    '1.3',
    '0 2px 6px rgba(0,0,0,0.7)',
    0.3,
    false,
    true
),
-- Large stage style (for confidence monitors)
(
    'b0000000-0000-0000-0000-000000000004',
    NULL,
    'Large Stage',
    'Extra large text for stage monitors',
    true,
    'Inter',
    '5rem',
    '700',
    '#ffffff',
    5, 5, 90, 90,
    'center',
    'center',
    2,
    '1.2',
    'none',
    0,
    true,
    false
);
