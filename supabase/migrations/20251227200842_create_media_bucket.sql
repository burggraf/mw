-- Create media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false);

-- Policy: Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads to media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
);

-- Policy: Allow authenticated users to download
CREATE POLICY "Allow authenticated downloads from media"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
);

-- Policy: Allow authenticated users to delete their uploads
CREATE POLICY "Allow authenticated deletes from media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
);
