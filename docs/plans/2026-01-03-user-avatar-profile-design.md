# User Profile & Avatar Upload Design

## Overview

Allow users to upload avatars and edit their display name via a profile modal accessible from the sidebar.

## Decisions Made

- **Avatar storage:** Dedicated `avatars` bucket (not in church-scoped `media` bucket)
- **Profile UI:** Modal dialog (quick access, stays in context)
- **Upload constraints:** JPEG/PNG/WebP/GIF, 5MB max, with crop tool
- **Display name in sidebar:** Replace email with display name (email as fallback)
- **Avatar replacement:** Delete old avatar when uploading new one (no history)
- **Initials source:** Display name initials, email fallback

## Database Changes

Add `avatar_url` column to `user_profiles` table:

```sql
ALTER TABLE user_profiles
ADD COLUMN avatar_url TEXT;
```

## Storage Setup

Create `avatars` bucket with policies:

```sql
-- Create public avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Users can upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Anyone can view avatars (public bucket)
CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

Storage path: `{user_id}/avatar.{ext}`

## Profile Modal

New `ProfileModal` component:

- Avatar preview (current image or initials fallback)
- Click avatar to upload new image → crop tool appears
- Accepts: JPEG, PNG, WebP, GIF (max 5MB)
- Display name text input
- Save/Cancel buttons

Crop library: `react-image-crop`

## Sidebar Changes

- Add "Profile" menu item in dropdown (between email and sign out)
- Display name shown instead of email (email as fallback)
- Initials from display name (email fallback)
- Avatar image displayed when available

## AuthContext Changes

Add to context:

```typescript
userProfile: { display_name: string | null; avatar_url: string | null } | null
updateProfile: (updates: { display_name?: string; avatar_url?: string }) => Promise<void>
```

Fetch profile on auth state change, expose updateProfile function.

## i18n

Add `profile.*` keys to both `en.json` and `es.json`.

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/XXXXXX_add_avatar_url.sql` | Create |
| `supabase/migrations/XXXXXX_create_avatars_bucket.sql` | Create |
| `src/components/ProfileModal.tsx` | Create |
| `src/contexts/AuthContext.tsx` | Modify |
| `src/components/AppSidebar.tsx` | Modify |
| `src/i18n/locales/en.json` | Modify |
| `src/i18n/locales/es.json` | Modify |

## Dependencies

```bash
pnpm add react-image-crop
```
