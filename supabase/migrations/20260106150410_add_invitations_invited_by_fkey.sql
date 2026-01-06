-- ============================================================================
-- Add foreign key from invitations.invited_by to user_profiles.id
-- This allows PostgREST joins like: invitations.select('*, user_profiles!invitations_invited_by_fkey(...)')
-- The original FK points to auth.users, but PostgREST can't use that for joins.
-- We need a FK to user_profiles for the join syntax to work.
-- ============================================================================

-- First, drop the existing FK that was auto-created by Postgres (points to auth.users)
ALTER TABLE invitations
DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey;

-- Add FK constraint to user_profiles with the name the code expects
-- Note: user_profiles.id has the same values as auth.users.id (it's a FK itself)
ALTER TABLE invitations
ADD CONSTRAINT invitations_invited_by_fkey
FOREIGN KEY (invited_by) REFERENCES user_profiles(id);
