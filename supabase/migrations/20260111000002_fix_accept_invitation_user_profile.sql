-- ============================================================================
-- Fix accept_invitation to ensure user_profiles row exists
-- When a new user signs up and accepts an invitation, the user_profiles row
-- might not exist yet (trigger timing issue). This fix ensures the row exists.
-- ============================================================================

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
  SELECT
    i.id,
    i.church_id,
    i.email,
    i.role,
    i.token,
    i.invited_by,
    i.expires_at,
    i.accepted_at,
    i.created_at,
    c.name as church_name
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
    SELECT 1 FROM user_church_memberships ucm
    WHERE ucm.user_id = auth.uid()
      AND ucm.church_id = v_invitation.church_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this church';
  END IF;

  -- Ensure user_profiles row exists (trigger might not have fired yet)
  INSERT INTO user_profiles (id, display_name)
  VALUES (auth.uid(), v_user_email)
  ON CONFLICT (id) DO NOTHING;

  -- Create the membership
  INSERT INTO user_church_memberships (user_id, church_id, role)
  VALUES (auth.uid(), v_invitation.church_id, v_invitation.role);

  -- Mark invitation as accepted
  UPDATE invitations
  SET accepted_at = NOW()
  WHERE id = v_invitation.id;

  -- Return the church info
  RETURN QUERY SELECT
    v_invitation.church_id,
    v_invitation.role,
    v_invitation.church_name;
END;
$$;
