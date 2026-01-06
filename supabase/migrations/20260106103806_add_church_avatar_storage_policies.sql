-- Add storage policies for church avatars
-- Path structure: church/{church_id}/avatar.png

-- Church admins can upload church avatar
CREATE POLICY "Church admins can upload church avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'church'
  AND EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE church_id = (storage.foldername(name))[2]::uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Church admins can update church avatar
CREATE POLICY "Church admins can update church avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'church'
  AND EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE church_id = (storage.foldername(name))[2]::uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Church admins can delete church avatar
CREATE POLICY "Church admins can delete church avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'church'
  AND EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE church_id = (storage.foldername(name))[2]::uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  )
);
