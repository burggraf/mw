-- ============================================================================
-- Revert invitations.invited_by FK back to auth.users
-- The FK to user_profiles was causing issues because profiles might not exist
-- for all users (e.g., newly signed up users before trigger runs).
-- Instead, we'll handle the join differently in the application code.
-- ============================================================================

-- Drop the FK to user_profiles
ALTER TABLE invitations
DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey;

-- Restore the FK to auth.users
ALTER TABLE invitations
ADD CONSTRAINT invitations_invited_by_fkey
FOREIGN KEY (invited_by) REFERENCES auth.users(id);
