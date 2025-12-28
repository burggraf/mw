-- ============================================================================
-- Styles Table
-- Stores text styles for worship content display
-- Built-in styles have church_id = NULL and is_builtin = true
-- ============================================================================

CREATE TABLE styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    church_id UUID REFERENCES churches(id) ON DELETE CASCADE,

    -- Metadata
    name TEXT NOT NULL,
    description TEXT,
    is_builtin BOOLEAN NOT NULL DEFAULT false,

    -- Base font (shared across variants)
    font_family TEXT NOT NULL DEFAULT 'Inter',

    -- Variant-specific properties stored as JSONB
    -- Structure: { "audience": {...}, "stage": {...}, "lobby": {...} }
    variants JSONB NOT NULL DEFAULT '{}',

    -- Preview thumbnail (optional)
    preview_image_path TEXT,

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

-- Everyone can view built-in styles
CREATE POLICY "Everyone can view built-in styles"
    ON styles FOR SELECT
    USING (is_builtin = true);

-- Users can view styles in their churches
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

-- Admins and Editors can create custom styles
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

-- Admins and Editors can update their church's custom styles
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

-- Admins and Editors can delete their church's custom styles
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
-- Insert Built-in Default Styles
-- ============================================================================

INSERT INTO styles (id, church_id, name, description, is_builtin, font_family, variants) VALUES
-- Style 1: Classic
(
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'Classic',
    'Traditional, elegant style with serif font',
    true,
    'Georgia',
    '{
        "audience": {
            "fontSize": "3rem",
            "fontWeight": "400",
            "lineHeight": "1.5",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "0 2px 4px rgba(0,0,0,0.6)",
            "backgroundOverlay": 0.35,
            "showSectionLabel": true,
            "showCopyright": true
        },
        "stage": {
            "fontSize": "4.5rem",
            "fontWeight": "400",
            "lineHeight": "1.4",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "none",
            "backgroundOverlay": 0,
            "showSectionLabel": true,
            "showCopyright": false
        },
        "lobby": {
            "fontSize": "2.5rem",
            "fontWeight": "400",
            "lineHeight": "1.6",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "lower",
            "textShadow": "0 2px 8px rgba(0,0,0,0.8)",
            "backgroundOverlay": 0.5,
            "showSectionLabel": false,
            "showCopyright": true
        }
    }'::jsonb
),
-- Style 2: Modern (Default)
(
    'a0000000-0000-0000-0000-000000000002',
    NULL,
    'Modern',
    'Clean, contemporary sans-serif style',
    true,
    'Inter',
    '{
        "audience": {
            "fontSize": "3.25rem",
            "fontWeight": "600",
            "lineHeight": "1.4",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "0 4px 12px rgba(0,0,0,0.5)",
            "backgroundOverlay": 0.3,
            "showSectionLabel": true,
            "showCopyright": true
        },
        "stage": {
            "fontSize": "4.5rem",
            "fontWeight": "700",
            "lineHeight": "1.3",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "none",
            "backgroundOverlay": 0,
            "showSectionLabel": true,
            "showCopyright": false
        },
        "lobby": {
            "fontSize": "2.75rem",
            "fontWeight": "500",
            "lineHeight": "1.5",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "lower",
            "textShadow": "0 2px 8px rgba(0,0,0,0.6)",
            "backgroundOverlay": 0.45,
            "showSectionLabel": false,
            "showCopyright": true
        }
    }'::jsonb
),
-- Style 3: Bold
(
    'a0000000-0000-0000-0000-000000000003',
    NULL,
    'Bold',
    'High impact style with strong text presence',
    true,
    'Inter',
    '{
        "audience": {
            "fontSize": "3.5rem",
            "fontWeight": "800",
            "lineHeight": "1.3",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "0 4px 16px rgba(0,0,0,0.7)",
            "backgroundOverlay": 0.4,
            "showSectionLabel": true,
            "showCopyright": true
        },
        "stage": {
            "fontSize": "5rem",
            "fontWeight": "900",
            "lineHeight": "1.2",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "none",
            "backgroundOverlay": 0,
            "showSectionLabel": true,
            "showCopyright": false
        },
        "lobby": {
            "fontSize": "3rem",
            "fontWeight": "700",
            "lineHeight": "1.4",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "lower",
            "textShadow": "0 3px 10px rgba(0,0,0,0.8)",
            "backgroundOverlay": 0.5,
            "showSectionLabel": false,
            "showCopyright": true
        }
    }'::jsonb
),
-- Style 4: Minimal
(
    'a0000000-0000-0000-0000-000000000004',
    NULL,
    'Minimal',
    'Simple, understated style with focus on lyrics',
    true,
    'Inter',
    '{
        "audience": {
            "fontSize": "2.75rem",
            "fontWeight": "400",
            "lineHeight": "1.6",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "0 1px 3px rgba(0,0,0,0.4)",
            "backgroundOverlay": 0.25,
            "showSectionLabel": false,
            "showCopyright": true
        },
        "stage": {
            "fontSize": "4rem",
            "fontWeight": "500",
            "lineHeight": "1.4",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "none",
            "backgroundOverlay": 0,
            "showSectionLabel": false,
            "showCopyright": false
        },
        "lobby": {
            "fontSize": "2.25rem",
            "fontWeight": "400",
            "lineHeight": "1.7",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "0 1px 4px rgba(0,0,0,0.5)",
            "backgroundOverlay": 0.35,
            "showSectionLabel": false,
            "showCopyright": true
        }
    }'::jsonb
),
-- Style 5: Lower Third
(
    'a0000000-0000-0000-0000-000000000005',
    NULL,
    'Lower Third',
    'Text positioned at the bottom for cinematic feel',
    true,
    'Inter',
    '{
        "audience": {
            "fontSize": "2.5rem",
            "fontWeight": "500",
            "lineHeight": "1.5",
            "textColor": "#ffffff",
            "textAlign": "left",
            "verticalPosition": "lower",
            "textShadow": "0 2px 6px rgba(0,0,0,0.6)",
            "backgroundOverlay": 0.2,
            "showSectionLabel": false,
            "showCopyright": true
        },
        "stage": {
            "fontSize": "4rem",
            "fontWeight": "600",
            "lineHeight": "1.3",
            "textColor": "#ffffff",
            "textAlign": "center",
            "verticalPosition": "center",
            "textShadow": "none",
            "backgroundOverlay": 0,
            "showSectionLabel": true,
            "showCopyright": false
        },
        "lobby": {
            "fontSize": "2.25rem",
            "fontWeight": "500",
            "lineHeight": "1.6",
            "textColor": "#ffffff",
            "textAlign": "left",
            "verticalPosition": "lower",
            "textShadow": "0 2px 8px rgba(0,0,0,0.7)",
            "backgroundOverlay": 0.4,
            "showSectionLabel": false,
            "showCopyright": true
        }
    }'::jsonb
);
