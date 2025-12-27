import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Music, Calendar, Monitor, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function DashboardPage() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const navigate = useNavigate()

  const quickActions = [
    {
      title: t('nav.songs'),
      description: 'Manage worship songs',
      icon: Music,
      href: '/songs',
      disabled: false,
    },
    {
      title: t('nav.events'),
      description: 'Plan services and events',
      icon: Calendar,
      href: '/events',
      disabled: true,
    },
    {
      title: t('nav.displays'),
      description: 'Configure presentation displays',
      icon: Monitor,
      href: '/displays',
      disabled: true,
    },
    {
      title: t('nav.team'),
      description: 'Manage team members',
      icon: Users,
      href: '/team',
      disabled: true,
    },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
        {currentChurch && (
          <p className="text-muted-foreground mt-1">
            {t('dashboard.welcome', { churchName: currentChurch.name })}
          </p>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">{t('dashboard.quickActions')}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Card
              key={action.href}
              className={`transition-colors ${
                action.disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-muted/50'
              }`}
              onClick={() => !action.disabled && navigate(action.href)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {action.title}
                </CardTitle>
                <action.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription>
                  {action.disabled ? 'Coming soon' : action.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">{t('dashboard.recentActivity')}</h2>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No recent activity</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
