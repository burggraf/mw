import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function DashboardPage() {
  const { t } = useTranslation()

  const handleSignOut = () => {
    // TODO: Implement sign out
    console.log('Sign out')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">{t('app.name')}</h1>
          <Button variant="outline" onClick={handleSignOut}>
            {t('auth.signOut')}
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-4">{t('dashboard.title')}</h2>
        <p className="text-muted-foreground">
          {t('dashboard.welcome', { churchName: 'My Church' })}
        </p>
      </main>
    </div>
  )
}
