-- ============================================================================
-- Multi-Tenancy Helper Functions and RLS Updates
-- Provides context functions, invitation acceptance, and team management
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current church ID from JWT metadata (set during login/switch)
CREATE OR REPLACE FUNCTION get_current_church_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claims', true)::json->>'current_church_id',
      (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'current_church_id')
    ),
    ''
  )::UUID;
$$;

-- Get current user's role in their current church
CREATE OR REPLACE FUNCTION get_current_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM user_church_memberships
  WHERE user_id = auth.uid()
    AND church_id = get_current_church_id();
$$;

-- Get count of admins in a church (for last-admin protection)
CREATE OR REPLACE FUNCTION get_admin_count(p_church_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM user_church_memberships
  WHERE church_id = p_church_id
    AND role = 'admin';
$$;

-- Get user IDs in a church (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION get_church_user_ids(p_church_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT user_id FROM user_church_memberships WHERE church_id = p_church_id;
$$;

-- ============================================================================
-- INVITATION ACCEPTANCE
-- ============================================================================

-- Accept an invitation by token
-- Returns the church_id and role on success
CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS TABLE(church_id UUID, role user_role, church_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_user_email TEXT;
  v_church_name TEXT;
BEGIN
  -- Get the current user's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Find the invitation
  SELECT i.*, c.name as church_name
  INTO v_invitation
  FROM invitations i
  JOIN churches c ON c.id = i.church_id
  WHERE i.token = p_token;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  -- Check if already accepted
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation already accepted';
  END IF;

  -- Check if expired
  IF v_invitation.expires_at < NOW() THEN
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Check if email matches
  IF LOWER(v_invitation.email) != LOWER(v_user_email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE user_id = auth.uid()
      AND church_id = v_invitation.church_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this church';
  END IF;

  -- Create the membership
  INSERT INTO user_church_memberships (user_id, church_id, role)
  VALUES (auth.uid(), v_invitation.church_id, v_invitation.role);

  -- Mark invitation as accepted
  UPDATE invitations
  SET accepted_at = NOW()
  WHERE id = v_invitation.id;

  -- Return the church info
  RETURN QUERY SELECT v_invitation.church_id, v_invitation.role, v_invitation.church_name;
END;
$$;

-- ============================================================================
-- ADDITIONAL RLS POLICIES
-- ============================================================================

-- Allow users to view churches they have pending invitations to
-- (needed for accept-invite page to show church name)
CREATE POLICY "View church with pending invitation" ON churches
  FOR SELECT USING (
    id IN (
      SELECT church_id FROM invitations
      WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND accepted_at IS NULL
        AND expires_at > NOW()
    )
  );

-- Allow users to view other users in their churches (for team list)
-- Uses SECURITY DEFINER function to avoid RLS recursion
DROP POLICY IF EXISTS "Users can view members of their churches" ON user_profiles;
CREATE POLICY "Users can view members of their churches" ON user_profiles
  FOR SELECT USING (
    id = auth.uid() OR
    id IN (
      SELECT get_church_user_ids(m.church_id)
      FROM user_church_memberships m
      WHERE m.user_id = auth.uid()
    )
  );

-- ============================================================================
-- UPDATE MEMBERSHIP POLICIES FOR TEAM MANAGEMENT
-- ============================================================================

-- Allow viewing all memberships in churches where user is a member
-- (needed for team list to show all team members)
DROP POLICY IF EXISTS "Users can view all memberships in their churches" ON user_church_memberships;
CREATE POLICY "Users can view all memberships in their churches" ON user_church_memberships
  FOR SELECT USING (
    user_id = auth.uid() OR
    church_id IN (
      SELECT church_id FROM user_church_memberships WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own membership (leave church)
-- But not if they're the last admin
DROP POLICY IF EXISTS "Users can leave churches" ON user_church_memberships;
CREATE POLICY "Users can leave churches" ON user_church_memberships
  FOR DELETE USING (
    user_id = auth.uid()
    AND (
      role != 'admin'
      OR get_admin_count(church_id) > 1
    )
  );

-- ============================================================================
-- INVITATION MANAGEMENT POLICIES
-- ============================================================================

-- Update admins invitation policies to also allow update (for resending)
DROP POLICY IF EXISTS "Admins can update invitations" ON invitations;
CREATE POLICY "Admins can update invitations" ON invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_church_memberships
      WHERE user_church_memberships.church_id = invitations.church_id
        AND user_church_memberships.user_id = auth.uid()
        AND user_church_memberships.role = 'admin'
    )
  );
