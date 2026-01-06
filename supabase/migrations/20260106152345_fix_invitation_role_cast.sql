-- Fix get_invitation_by_token: cast role enum to TEXT
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  church_id UUID,
  church_name TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.email,
    i.role::TEXT,
    i.church_id,
    c.name as church_name,
    i.expires_at,
    i.accepted_at
  FROM invitations i
  JOIN churches c ON c.id = i.church_id
  WHERE i.token = p_token;
END;
$$;
