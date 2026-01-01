-- Add "color" tag to built-in solid color backgrounds
UPDATE media
SET tags = '["color"]'::jsonb
WHERE id IN (
    'c0000000-0000-0000-0000-000000000001',  -- Black
    'c0000000-0000-0000-0000-000000000002'   -- White
);
