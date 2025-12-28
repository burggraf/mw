import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Monitor, Smartphone } from 'lucide-react'

export function HomePage() {
  const { t } = useTranslation()
  const { user, isLoading } = useAuth()

  // If already logged in, redirect to dashboard
  if (user && !isLoading) {
    window.location.href = '/dashboard'
    return null
  }

  const liveActions = [
    {
      title: t('live.controller.title', 'Controller'),
      description: t('live.controller.description', 'Control presentations from your device'),
      icon: Smartphone,
      href: '/live/controller',
    },
    {
      title: t('live.display.title', 'Display'),
      description: t('live.display.description', 'Present on this screen'),
      icon: Monitor,
      href: '/live/display',
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Hero section */}
      <div className="container mx-auto px-4 py-16">
        <div className="space-y-6 text-center max-w-2xl mx-auto mb-16">
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

        {/* Live Control section */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">{t('live.title', 'Live Control')}</h2>
            <p className="text-muted-foreground">{t('live.subtitle', 'Start a presentation or connect as a display')}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {liveActions.map((action) => (
              <Link key={action.href} to={action.href} className="block">
                <Card className="transition-colors cursor-pointer hover:bg-muted/50 h-full">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-2xl font-bold">
                      {action.title}
                    </CardTitle>
                    <action.icon className="h-6 w-6 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {action.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
