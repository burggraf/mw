#!/bin/bash
set -e

echo "🔧 Fixing Media Table Setup..."
echo ""

# Check if supabase is linked
if [ ! -f "supabase/.temp/project-ref" ]; then
    echo "❌ Error: Supabase project not linked"
    echo "Run: supabase link --project-ref YOUR_PROJECT_REF"
    exit 1
fi

PROJECT_REF=$(cat supabase/.temp/project-ref)
echo "📌 Linked to project: $PROJECT_REF"
echo ""

# Method 1: Notify PostgREST to reload schema cache
echo "Method 1: Reloading PostgREST schema cache..."
echo "You need to run this SQL in your Supabase SQL Editor:"
echo ""
echo "NOTIFY pgrst, 'reload schema';"
echo ""
echo "This will force PostgREST to reload the schema cache and recognize the media table."
echo ""

# Method 2: Check if migrations are applied
echo "Method 2: Verifying migrations..."
supabase migration list

echo ""
echo "Method 3: Verify table exists..."
echo "Run this command to check if the table exists:"
echo ""
echo "supabase db exec < scripts/verify-media-table.sql"
echo ""

# Method 4: Manual fix via Supabase dashboard
echo "Method 4: Manual Fix (if above doesn't work):"
echo "1. Go to https://supabase.com/dashboard/project/$PROJECT_REF/sql"
echo "2. Run: NOTIFY pgrst, 'reload schema';"
echo "3. Or restart your project: Settings > General > Pause Project, then Resume"
echo ""

# Method 5: Re-apply migration
echo "Method 5: Re-apply migration (last resort):"
echo "If the table truly doesn't exist, run:"
echo "cat supabase/migrations/*_create_media.sql | supabase db execute"
echo ""

echo "✅ Next steps:"
echo "1. Try Method 1 first (reload schema cache)"
echo "2. Refresh your app in the browser"
echo "3. If still not working, try Method 4 (restart project)"
echo ""
