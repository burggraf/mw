# Account Deletion Feature Design

## Overview

Allow users to permanently delete their account from the ProfileModal. Users who are the sole admin of any church must first add another admin or delete the church to prevent orphaned churches.

## User Flow

### Pre-Deletion Check

Before enabling deletion, verify the user can delete their account:

1. Query all churches where user has `admin` role
2. For each church, count total admins
3. If any church has only 1 admin (this user), block deletion

### Blocking State UI

When user cannot delete their account:
- Red alert box: "You can't delete your account yet"
- List each blocking church with name and link to `/team`
- Each item shows: "[Church Name] - You're the only admin. Add another admin or delete the church."
- Delete button is disabled

### Non-Blocking State UI

When user can delete their account:
- Warning text explaining what will be deleted
- Enabled "Delete Account" button in danger zone

### Confirmation Dialog

After clicking delete:
- Title: "Delete Your Account?"
- Warning listing consequences (removed from X churches, data deleted)
- Input field: "Type DELETE to confirm"
- Cancel + Delete buttons (Delete disabled until "DELETE" typed exactly)

### Progress Dialog

During deletion (same pattern as church deletion):
- Shows current step with spinner
- Steps: "Removing your avatar...", "Removing church memberships...", "Deleting account..."
- Non-dismissable until complete

### After Deletion

- User is automatically signed out
- Redirected to home/login page

## Data Cleanup

**Deletion order:**
1. User's avatar from Supabase storage (`avatars/{user_id}/avatar.png`)
2. All church memberships (cascade when user deleted)
3. Invitations sent by user (cascade delete)
4. User profile (cascade)
5. Auth user (via Edge Function)

## Technical Implementation

### Database Migration

Add `ON DELETE CASCADE` to `invitations.invited_by` foreign key:
```sql
ALTER TABLE invitations
DROP CONSTRAINT invitations_invited_by_fkey,
ADD CONSTRAINT invitations_invited_by_fkey
  FOREIGN KEY (invited_by)
  REFERENCES user_profiles(id)
  ON DELETE CASCADE;
```

### Edge Function: `delete-user-account`

Required because client-side cannot call `auth.admin.deleteUser()`.

- **Endpoint:** `POST /functions/v1/delete-user-account`
- **Auth:** Requires valid JWT
- **Logic:**
  1. Extract user ID from JWT
  2. Server-side check: user isn't sole admin of any church
  3. Delete avatar from storage
  4. Call `auth.admin.deleteUser(userId)`
- **Returns:** Success or error with reason

### Service Layer: `src/services/account.ts`

```typescript
// Check if user can delete their account
checkCanDeleteAccount(userId: string): Promise<{
  canDelete: boolean;
  blockingChurches: Array<{ id: string; name: string }>;
}>

// Delete the user's account with progress tracking
deleteUserAccount(onProgress?: ProgressCallback): Promise<void>
```

### ProfileModal Changes

Add "Danger Zone" section at bottom of modal:
- Collapsible or always-visible section with red styling
- Contains blocking warning OR delete button based on check result
- Triggers confirmation dialog on click

### Translation Keys

```
profile.dangerZone
profile.deleteAccount
profile.deleteAccountTitle
profile.deleteAccountWarning
profile.cannotDeleteAccount
profile.soleAdminWarning
profile.soleAdminChurchItem
profile.typeDeleteToConfirm
profile.deletingAccount
profile.deleteStep.avatar
profile.deleteStep.memberships
profile.deleteStep.account
profile.accountDeleted
```

## Files to Create/Modify

**New files:**
- `supabase/migrations/YYYYMMDDHHMMSS_add_invitation_cascade.sql`
- `supabase/functions/delete-user-account/index.ts`
- `src/services/account.ts`

**Modified files:**
- `src/components/ProfileModal.tsx` - Add danger zone section
- `src/i18n/locales/en.json` - Add translation keys
- `src/i18n/locales/es.json` - Add translation keys
