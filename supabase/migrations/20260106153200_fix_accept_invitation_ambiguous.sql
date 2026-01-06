-- Fix accept_invitation: use explicit column aliases to avoid ambiguity
CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS TABLE(church_id UUID, role user_role, church_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_user_email TEXT;
BEGIN
  -- Get the current user's email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Find the invitation
  SELECT i.*, c.name as cname
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

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE user_id = auth.uid() AND user_church_memberships.church_id = v_invitation.church_id
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

  -- Return the church info using explicit aliases
  church_id := v_invitation.church_id;
  role := v_invitation.role;
  church_name := v_invitation.cname;
  RETURN NEXT;
END;
$$;
