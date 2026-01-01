-- Remove built-in black and white backgrounds
DELETE FROM media
WHERE id IN (
    'c0000000-0000-0000-0000-000000000001',  -- Black
    'c0000000-0000-0000-0000-000000000002'   -- White
);

-- Remove the RLS policy for built-in media (no longer needed)
DROP POLICY IF EXISTS "Everyone can view built-in media" ON media;
