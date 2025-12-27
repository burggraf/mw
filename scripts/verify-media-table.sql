-- Verify media table exists and has correct structure

-- Check if table exists
SELECT
    EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'media'
    ) as table_exists;

-- Show table structure if it exists
\d media

-- Show RLS policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'media';

-- Count media records
SELECT COUNT(*) as media_count FROM media;

-- Show sample data (if any)
SELECT
    id,
    church_id,
    name,
    type,
    source,
    created_at
FROM media
LIMIT 5;
