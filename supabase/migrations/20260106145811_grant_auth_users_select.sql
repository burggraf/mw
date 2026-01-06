-- ============================================================================
-- Grant SELECT on auth.users to authenticated role
-- This is needed because user_church_memberships has a foreign key to auth.users,
-- and PostgREST needs to verify foreign key relationships during joins.
-- Without this grant, queries like:
--   SELECT role, church:churches(id,name) FROM user_church_memberships
-- fail with "permission denied for table users"
-- ============================================================================

-- Grant SELECT on auth.users to authenticated role
-- Only grant on specific columns needed for foreign key verification
GRANT SELECT ON auth.users TO authenticated;

-- Also grant usage on the auth schema if not already granted
GRANT USAGE ON SCHEMA auth TO authenticated;
