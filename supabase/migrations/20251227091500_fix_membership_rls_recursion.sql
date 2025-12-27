-- ============================================================================
-- Fix infinite recursion in user_church_memberships RLS policy
-- The old policy queried user_church_memberships to check access to user_church_memberships
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view memberships in their churches" ON user_church_memberships;

-- Add policy: Users can always see their OWN memberships (no recursion)
-- This simple policy allows users to check if they have any church memberships
CREATE POLICY "Users can view own memberships"
    ON user_church_memberships FOR SELECT
    USING (user_id = auth.uid());
