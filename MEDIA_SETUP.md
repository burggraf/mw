# Media Library Setup & Troubleshooting

## The Problem: "Table 'media' not found"

If you see the error:
```
Could not find the table 'public.media' in the schema cache
```

This means PostgREST (Supabase's REST API layer) hasn't refreshed its schema cache after the migration was applied.

## Quick Fix

### Method 1: Reload PostgREST Schema Cache (RECOMMENDED)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql
2. Run this SQL command:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
3. Refresh your app in the browser

### Method 2: Restart Your Supabase Project

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_REF/settings/general
2. Click "Pause project"
3. Wait for it to pause
4. Click "Resume project"
5. Wait for it to resume (this may take a minute)
6. Refresh your app

### Method 3: Verify and Re-apply Migration

```bash
# Check if migration is applied
supabase migration list

# If not applied, push it
supabase db push
```

## Setting Up Media Storage Bucket

The media library requires a Supabase Storage bucket named `media`.

### Create the Bucket

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_REF/storage/buckets
2. Click "New bucket"
3. Name: `media`
4. Public: **No** (keep it private)
5. Click "Create bucket"

### Set Up Storage Policies

The migrations should have created these automatically, but if not:

1. Go to your bucket's policies
2. Add these three policies:

**Policy 1: Allow Uploads**
- Name: Allow church members to upload
- Allowed operation: INSERT
- Policy definition:
```sql
((bucket_id = 'media'::text) AND (auth.role() = 'authenticated'::text))
```

**Policy 2: Allow Downloads**
- Name: Allow church members to download
- Allowed operation: SELECT
- Policy definition:
```sql
((bucket_id = 'media'::text) AND (auth.role() = 'authenticated'::text))
```

**Policy 3: Allow Deletes**
- Name: Allow church members to delete
- Allowed operation: DELETE
- Policy definition:
```sql
((bucket_id = 'media'::text) AND (auth.role() = 'authenticated'::text))
```

## Setting Up Stock Media APIs (Optional)

To use Pexels and Unsplash stock media search:

### 1. Get API Keys

- **Pexels**: https://www.pexels.com/api/
- **Unsplash**: https://unsplash.com/developers

### 2. Create .env.server file

```bash
cp .env.server.example .env.server
```

Edit `.env.server` and add your keys:
```bash
PEXELS_API_KEY=your_pexels_key_here
UNSPLASH_ACCESS_KEY=your_unsplash_key_here
```

### 3. Deploy Secrets to Supabase

```bash
./scripts/deploy-secrets.sh
```

### 4. Deploy Edge Function

```bash
supabase functions deploy stock-media-search
```

## Verify Everything Works

### Check Database Table

```bash
# Run verification script
./scripts/fix-media-table.sh
```

Or manually in Supabase SQL Editor:
```sql
-- Check if table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'media'
) as table_exists;

-- Show RLS policies
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'media';
```

### Check Storage Bucket

```sql
-- List buckets
SELECT id, name, public FROM storage.buckets;

-- Check storage policies
SELECT * FROM storage.buckets WHERE name = 'media';
```

## Running E2E Tests

### Setup Test Environment

1. Create a test account in your Supabase project
2. Set environment variables:
   ```bash
   export TEST_EMAIL=test@example.com
   export TEST_PASSWORD=testpassword
   ```

### Run Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run all media tests
pnpm test:e2e e2e/media.spec.ts

# Run tests in UI mode (recommended for debugging)
npx playwright test --ui

# Run specific test
npx playwright test e2e/media.spec.ts --grep "should upload"
```

### Create Test Fixtures

For upload tests, you need test files in `e2e/fixtures/`:

```bash
# Create test image (requires ImageMagick)
convert -size 800x600 xc:blue -pointsize 48 -fill white \
  -gravity center -annotate +0+0 "Test Image" \
  e2e/fixtures/test-image.png

# Or use any image file
cp path/to/test-image.png e2e/fixtures/test-image.png
```

## Common Issues

### "Media bucket not found"

**Solution**: Create the bucket manually (see "Setting Up Media Storage Bucket" above)

### "Unauthorized" errors

**Solution**: Check that your RLS policies are correctly set up for the `media` table and `media` storage bucket

### Stock media search returns empty results

**Solutions**:
1. Check that API keys are deployed: `supabase secrets list`
2. Check edge function logs: Supabase Dashboard > Edge Functions > stock-media-search > Logs
3. Verify edge function is deployed: `supabase functions list`

### Uploads fail silently

**Solutions**:
1. Check browser console for errors
2. Verify storage bucket exists and has correct policies
3. Check file size limits (10MB for images, 50MB for videos)
4. Verify file types are allowed (JPG, PNG, WebP, MP4, WebM)

## Architecture Overview

The media library consists of:

1. **Database**: `media` table with RLS policies
2. **Storage**: `media` bucket for file storage
3. **Edge Function**: `stock-media-search` for Pexels/Unsplash
4. **Client-side**: React components with thumbnail generation
5. **Services**: CRUD operations and search

Files are organized as:
```
{church_id}/
  originals/
    {uuid}.{ext}
  thumbnails/
    {uuid}_thumb.webp
```

## Need Help?

If you're still having issues:

1. Check Supabase logs: Dashboard > Logs
2. Check browser console for client-side errors
3. Run `./scripts/fix-media-table.sh` for diagnostic info
4. Review migration files in `supabase/migrations/`
