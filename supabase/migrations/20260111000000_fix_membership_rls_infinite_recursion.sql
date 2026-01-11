-- ============================================================================
-- Fix Infinite Recursion in user_church_memberships RLS Policy
-- The policy was using "IN (SELECT ...)" which can trigger RLS recursively.
-- We need to create an array-returning function instead of set-returning.
-- ============================================================================

-- Replace the set-returning function with an array-returning one
CREATE OR REPLACE FUNCTION get_user_church_ids_array(p_user_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT ARRAY(
    SELECT church_id FROM user_church_memberships WHERE user_id = p_user_id
  );
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view memberships" ON user_church_memberships;

-- Recreate with array overlap check
CREATE POLICY "Users can view memberships" ON user_church_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR get_user_church_ids_array(auth.uid()) @> ARRAY[church_id]
  );
