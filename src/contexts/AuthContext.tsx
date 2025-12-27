import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

interface SignUpResult {
  needsEmailConfirmation: boolean
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasChurch, setHasChurch] = useState<boolean | null>(null)

  // Check if user has a church membership
  const checkChurchMembership = async (userId: string): Promise<boolean> => {
    const supabase = getSupabase()
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
  }

  // Check for and accept pending invitations
  const checkAndAcceptInvitation = async (userEmail: string): Promise<boolean> => {
    const supabase = getSupabase()

    // Find pending invitation for this email
    const { data: invitations, error: inviteError } = await supabase
      .from('invitations')
      .select('id, church_id, role')
      .eq('email', userEmail.toLowerCase())
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)

    if (inviteError) {
      console.error('Error checking invitations:', inviteError)
      return false
    }

    if (!invitations || invitations.length === 0) {
      // No pending invitation
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
  }

  // Check user's church status: invitation first, then existing membership
  const checkUserChurchStatus = async (userEmail: string, userId: string) => {
    console.log('checkUserChurchStatus:', { userEmail, userId })

    // First check for pending invitations
    const acceptedInvite = await checkAndAcceptInvitation(userEmail)
    console.log('Invitation check result:', acceptedInvite)

    if (acceptedInvite) {
      return // hasChurch already set to true
    }

    // No invitation, check existing membership
    const hasMembership = await checkChurchMembership(userId)
    console.log('Membership check result:', hasMembership)
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
      async (event, session) => {
        console.log('onAuthStateChange:', event, session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user?.email) {
          await checkUserChurchStatus(session.user.email, session.user.id)
        } else {
          setHasChurch(null)
        }
        console.log('Auth state change complete, isLoading -> false')
        setIsLoading(false)
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
