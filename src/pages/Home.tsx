import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'

export function HomePage() {
  const { t } = useTranslation()
  const { user, isLoading } = useAuth()

  // If already logged in, redirect to dashboard
  if (user && !isLoading) {
    window.location.href = '/dashboard'
    return null
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-6 text-center max-w-md px-4">
        <h1 className="text-4xl font-bold">{t('app.name')}</h1>
        <p className="text-muted-foreground">{t('app.tagline')}</p>
        <div className="flex gap-4 justify-center">
          <Button asChild>
            <Link to="/login">{t('auth.signIn')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/signup">{t('auth.signUp')}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
