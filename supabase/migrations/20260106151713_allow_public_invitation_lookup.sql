-- ============================================================================
-- Allow public lookup of invitations by token
-- This is needed for the accept-invite flow where users may not be logged in.
-- The token itself is the secret that controls access.
-- ============================================================================

-- Create an RPC function to safely look up invitation by token
-- This bypasses RLS and returns only the necessary info for the accept flow
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
    i.role,
    i.church_id,
    c.name as church_name,
    i.expires_at,
    i.accepted_at
  FROM invitations i
  JOIN churches c ON c.id = i.church_id
  WHERE i.token = p_token::UUID;
END;
$$;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION get_invitation_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_invitation_by_token(TEXT) TO authenticated;
