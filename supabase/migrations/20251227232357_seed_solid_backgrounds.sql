-- Create built-in solid color backgrounds
-- These are "system" media items with no church_id

-- First, we need to allow NULL values for church_id and storage_path
-- for system/built-in media items (like solid color backgrounds)
ALTER TABLE media ALTER COLUMN church_id DROP NOT NULL;
ALTER TABLE media ALTER COLUMN storage_path DROP NOT NULL;

-- Black background with "Centered White" style
INSERT INTO media (id, church_id, name, type, mime_type, storage_path, file_size, source, style_id, background_color)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    NULL,
    'Black',
    'image',
    'application/x-color',
    NULL,
    0,
    'upload',
    'b0000000-0000-0000-0000-000000000001',
    '#000000'
);

-- White background with "Centered Black" style
INSERT INTO media (id, church_id, name, type, mime_type, storage_path, file_size, source, style_id, background_color)
VALUES (
    'c0000000-0000-0000-0000-000000000002',
    NULL,
    'White',
    'image',
    'application/x-color',
    NULL,
    0,
    'upload',
    'b0000000-0000-0000-0000-000000000002',
    '#FFFFFF'
);

-- Add RLS policy for built-in media
CREATE POLICY "Everyone can view built-in media"
    ON media FOR SELECT
    USING (church_id IS NULL);
