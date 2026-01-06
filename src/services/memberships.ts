import { getSupabase } from '@/lib/supabase'
import type { Membership, UserRole } from '@/types/team'

// Convert database row to Membership type
function rowToMembership(row: any): Membership {
  return {
    id: row.id,
    userId: row.user_id,
    churchId: row.church_id,
    role: row.role as UserRole,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: row.user_profiles ? {
      id: row.user_profiles.id,
      displayName: row.user_profiles.display_name,
      email: row.email, // From auth.users via the join
      avatarUrl: row.user_profiles.avatar_url,
    } : undefined,
  }
}

// Get all members of a church
export async function getChurchMembers(churchId: string): Promise<Membership[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('user_church_memberships')
    .select(`
      *,
      user_profiles!user_church_memberships_user_id_fkey (
        id,
        display_name,
        avatar_url
      )
    `)
    .eq('church_id', churchId)
    .order('created_at')

  if (error) throw error

  // Fetch emails separately (auth.users not directly joinable)
  const memberships = (data || []).map(rowToMembership)

  // Get user emails from auth metadata if available
  // For now, we'll rely on display_name which is set during signup
  return memberships
}

// Get a single membership
export async function getMembership(membershipId: string): Promise<Membership | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('user_church_memberships')
    .select(`
      *,
      user_profiles!user_church_memberships_user_id_fkey (
        id,
        display_name,
        avatar_url
      )
    `)
    .eq('id', membershipId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return rowToMembership(data)
}

// Change a member's role
export async function changeRole(membershipId: string, newRole: UserRole): Promise<Membership> {
  const supabase = getSupabase()

  // First get the membership to check admin count
  const { data: membership, error: fetchError } = await supabase
    .from('user_church_memberships')
    .select('church_id, role')
    .eq('id', membershipId)
    .single()

  if (fetchError) throw fetchError

  // If demoting from admin, check if they're the last admin
  if (membership.role === 'admin' && newRole !== 'admin') {
    const adminCount = await getAdminCount(membership.church_id)
    if (adminCount <= 1) {
      throw new Error('Cannot demote the last admin. Promote another member first.')
    }
  }

  const { data, error } = await supabase
    .from('user_church_memberships')
    .update({ role: newRole })
    .eq('id', membershipId)
    .select(`
      *,
      user_profiles!user_church_memberships_user_id_fkey (
        id,
        display_name,
        avatar_url
      )
    `)
    .single()

  if (error) throw error
  return rowToMembership(data)
}

// Remove a member from a church
export async function removeMember(membershipId: string): Promise<void> {
  const supabase = getSupabase()

  // First get the membership to check admin count
  const { data: membership, error: fetchError } = await supabase
    .from('user_church_memberships')
    .select('church_id, role')
    .eq('id', membershipId)
    .single()

  if (fetchError) throw fetchError

  // If removing an admin, check if they're the last admin
  if (membership.role === 'admin') {
    const adminCount = await getAdminCount(membership.church_id)
    if (adminCount <= 1) {
      throw new Error('Cannot remove the last admin.')
    }
  }

  const { error } = await supabase
    .from('user_church_memberships')
    .delete()
    .eq('id', membershipId)

  if (error) throw error
}

// Leave a church (current user)
export async function leaveChurch(membershipId: string): Promise<void> {
  const supabase = getSupabase()

  // The RLS policy handles the last-admin check
  const { error } = await supabase
    .from('user_church_memberships')
    .delete()
    .eq('id', membershipId)

  if (error) {
    // Check if it's the last-admin error from RLS
    if (error.message?.includes('admin')) {
      throw new Error('You are the last admin and cannot leave. Transfer admin role first.')
    }
    throw error
  }
}

// Get count of admins in a church
export async function getAdminCount(churchId: string): Promise<number> {
  const supabase = getSupabase()

  const { count, error } = await supabase
    .from('user_church_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .eq('role', 'admin')

  if (error) throw error
  return count || 0
}

// Get current user's membership in a church
export async function getCurrentMembership(churchId: string): Promise<Membership | null> {
  const supabase = getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_church_memberships')
    .select('*')
    .eq('church_id', churchId)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return rowToMembership(data)
}

// Get all churches where the current user is a member
export async function getUserChurches(): Promise<Array<{ id: string; name: string; role: UserRole }>> {
  const supabase = getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_church_memberships')
    .select(`
      role,
      churches (
        id,
        name
      )
    `)
    .eq('user_id', user.id)

  if (error) throw error

  return (data || []).map((row: any) => ({
    id: row.churches.id,
    name: row.churches.name,
    role: row.role as UserRole,
  }))
}
