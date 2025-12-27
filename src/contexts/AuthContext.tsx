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
  signUp: (email: string, password: string, churchName: string) => Promise<SignUpResult>
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

  useEffect(() => {
    const supabase = getSupabase()

    // Get initial session
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await checkChurchMembership(session.user.id)
      }
      setIsLoading(false)
    }
    initSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          // Check for pending church creation (from email signup flow)
          const pendingChurchName = localStorage.getItem('pendingChurchName')
          if (pendingChurchName && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
            // User confirmed email and signed in - create their church
            const { error: churchError } = await supabase.rpc('create_church_with_admin', {
              church_name: pendingChurchName
            })
            if (!churchError) {
              localStorage.removeItem('pendingChurchName')
              setHasChurch(true)
            } else {
              console.error('Error creating pending church:', churchError)
              await checkChurchMembership(session.user.id)
            }
          } else {
            await checkChurchMembership(session.user.id)
          }
        } else {
          setHasChurch(null)
        }
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, churchName: string): Promise<SignUpResult> => {
    const supabase = getSupabase()

    // Sign up the user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) throw error
    if (!data.user) throw new Error('Signup failed')

    // Check if user needs to confirm email
    // If session exists, user is immediately authenticated (auto-confirm enabled)
    // If no session, user needs to confirm email first
    if (data.session) {
      // User is authenticated, create church immediately
      const { error: churchError } = await supabase.rpc('create_church_with_admin', {
        church_name: churchName
      })
      if (churchError) throw churchError
      setHasChurch(true)
      return { needsEmailConfirmation: false }
    } else {
      // User needs to confirm email - store church name for later
      // We'll create the church when they first log in after confirmation
      localStorage.setItem('pendingChurchName', churchName)
      return { needsEmailConfirmation: true }
    }
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
