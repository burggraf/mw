// User roles in a church
export type UserRole = 'admin' | 'editor' | 'operator'

// Permissions that can be checked
export type Permission =
  | 'church:manage'     // Update church settings, delete church
  | 'church:users'      // Manage team members and invitations
  | 'songs:write'       // Create, edit, delete songs
  | 'songs:read'        // View songs
  | 'media:write'       // Upload, edit, delete media
  | 'media:read'        // View media
  | 'events:write'      // Create, edit, delete events
  | 'events:read'       // View events
  | 'displays:control'  // Control displays (go live)
  | 'displays:read'     // View displays

// Role to permissions mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'church:manage',
    'church:users',
    'songs:write',
    'songs:read',
    'media:write',
    'media:read',
    'events:write',
    'events:read',
    'displays:control',
    'displays:read',
  ],
  editor: [
    'songs:write',
    'songs:read',
    'media:write',
    'media:read',
    'events:write',
    'events:read',
    'displays:control',
    'displays:read',
  ],
  operator: [
    'songs:read',
    'media:read',
    'events:read',
    'displays:control',
    'displays:read',
  ],
}

// Check if a role has a specific permission
export function hasPermission(role: UserRole | null, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

// Church membership
export interface Membership {
  id: string
  userId: string
  churchId: string
  role: UserRole
  createdAt: string
  updatedAt: string
  // Joined from user_profiles
  user?: {
    id: string
    displayName: string | null
    email: string | null
    avatarUrl: string | null
  }
}

// Invitation status
export type InvitationStatus = 'pending' | 'accepted' | 'expired'

// Invitation
export interface Invitation {
  id: string
  churchId: string
  email: string
  role: UserRole
  token: string
  invitedBy: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
  status: InvitationStatus
  // Joined from user_profiles
  inviter?: {
    id: string
    displayName: string | null
  }
}

// Input for creating an invitation
export interface CreateInvitationInput {
  email: string
  role: UserRole
}

// Result of accepting an invitation
export interface AcceptInvitationResult {
  churchId: string
  role: UserRole
  churchName: string
}
