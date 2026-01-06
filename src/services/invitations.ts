import { getSupabase } from '@/lib/supabase'
import type { Invitation, CreateInvitationInput, InvitationStatus, AcceptInvitationResult } from '@/types/team'

// Convert database row to Invitation type
function rowToInvitation(row: any): Invitation {
  const now = new Date()
  const expiresAt = new Date(row.expires_at)
  const isExpired = expiresAt < now
  const isAccepted = !!row.accepted_at

  let status: InvitationStatus = 'pending'
  if (isAccepted) {
    status = 'accepted'
  } else if (isExpired) {
    status = 'expired'
  }

  return {
    id: row.id,
    churchId: row.church_id,
    email: row.email,
    role: row.role,
    token: row.token,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    status,
    inviter: row.user_profiles ? {
      id: row.user_profiles.id,
      displayName: row.user_profiles.display_name,
    } : undefined,
  }
}

// Get all invitations for a church
export async function getInvitations(churchId: string): Promise<Invitation[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('church_id', churchId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(rowToInvitation)
}

// Get pending invitations for a church (not accepted, not expired)
export async function getPendingInvitations(churchId: string): Promise<Invitation[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('church_id', churchId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(rowToInvitation)
}

// Create a new invitation
export async function createInvitation(
  churchId: string,
  input: CreateInvitationInput
): Promise<Invitation> {
  const supabase = getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Check if there's already a pending invitation for this email
  const { data: existing } = await supabase
    .from('invitations')
    .select('id')
    .eq('church_id', churchId)
    .eq('email', input.email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) {
    throw new Error('An invitation has already been sent to this email')
  }

  // Check if user is already a member (need to check via auth.users email)
  // This requires a service role or edge function check
  // For now, the accept_invitation function will reject if already a member

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      church_id: churchId,
      email: input.email.toLowerCase(),
      role: input.role,
      invited_by: user.id,
    })
    .select('*')
    .single()

  if (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      throw new Error('An invitation has already been sent to this email')
    }
    throw error
  }

  return rowToInvitation(data)
}

// Send invitation email via edge function
export async function sendInvitationEmail(
  invitationId: string,
  language: 'en' | 'es' = 'en'
): Promise<{ success: boolean; emailId?: string }> {
  const supabase = getSupabase()

  const { data, error } = await supabase.functions.invoke('send-invitation', {
    body: { invitationId, language },
  })

  if (error) throw error
  return data
}

// Create invitation and send email in one call
export async function createAndSendInvitation(
  churchId: string,
  input: CreateInvitationInput,
  language: 'en' | 'es' = 'en'
): Promise<Invitation> {
  const invitation = await createInvitation(churchId, input)

  try {
    await sendInvitationEmail(invitation.id, language)
  } catch (e) {
    console.error('Failed to send invitation email:', e)
    // Don't throw - invitation was created successfully
  }

  return invitation
}

// Resend invitation email
export async function resendInvitation(
  invitationId: string,
  language: 'en' | 'es' = 'en'
): Promise<void> {
  const supabase = getSupabase()

  // Update expires_at to extend the invitation
  const { error: updateError } = await supabase
    .from('invitations')
    .update({
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    })
    .eq('id', invitationId)

  if (updateError) throw updateError

  await sendInvitationEmail(invitationId, language)
}

// Cancel/delete an invitation
export async function cancelInvitation(invitationId: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId)

  if (error) throw error
}

// Get invitation by token (for acceptance flow)
// Uses RPC function to bypass RLS for anonymous users
export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .rpc('get_invitation_by_token', { p_token: token })

  if (error) {
    console.error('Error fetching invitation by token:', error)
    throw error
  }

  if (!data || data.length === 0) {
    return null
  }

  const row = data[0]
  const now = new Date()
  const expiresAt = new Date(row.expires_at)
  const isExpired = expiresAt < now
  const isAccepted = !!row.accepted_at

  let status: InvitationStatus = 'pending'
  if (isAccepted) {
    status = 'accepted'
  } else if (isExpired) {
    status = 'expired'
  }

  const invitation: Invitation = {
    id: row.id,
    churchId: row.church_id,
    email: row.email,
    role: row.role,
    token: token,
    invitedBy: '', // Not returned by RPC for privacy
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: '', // Not returned by RPC
    status,
  }

  // Add church name
  ;(invitation as any).churchName = row.church_name

  return invitation
}

// Accept an invitation (calls the database RPC function)
export async function acceptInvitation(token: string): Promise<AcceptInvitationResult> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .rpc('accept_invitation', { p_token: token })

  if (error) {
    // Parse the error message for user-friendly display
    const message = error.message || 'Failed to accept invitation'
    throw new Error(message)
  }

  if (!data || data.length === 0) {
    throw new Error('Failed to accept invitation')
  }

  const result = data[0]
  return {
    churchId: result.church_id,
    role: result.role,
    churchName: result.church_name,
  }
}

// Get invitations sent to the current user's email
export async function getMyInvitations(): Promise<Invitation[]> {
  const supabase = getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return []

  const { data, error } = await supabase
    .from('invitations')
    .select(`
      *,
      churches (
        id,
        name
      )
    `)
    .eq('email', user.email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map(row => {
    const invitation = rowToInvitation(row)
    if (row.churches) {
      (invitation as any).churchName = row.churches.name
    }
    return invitation
  })
}
