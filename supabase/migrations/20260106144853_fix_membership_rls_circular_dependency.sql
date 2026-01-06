-- ============================================================================
-- Fix RLS Circular Dependency in user_church_memberships
-- The SELECT policies were querying the same table with RLS enabled,
-- creating a circular dependency that prevented users from seeing their memberships.
-- ============================================================================

-- Create a SECURITY DEFINER function to get user's church IDs
-- This bypasses RLS when called from policies
CREATE OR REPLACE FUNCTION get_user_church_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT church_id FROM user_church_memberships WHERE user_id = p_user_id;
$$;

-- Drop all existing SELECT policies on user_church_memberships
DROP POLICY IF EXISTS "Users can view memberships in their churches" ON user_church_memberships;
DROP POLICY IF EXISTS "Users can view all memberships in their churches" ON user_church_memberships;

-- Create a new simple policy that:
-- 1. Users can always see their own memberships (user_id = auth.uid())
-- 2. Users can see other memberships in churches they belong to (via SECURITY DEFINER function)
CREATE POLICY "Users can view memberships" ON user_church_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR church_id IN (SELECT get_user_church_ids(auth.uid()))
  );
