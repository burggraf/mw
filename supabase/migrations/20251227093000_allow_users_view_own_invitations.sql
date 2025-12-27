-- Allow users to view invitations sent to their email address
-- This is needed so users can accept invitations to join churches

CREATE POLICY "Users can view invitations sent to them"
    ON invitations FOR SELECT
    USING (email = auth.email());
