-- Fix the foreign key constraint on user_church_memberships.user_id
-- It currently points to auth.users, but we need it to point to user_profiles
-- This enables Supabase PostgREST to properly join these tables using the !foreign_key syntax
--
-- Note: This is safe because user_profiles.id already has a FK to auth.users with ON DELETE CASCADE,
-- so the cascade delete behavior is preserved.

-- Drop the existing FK that points to auth.users
ALTER TABLE user_church_memberships
DROP CONSTRAINT IF EXISTS user_church_memberships_user_id_fkey;

-- Add the new FK that points to user_profiles
ALTER TABLE user_church_memberships
ADD CONSTRAINT user_church_memberships_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES user_profiles(id)
ON DELETE CASCADE;
