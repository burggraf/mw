-- Add avatar_url column to churches table
ALTER TABLE churches
ADD COLUMN avatar_url TEXT;

COMMENT ON COLUMN churches.avatar_url IS 'URL to church avatar image stored in the avatars bucket';
