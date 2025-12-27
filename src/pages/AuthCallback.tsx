import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'

export function AuthCallbackPage() {
  const { t } = useTranslation()
  const { user, isLoading, hasChurch } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) return

    // If no user after loading, go to login
    if (!user) {
      navigate('/login')
      return
    }

    // If user has church, go to dashboard
    // If not, go to church setup
    if (hasChurch === true) {
      navigate('/dashboard')
    } else if (hasChurch === false) {
      navigate('/setup-church')
    }
    // If hasChurch is null, we're still checking - wait
  }, [user, isLoading, hasChurch, navigate])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  )
}
