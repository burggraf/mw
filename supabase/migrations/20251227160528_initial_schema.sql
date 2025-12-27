-- ============================================================================
-- Mobile Worship - Initial Database Schema
-- Multi-tenant architecture with Row-Level Security
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CHURCHES
-- ============================================================================
CREATE TABLE churches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Subscription/billing info (populated later by Stripe integration)
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'trialing',
    subscription_tier TEXT DEFAULT 'starter',
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- ============================================================================
-- USER PROFILES
-- Extends Supabase auth.users with app-specific data
-- ============================================================================
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    preferred_language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- USER <-> CHURCH MEMBERSHIP
-- Links users to churches with roles
-- ============================================================================
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'operator');

CREATE TABLE user_church_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'operator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A user can only have one role per church
    UNIQUE(user_id, church_id)
);

-- ============================================================================
-- INVITATIONS
-- For inviting new users to a church
-- ============================================================================
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'operator',
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Can only have one pending invite per email per church
    UNIQUE(church_id, email)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_user_church_memberships_user_id ON user_church_memberships(user_id);
CREATE INDEX idx_user_church_memberships_church_id ON user_church_memberships(church_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_church_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- CHURCHES: Users can only see churches they belong to
CREATE POLICY "Users can view their churches"
    ON churches FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = churches.id
            AND user_church_memberships.user_id = auth.uid()
        )
    );

-- CHURCHES: Only admins can update their church
CREATE POLICY "Admins can update their church"
    ON churches FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = churches.id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role = 'admin'
        )
    );

-- CHURCHES: Any authenticated user can create a church (they become admin)
CREATE POLICY "Authenticated users can create churches"
    ON churches FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- CHURCHES: Only admins can delete (enforced in app: must be last user)
CREATE POLICY "Admins can delete their church"
    ON churches FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = churches.id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role = 'admin'
        )
    );

-- USER_PROFILES: Users can view and update their own profile
CREATE POLICY "Users can view own profile"
    ON user_profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (id = auth.uid());

-- USER_CHURCH_MEMBERSHIPS: Users can see memberships in their churches
CREATE POLICY "Users can view memberships in their churches"
    ON user_church_memberships FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships ucm
            WHERE ucm.church_id = user_church_memberships.church_id
            AND ucm.user_id = auth.uid()
        )
    );

-- USER_CHURCH_MEMBERSHIPS: Users can insert their own membership (for church creation)
CREATE POLICY "Users can create own membership"
    ON user_church_memberships FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- USER_CHURCH_MEMBERSHIPS: Admins can manage memberships
CREATE POLICY "Admins can update memberships"
    ON user_church_memberships FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships ucm
            WHERE ucm.church_id = user_church_memberships.church_id
            AND ucm.user_id = auth.uid()
            AND ucm.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete memberships"
    ON user_church_memberships FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships ucm
            WHERE ucm.church_id = user_church_memberships.church_id
            AND ucm.user_id = auth.uid()
            AND ucm.role = 'admin'
        )
    );

-- INVITATIONS: Admins can manage invitations for their church
CREATE POLICY "Admins can view invitations"
    ON invitations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = invitations.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role = 'admin'
        )
    );

CREATE POLICY "Admins can create invitations"
    ON invitations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = invitations.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete invitations"
    ON invitations FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_church_memberships
            WHERE user_church_memberships.church_id = invitations.church_id
            AND user_church_memberships.user_id = auth.uid()
            AND user_church_memberships.role = 'admin'
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to create a church and add the creator as admin (used in app)
CREATE OR REPLACE FUNCTION create_church_with_admin(church_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_church_id UUID;
BEGIN
    -- Create the church
    INSERT INTO churches (name)
    VALUES (church_name)
    RETURNING id INTO new_church_id;

    -- Add the current user as admin
    INSERT INTO user_church_memberships (user_id, church_id, role)
    VALUES (auth.uid(), new_church_id, 'admin');

    RETURN new_church_id;
END;
$$;

-- Function to handle new user signup (creates profile)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_profiles (id, display_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
    RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER churches_updated_at
    BEFORE UPDATE ON churches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_church_memberships_updated_at
    BEFORE UPDATE ON user_church_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
