import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { invoke } from '@tauri-apps/api/core'

export interface Church {
  id: string
  name: string
  role: 'admin' | 'editor' | 'operator'
}

interface ChurchContextType {
  churches: Church[]
  currentChurch: Church | null
  setCurrentChurch: (church: Church) => void
  isLoading: boolean
  refreshChurches: () => Promise<void>
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

  // Auto-start display windows when a church is selected
  useEffect(() => {
    if (currentChurch) {
      // Auto-open display windows for all external monitors
      invoke('auto_start_display_windows')
        .then((displays: any[]) => {
          console.log('[ChurchContext] Auto-started display windows:', displays.length)
        })
        .catch((err) => {
          console.error('[ChurchContext] Failed to auto-start displays:', err)
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

  return (
    <ChurchContext.Provider value={{
      churches,
      currentChurch,
      setCurrentChurch,
      isLoading,
      refreshChurches,
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
