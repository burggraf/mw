-- Drop old columns from songs
ALTER TABLE songs DROP COLUMN IF EXISTS style_id;
ALTER TABLE songs DROP COLUMN IF EXISTS styles;

-- Drop old styles table (will recreate with new schema)
DROP TABLE IF EXISTS styles CASCADE;
