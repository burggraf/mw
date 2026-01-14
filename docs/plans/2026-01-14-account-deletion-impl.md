# Account Deletion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to permanently delete their account from ProfileModal, with safeguards preventing orphaned churches.

**Architecture:** Database migration adds cascade delete to invitations FK. Edge function handles auth user deletion (requires service role). Service layer checks for blocking churches and orchestrates deletion with progress. ProfileModal gets a new Danger Zone section.

**Tech Stack:** Supabase (Edge Functions, Auth Admin API), React, TypeScript, Tailwind CSS

---

## Task 1: Database Migration for Invitation FK

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_invitation_cascade_delete.sql`

**Step 1: Create the migration file**

```bash
cd /Users/markb/dev/mw/app && supabase migration new invitation_cascade_delete
```

**Step 2: Write the migration**

```sql
-- Update invitations.invited_by to cascade delete when user is deleted
ALTER TABLE invitations
DROP CONSTRAINT invitations_invited_by_fkey;

ALTER TABLE invitations
ADD CONSTRAINT invitations_invited_by_fkey
  FOREIGN KEY (invited_by)
  REFERENCES user_profiles(id)
  ON DELETE CASCADE;
```

**Step 3: Apply the migration locally**

```bash
cd /Users/markb/dev/mw/app && supabase db push
```

Expected: Migration applies successfully

**Step 4: Commit**

```bash
git add supabase/migrations/*_invitation_cascade_delete.sql
git commit -m "feat: add cascade delete to invitations.invited_by FK"
```

---

## Task 2: Add Translation Keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add English translations**

Add to the `profile` section in `src/i18n/locales/en.json`:

```json
"deleteAccount": "Delete Account",
"deleteAccountTitle": "Delete Your Account?",
"deleteAccountWarning": "This will permanently delete your account and remove you from all churches. This action cannot be undone.",
"cannotDeleteAccount": "You cannot delete your account",
"soleAdminWarning": "You are the only admin for these churches. Add another admin or delete the church first:",
"typeDeleteToConfirm": "Type DELETE to confirm",
"deleteAccountButton": "Delete My Account",
"deletingAccount": "Deleting account...",
"deleteStep": {
  "avatar": "Removing your avatar...",
  "memberships": "Removing church memberships...",
  "account": "Deleting account..."
},
"accountDeleted": "Your account has been deleted",
"goToTeam": "Go to Team"
```

**Step 2: Add Spanish translations**

Add to the `profile` section in `src/i18n/locales/es.json`:

```json
"deleteAccount": "Eliminar Cuenta",
"deleteAccountTitle": "¿Eliminar tu cuenta?",
"deleteAccountWarning": "Esto eliminará permanentemente tu cuenta y te removerá de todas las iglesias. Esta acción no se puede deshacer.",
"cannotDeleteAccount": "No puedes eliminar tu cuenta",
"soleAdminWarning": "Eres el único administrador de estas iglesias. Agrega otro administrador o elimina la iglesia primero:",
"typeDeleteToConfirm": "Escribe DELETE para confirmar",
"deleteAccountButton": "Eliminar Mi Cuenta",
"deletingAccount": "Eliminando cuenta...",
"deleteStep": {
  "avatar": "Eliminando tu avatar...",
  "memberships": "Eliminando membresías de iglesias...",
  "account": "Eliminando cuenta..."
},
"accountDeleted": "Tu cuenta ha sido eliminada",
"goToTeam": "Ir al Equipo"
```

**Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "feat: add account deletion translation keys"
```

---

## Task 3: Create Account Service

**Files:**
- Create: `src/services/account.ts`

**Step 1: Create the service file**

```typescript
import { getSupabase } from '@/lib/supabase'

export interface BlockingChurch {
  id: string
  name: string
}

export interface CanDeleteResult {
  canDelete: boolean
  blockingChurches: BlockingChurch[]
}

export type AccountDeletionStep =
  | 'checking'
  | 'deleting-avatar'
  | 'deleting-account'
  | 'complete'

export interface AccountDeletionProgress {
  step: AccountDeletionStep
  message: string
}

export type AccountProgressCallback = (progress: AccountDeletionProgress) => void

/**
 * Check if the current user can delete their account.
 * Returns false if user is the sole admin of any church.
 */
