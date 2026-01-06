-- ============================================================================
-- Fix get_invitation_by_token function to use correct types
-- The token column is TEXT (hex-encoded), role is user_role enum
-- ============================================================================

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
    i.role::TEXT,  -- Cast enum to TEXT
    i.church_id,
    c.name as church_name,
    i.expires_at,
    i.accepted_at
  FROM invitations i
  JOIN churches c ON c.id = i.church_id
  WHERE i.token = p_token;
END;
$$;
