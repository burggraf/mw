import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

interface SignUpResult {
  needsEmailConfirmation: boolean
}

export interface UserProfile {
  display_name: string | null
  avatar_url: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signUp: (email: string, password: string) => Promise<SignUpResult>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  hasChurch: boolean | null
  createChurch: (churchName: string) => Promise<void>
  userProfile: UserProfile | null
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasChurch, setHasChurch] = useState<boolean | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  // Check if user has a church membership
  const checkChurchMembership = async (userId: string): Promise<boolean> => {
    const supabase = getSupabase()

    try {
      const { data, error } = await supabase
        .from('user_church_memberships')
        .select('id')
        .eq('user_id', userId)
        .limit(1)

      if (error) {
        console.error('Error checking church membership:', error)
        setHasChurch(false)
        return false
      }

      const hasMembership = data && data.length > 0
      setHasChurch(hasMembership)
      return hasMembership
    } catch (err) {
      console.error('Error checking church membership:', err)
      setHasChurch(false)
      return false
    }
  }

  // Check for and accept pending invitations
  // TODO: Re-enable once RLS issue is debugged
  // @ts-expect-error - Temporarily disabled, keeping for later
  const _checkAndAcceptInvitation = async (userEmail: string): Promise<boolean> => {
    try {
      console.log('checkAndAcceptInvitation: starting for', userEmail)
      const supabase = getSupabase()

      // Find pending invitation for this email
      console.log('checkAndAcceptInvitation: querying invitations...')
      const { data: invitations, error: inviteError } = await supabase
        .from('invitations')
        .select('id, church_id, role')
        .eq('email', userEmail.toLowerCase())
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .limit(1)

      console.log('checkAndAcceptInvitation: query complete', { invitations, inviteError })

      if (inviteError) {
        console.error('Error checking invitations:', inviteError)
        return false
      }

      if (!invitations || invitations.length === 0) {
        // No pending invitation
        console.log('checkAndAcceptInvitation: no pending invitations')
        return false
      }

      const invitation = invitations[0]

      // Accept the invitation - add user to church
      const { error: memberError } = await supabase
        .from('user_church_memberships')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          church_id: invitation.church_id,
          role: invitation.role,
        })

      if (memberError) {
        console.error('Error accepting invitation:', memberError)
        return false
      }

      // Mark invitation as accepted
      await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)

      setHasChurch(true)
      return true
    } catch (err) {
      console.error('checkAndAcceptInvitation: unexpected error', err)
      return false
    }
  }

  // Fetch user profile data
  const fetchUserProfile = async (userId: string) => {
    const supabase = getSupabase()
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('display_name, avatar_url')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        setUserProfile(null)
        return
      }

      setUserProfile(data)
    } catch (err) {
      console.error('Error fetching user profile:', err)
      setUserProfile(null)
    }
  }

  // Check user's church status: just check membership for now
  // TODO: Add invitation check back once RLS issue is resolved
  const checkUserChurchStatus = async (_userEmail: string, userId: string) => {
    await Promise.all([
      checkChurchMembership(userId),
      fetchUserProfile(userId)
    ])
  }

  useEffect(() => {
    const supabase = getSupabase()

    // Get initial session
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user?.email) {
        await checkUserChurchStatus(session.user.email, session.user.id)
      }
      setIsLoading(false)
    }
    initSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user?.email) {
          // Defer database query to avoid blocking during auth state change
          // The Supabase client blocks during onAuthStateChange callbacks
          setTimeout(async () => {
            await checkUserChurchStatus(session.user.email!, session.user.id)
            setIsLoading(false)
          }, 0)
        } else {
          setHasChurch(null)
          setUserProfile(null)
          setIsLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const supabase = getSupabase()

    // Sign up the user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) throw error
    if (!data.user) throw new Error('Signup failed')

    // Check if user needs to confirm email
    // If session exists, user is immediately authenticated (auto-confirm enabled)
    // If no session, user needs to confirm email first
    return { needsEmailConfirmation: !data.session }
  }

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signInWithGoogle = async () => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }

  const signInWithMagicLink = async (email: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  }

  const signOut = async () => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) throw new Error('No user logged in')

    const supabase = getSupabase()
    const { error } = await supabase
      .from('user_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (error) throw error

    // Update local state
    setUserProfile(prev => prev ? { ...prev, ...updates } : updates as UserProfile)
  }

  const createChurch = async (churchName: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.rpc('create_church_with_admin', {
      church_name: churchName
    })
    if (error) throw error
    setHasChurch(true)
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isLoading,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithMagicLink,
      signOut,
      hasChurch,
      createChurch,
      userProfile,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
