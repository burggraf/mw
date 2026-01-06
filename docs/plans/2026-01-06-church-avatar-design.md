# Church Avatar Feature Design

## Overview

Add the ability to upload a church avatar to the church profile page. Display the avatar in the church chooser and throughout the app wherever the church name appears.

## Database Changes

Add `avatar_url` column to the `churches` table:

```sql
ALTER TABLE churches
ADD COLUMN avatar_url TEXT;

COMMENT ON COLUMN churches.avatar_url IS 'URL to church avatar image stored in the avatars bucket';
```

## Storage

Reuse the existing `avatars` bucket with path structure: `church/{church_id}/avatar.png`

### New RLS Policies

```sql
-- Church admins can upload church avatar
CREATE POLICY "Church admins can upload church avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'church'
  AND EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE church_id = (storage.foldername(name))[2]::uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Church admins can update church avatar
CREATE POLICY "Church admins can update church avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'church'
  AND EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE church_id = (storage.foldername(name))[2]::uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Church admins can delete church avatar
CREATE POLICY "Church admins can delete church avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'church'
  AND EXISTS (
    SELECT 1 FROM user_church_memberships
    WHERE church_id = (storage.foldername(name))[2]::uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  )
);
```

The existing public SELECT policy already covers viewing church avatars.

## UI Changes

### ChurchProfile Page

Add avatar upload section at the top of the page:
- Display current avatar or church initials as fallback
- Camera overlay on hover to trigger file selection
- Image cropping using `react-image-crop` (same as user avatars)
- "Change Avatar" / "Remove Avatar" buttons
- 256x256 output size (same as user avatars)

### ChurchContext

Update the `Church` interface and query:
```typescript
interface Church {
  id: string
  name: string
  role: UserRole
  avatar_url: string | null  // NEW
}
```

Fetch `avatar_url` in the `loadChurches` query.

### ChurchAvatar Component

Create `src/components/ChurchAvatar.tsx`:
- Accept `church` prop (or just `name` and `avatarUrl`)
- Show avatar image if available
- Show initials fallback (first 2 chars of church name)
- Support different sizes via className

### Sidebar Church Chooser

- Single church view: Replace `ChurchIcon` with `ChurchAvatar`
- Multiple churches (Select): Show `ChurchAvatar` next to each church name

## Files to Modify

1. `supabase/migrations/YYYYMMDD_add_church_avatar.sql` - New migration
2. `src/contexts/ChurchContext.tsx` - Add avatar_url to Church interface and query
3. `src/components/ChurchAvatar.tsx` - New component
4. `src/pages/ChurchProfile.tsx` - Add avatar upload UI
5. `src/components/AppSidebar.tsx` - Use ChurchAvatar in church chooser
6. `src/i18n/locales/en.json` - Add translation keys
7. `src/i18n/locales/es.json` - Add Spanish translations