export async function checkCanDeleteAccount(): Promise<CanDeleteResult> {
  const supabase = getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  // Get all churches where user is an admin
  const { data: adminMemberships, error: membershipError } = await supabase
    .from('user_church_memberships')
    .select(`
      church_id,
      churches (
        id,
        name
      )
    `)
    .eq('user_id', user.id)
    .eq('role', 'admin')

  if (membershipError) throw membershipError

  const blockingChurches: BlockingChurch[] = []

  // For each church where user is admin, check if they're the only admin
  for (const membership of adminMemberships || []) {
    const { count, error: countError } = await supabase
      .from('user_church_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('church_id', membership.church_id)
      .eq('role', 'admin')

    if (countError) throw countError

    if (count === 1) {
      const church = membership.churches as unknown as { id: string; name: string }
      blockingChurches.push({
        id: church.id,
        name: church.name,
      })
    }
  }

  return {
    canDelete: blockingChurches.length === 0,
    blockingChurches,
  }
}

/**
 * Delete the current user's account.
 * Calls the edge function which handles auth user deletion.
 */
export async function deleteUserAccount(
  onProgress?: AccountProgressCallback
): Promise<void> {
  const supabase = getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  // Step 1: Delete avatar from storage
  onProgress?.({
    step: 'deleting-avatar',
    message: 'Removing your avatar...',
  })

  await supabase.storage.from('avatars').remove([`${user.id}/avatar.png`])
  // Ignore errors - avatar might not exist

  // Step 2: Call edge function to delete auth user
  onProgress?.({
    step: 'deleting-account',
    message: 'Deleting account...',
  })

  const { data, error } = await supabase.functions.invoke('delete-user-account')

  if (error) {
    throw new Error(error.message || 'Failed to delete account')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  onProgress?.({
    step: 'complete',
    message: 'Account deleted successfully',
  })
}
```

**Step 2: Commit**

```bash
git add src/services/account.ts
git commit -m "feat: add account deletion service"
```

---

## Task 4: Create Edge Function

**Files:**
- Create: `supabase/functions/delete-user-account/index.ts`

**Step 1: Create the function directory and file**

```bash
mkdir -p /Users/markb/dev/mw/app/supabase/functions/delete-user-account
```

**Step 2: Write the edge function**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with user's auth to get their ID
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Deleting account for user:', user.id)

    // Create admin client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Double-check: user is not sole admin of any church
    const { data: adminMemberships } = await adminClient
      .from('user_church_memberships')
      .select('church_id')
      .eq('user_id', user.id)
      .eq('role', 'admin')

    for (const membership of adminMemberships || []) {
      const { count } = await adminClient
        .from('user_church_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('church_id', membership.church_id)
        .eq('role', 'admin')

      if (count === 1) {
        return new Response(
          JSON.stringify({ error: 'Cannot delete account: you are the sole admin of one or more churches' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Delete the auth user (cascades to user_profiles and memberships)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)

    if (deleteError) {
      console.error('Failed to delete user:', deleteError)
      return new Response(
        JSON.stringify({ error: `Failed to delete account: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User deleted successfully:', user.id)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

**Step 3: Commit**

```bash
git add supabase/functions/delete-user-account/index.ts
git commit -m "feat: add delete-user-account edge function"
```

---

## Task 5: Update ProfileModal with Danger Zone

**Files:**
- Modify: `src/components/ProfileModal.tsx`

**Step 1: Add imports**

Add these imports at the top:

```typescript
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  checkCanDeleteAccount,
  deleteUserAccount,
  type BlockingChurch,
  type AccountDeletionProgress,
} from '@/services/account'
```

**Step 2: Add state variables**

Inside the `ProfileModal` component, add these state variables after the existing ones:

```typescript
// Account deletion state
const [canDelete, setCanDelete] = useState<boolean | null>(null)
const [blockingChurches, setBlockingChurches] = useState<BlockingChurch[]>([])
const [isCheckingDelete, setIsCheckingDelete] = useState(false)
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
const [deleteConfirmText, setDeleteConfirmText] = useState('')
const [isDeleting, setIsDeleting] = useState(false)
const [deletionProgress, setDeletionProgress] = useState<AccountDeletionProgress | null>(null)
const [deleteError, setDeleteError] = useState<string | null>(null)
```

**Step 3: Add useEffect to check deletion status**

Add this effect after the state declarations:

```typescript
// Check if user can delete their account when modal opens
useEffect(() => {
  if (open && !isCropping) {
    setIsCheckingDelete(true)
    checkCanDeleteAccount()
      .then((result) => {
        setCanDelete(result.canDelete)
        setBlockingChurches(result.blockingChurches)
      })
      .catch((err) => {
        console.error('Error checking delete status:', err)
        setCanDelete(false)
      })
      .finally(() => {
        setIsCheckingDelete(false)
      })
  }
}, [open, isCropping])
```

**Step 4: Add delete handler**

Add this handler function:

```typescript
const handleDeleteAccount = async () => {
  setIsDeleting(true)
  setDeleteError(null)

  try {
    await deleteUserAccount((progress) => {
      setDeletionProgress(progress)
    })
    // Account deleted - user will be signed out automatically
    // Redirect to home page
    window.location.href = '/'
  } catch (err) {
    console.error('Error deleting account:', err)
    setDeleteError(err instanceof Error ? err.message : 'Failed to delete account')
    setIsDeleting(false)
    setDeletionProgress(null)
  }
}
```

**Step 5: Update handleOpenChange to reset delete state**

In the existing `handleOpenChange` function, add these resets:

```typescript
const handleOpenChange = (newOpen: boolean) => {
  if (newOpen) {
    setDisplayName(userProfile?.display_name || '')
    setError(null)
    setIsCropping(false)
    setImageSrc(null)
    // Reset delete state
    setShowDeleteConfirm(false)
    setDeleteConfirmText('')
    setDeleteError(null)
    setDeletionProgress(null)
  }
  onOpenChange(newOpen)
}
```

**Step 6: Add the Danger Zone JSX**

Add this JSX after the `DialogFooter` closing tag but before the closing `</div>` of the profile edit UI section (around line 364):

```tsx
{/* Danger Zone */}
<Separator className="my-6" />
<div className="space-y-4">
  <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
    <AlertTriangle className="h-4 w-4" />
    {t('churchProfile.dangerZone')}
  </h3>

  {isCheckingDelete ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {t('common.loading')}
    </div>
  ) : !canDelete ? (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        <p className="font-medium">{t('profile.cannotDeleteAccount')}</p>
        <p className="text-sm">{t('profile.soleAdminWarning')}</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          {blockingChurches.map((church) => (
            <li key={church.id} className="text-sm">
              <span className="font-medium">{church.name}</span>
              {' - '}
              <Link
                to="/team"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {t('profile.goToTeam')}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  ) : !showDeleteConfirm ? (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {t('profile.deleteAccountWarning')}
      </p>
      <Button
        variant="destructive"
        onClick={() => setShowDeleteConfirm(true)}
        disabled={isSaving}
      >
        {t('profile.deleteAccount')}
      </Button>
    </div>
  ) : isDeleting ? (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">
          {deletionProgress?.message || t('profile.deletingAccount')}
        </span>
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium">{t('profile.deleteAccountTitle')}</p>
          <p className="text-sm mt-1">{t('profile.deleteAccountWarning')}</p>
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="deleteConfirm" className="text-sm">
          {t('profile.typeDeleteToConfirm')}
        </Label>
        <Input
          id="deleteConfirm"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder="DELETE"
          className="font-mono"
        />
      </div>

      {deleteError && (
        <p className="text-sm text-destructive">{deleteError}</p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setShowDeleteConfirm(false)
            setDeleteConfirmText('')
            setDeleteError(null)
          }}
        >
          {t('profile.cancel')}
        </Button>
        <Button
          variant="destructive"
          onClick={handleDeleteAccount}
          disabled={deleteConfirmText !== 'DELETE'}
        >
          {t('profile.deleteAccountButton')}
        </Button>
      </div>
    </div>
  )}
</div>
```

**Step 7: Verify the app compiles**

```bash
cd /Users/markb/dev/mw/app && pnpm build
```

Expected: Build succeeds with no errors

**Step 8: Commit**

```bash
git add src/components/ProfileModal.tsx
git commit -m "feat: add account deletion to ProfileModal"
```

---

## Task 6: Manual Testing

**Step 1: Start the dev server**

```bash
cd /Users/markb/dev/mw/app && pnpm dev
```

**Step 2: Test the blocking state**

1. Sign in as a user who is sole admin of a church
2. Open the profile modal
3. Verify the danger zone shows the blocking message with church links

**Step 3: Test the deletion flow**

1. Create a test account (or use one that's not sole admin)
2. Open profile modal
3. Click "Delete Account"
4. Type "DELETE" in the confirmation field
5. Click "Delete My Account"
6. Verify account is deleted and user is redirected to home

**Step 4: Commit any fixes**

If any issues were found and fixed during testing, commit them:

```bash
git add -A
git commit -m "fix: address account deletion testing issues"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|-----------------|
| 1 | Database migration for invitation FK | 4 |
| 2 | Add translation keys | 3 |
| 3 | Create account service | 2 |
| 4 | Create edge function | 3 |
| 5 | Update ProfileModal | 8 |
| 6 | Manual testing | 4 |

**Total commits:** 6 (one per task)
