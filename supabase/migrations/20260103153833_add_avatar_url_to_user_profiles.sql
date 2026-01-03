-- Add avatar_url column to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN avatar_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.avatar_url IS 'URL to user avatar image stored in the avatars bucket';
