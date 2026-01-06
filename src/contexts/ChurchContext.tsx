import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { isTauri, safeInvoke } from '@/lib/tauri'
import { type UserRole, type Permission, hasPermission } from '@/types/team'

export interface Church {
  id: string
  name: string
  role: UserRole
}

interface ChurchContextType {
  churches: Church[]
  currentChurch: Church | null
  currentRole: UserRole | null
  setCurrentChurch: (church: Church) => void
  isLoading: boolean
  refreshChurches: () => Promise<void>
  can: (permission: Permission) => boolean
  isAdmin: boolean
  isEditor: boolean
  isOperator: boolean
}

const ChurchContext = createContext<ChurchContextType | undefined>(undefined)

const CURRENT_CHURCH_KEY = 'mw_current_church'

export function ChurchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [churches, setChurches] = useState<Church[]>([])
  const [currentChurch, setCurrentChurchState] = useState<Church | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadChurches = async () => {
    if (!user) {
      setChurches([])
      setCurrentChurchState(null)
      setIsLoading(false)
      return
    }

    const supabase = getSupabase()

    try {
      const { data, error } = await supabase
        .from('user_church_memberships')
        .select(`
          role,
          church:churches (
            id,
            name
          )
        `)
        .eq('user_id', user.id)

      if (error) {
        console.error('Failed to load churches:', error)
        setIsLoading(false)
        return
      }

      const churchList: Church[] = (data || []).map((row: any) => ({
        id: row.church.id,
        name: row.church.name,
        role: row.role,
      }))

      setChurches(churchList)

      // Auto-select church
      if (churchList.length > 0) {
        const savedChurchId = localStorage.getItem(CURRENT_CHURCH_KEY)
        const savedChurch = churchList.find(c => c.id === savedChurchId)
        setCurrentChurchState(savedChurch || churchList[0])
      } else {
        setCurrentChurchState(null)
      }
    } catch (err) {
      console.error('Failed to load churches:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadChurches()
  }, [user])

  // Auto-start display windows when a church is selected (Tauri only)
  useEffect(() => {
    if (currentChurch && isTauri()) {
      // Auto-open display windows for all external monitors
      safeInvoke('auto_start_display_windows')
        .then((displays: unknown) => {
          console.log('[ChurchContext] Auto-started display windows:', Array.isArray(displays) ? displays.length : 0)
        })
    }
  }, [currentChurch])

  const setCurrentChurch = (church: Church) => {
    setCurrentChurchState(church)
    localStorage.setItem(CURRENT_CHURCH_KEY, church.id)
  }

  const refreshChurches = async () => {
    await loadChurches()
  }

  // Permission checking
  const currentRole = currentChurch?.role ?? null

  const can = (permission: Permission): boolean => {
    return hasPermission(currentRole, permission)
  }

  const isAdmin = currentRole === 'admin'
  const isEditor = currentRole === 'editor'
  const isOperator = currentRole === 'operator'

  return (
    <ChurchContext.Provider value={{
      churches,
      currentChurch,
      currentRole,
      setCurrentChurch,
      isLoading,
      refreshChurches,
      can,
      isAdmin,
      isEditor,
      isOperator,
    }}>
      {children}
    </ChurchContext.Provider>
  )
}

export function useChurch() {
  const context = useContext(ChurchContext)
  if (context === undefined) {
    throw new Error('useChurch must be used within a ChurchProvider')
  }
  return context
}
