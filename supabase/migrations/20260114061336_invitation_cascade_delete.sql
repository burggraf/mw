-- Update invitations.invited_by to cascade delete when user is deleted

-- First, clean up any orphaned invitations where invited_by references
-- a user that no longer exists in user_profiles
DELETE FROM invitations
WHERE invited_by IS NOT NULL
  AND invited_by NOT IN (SELECT id FROM user_profiles);

-- Now we can safely drop and recreate the FK constraint with CASCADE
ALTER TABLE invitations
DROP CONSTRAINT invitations_invited_by_fkey;

ALTER TABLE invitations
ADD CONSTRAINT invitations_invited_by_fkey
  FOREIGN KEY (invited_by)
  REFERENCES user_profiles(id)
  ON DELETE CASCADE;
