import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/Logo'

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
      <div className="container mx-auto px-4 py-16">
        <div className="space-y-6 text-center max-w-2xl mx-auto">
          <div className="flex justify-center">
            <Logo size="xl" />
          </div>
          <h1 className="text-5xl font-bold">{t('app.name')}</h1>
          <p className="text-xl text-muted-foreground">{t('app.tagline')}</p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg">
              <Link to="/login">{t('auth.signIn')}</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/signup">{t('auth.signUp')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
