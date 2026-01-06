-- Function to get storage stats for a church
-- Returns storage usage grouped by category (background, slide, thumbnails)
CREATE OR REPLACE FUNCTION get_church_storage_stats(p_church_id uuid)
RETURNS TABLE (
  category text,
  file_count bigint,
  total_bytes bigint
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if user has access to this church (is a member)
  IF NOT EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE user_id = auth.uid() AND church_id = p_church_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN o.name LIKE '%/thumbnails/%' THEN 'thumbnails'
      ELSE COALESCE(m.category::text, 'other')
    END as category,
    COUNT(*)::bigint as file_count,
    COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint as total_bytes
  FROM storage.objects o
  LEFT JOIN media m ON m.storage_path = o.name
  WHERE o.bucket_id = 'media'
    AND o.name LIKE p_church_id::text || '/%'
  GROUP BY
    CASE
      WHEN o.name LIKE '%/thumbnails/%' THEN 'thumbnails'
      ELSE COALESCE(m.category::text, 'other')
    END
  ORDER BY category;
END;
$$;
