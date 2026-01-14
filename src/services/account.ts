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

  const { error: avatarError } = await supabase.storage
    .from('avatars')
    .remove([`${user.id}/avatar.png`])

  if (avatarError) {
    console.warn('Failed to delete user avatar:', avatarError)
    // Continue anyway - avatar might not exist
  }

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
