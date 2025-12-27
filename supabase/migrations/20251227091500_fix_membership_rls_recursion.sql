-- ============================================================================
-- Fix infinite recursion in user_church_memberships RLS policy
-- The old policy queried user_church_memberships to check access to user_church_memberships
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view memberships in their churches" ON user_church_memberships;

-- Add policy: Users can always see their OWN memberships (no recursion)
CREATE POLICY "Users can view own memberships"
    ON user_church_memberships FOR SELECT
    USING (user_id = auth.uid());

-- Add policy: Users can see OTHER members in churches they belong to
-- This uses a subquery that checks user_id directly, avoiding recursion
CREATE POLICY "Users can view church members"
    ON user_church_memberships FOR SELECT
    USING (
        church_id IN (
            SELECT church_id FROM user_church_memberships WHERE user_id = auth.uid()
        )
    );
