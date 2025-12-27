-- ============================================================================
-- Update Media Storage Bucket Policies
-- Add proper multi-tenant isolation and role-based access
-- ============================================================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Allow authenticated uploads to media" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads from media" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from media" ON storage.objects;

-- Policy: Church members can view media in their churches
-- Path structure: {church_id}/originals/... or {church_id}/thumbnails/...
CREATE POLICY "Church members can view media"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM user_church_memberships
        WHERE user_church_memberships.church_id = (storage.foldername(name))[1]::uuid
        AND user_church_memberships.user_id = auth.uid()
    )
);

-- Policy: Admins and Editors can upload media to their churches
CREATE POLICY "Admins and Editors can upload media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM user_church_memberships
        WHERE user_church_memberships.church_id = (storage.foldername(name))[1]::uuid
        AND user_church_memberships.user_id = auth.uid()
        AND user_church_memberships.role IN ('admin', 'editor')
    )
);

-- Policy: Admins and Editors can update media in their churches
CREATE POLICY "Admins and Editors can update media"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM user_church_memberships
        WHERE user_church_memberships.church_id = (storage.foldername(name))[1]::uuid
        AND user_church_memberships.user_id = auth.uid()
        AND user_church_memberships.role IN ('admin', 'editor')
    )
);

-- Policy: Admins and Editors can delete media from their churches
CREATE POLICY "Admins and Editors can delete media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM user_church_memberships
        WHERE user_church_memberships.church_id = (storage.foldername(name))[1]::uuid
        AND user_church_memberships.user_id = auth.uid()
        AND user_church_memberships.role IN ('admin', 'editor')
    )
);
