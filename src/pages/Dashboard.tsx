import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Music, Calendar, Monitor, Users, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getSongs } from '@/services/songs'
import { getEvents } from '@/services/events'
import { getDisplaysForChurch } from '@/services/displays'
import type { Event } from '@/types/event'

interface DashboardStats {
  songCount: number
  eventCount: number
  displayCount: number
  upcomingEvents: Event[]
}

export function DashboardPage() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>({
    songCount: 0,
    eventCount: 0,
    displayCount: 0,
    upcomingEvents: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStats() {
      if (!currentChurch) {
        setLoading(false)
        return
      }

      try {
        const [songs, events, displays] = await Promise.all([
          getSongs(currentChurch.id),
          getEvents(currentChurch.id, 'upcoming'),
          getDisplaysForChurch(currentChurch.id),
        ])

        // Filter events to only those in the next 7 days
        const now = new Date()
        const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        const upcomingThisWeek = events.filter(event => {
          const eventDate = new Date(event.scheduledAt)
          return eventDate >= now && eventDate <= oneWeekFromNow
        })

        setStats({
          songCount: songs.length,
          eventCount: events.length,
          displayCount: displays.length,
          upcomingEvents: upcomingThisWeek,
        })
      } catch (error) {
        console.error('Failed to load dashboard stats:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [currentChurch])

  const quickActions = [
    {
      title: t('nav.songs'),
      description: t('dashboard.manageSongs'),
      icon: Music,
      href: '/songs',
      disabled: false,
      count: stats.songCount,
    },
    {
      title: t('nav.events'),
      description: t('dashboard.planEvents'),
      icon: Calendar,
      href: '/events',
      disabled: false,
      count: stats.eventCount,
    },
    {
      title: t('nav.displays'),
      description: t('dashboard.configureDisplays'),
      icon: Monitor,
      href: '/displays',
      disabled: false,
      count: stats.displayCount,
    },
    {
      title: t('nav.team'),
      description: t('dashboard.manageTeam'),
      icon: Users,
      href: '/team',
      disabled: true,
      count: null,
    },
  ]

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const isToday = date.toDateString() === now.toDateString()
    const isTomorrow = date.toDateString() === tomorrow.toDateString()

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

    if (isToday) {
      return `${t('dashboard.today')} ${timeStr}`
    } else if (isTomorrow) {
      return `${t('dashboard.tomorrow')} ${timeStr}`
    } else {
      return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + timeStr
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('dashboard.title')}</h1>
        {currentChurch && (
          <p className="text-muted-foreground mt-1">
            {t('dashboard.welcome', { churchName: currentChurch.name })}
          </p>
        )}
      </div>

      <div className="mb-6 md:mb-8">
        <h2 className="text-lg font-semibold mb-3 md:mb-4">{t('dashboard.quickActions')}</h2>
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
                {!action.disabled && action.count !== null && (
                  <div className="text-2xl font-bold mb-1">
                    {loading ? '—' : action.count}
                  </div>
                )}
                <CardDescription>
                  {action.disabled ? t('dashboard.comingSoon') : action.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">{t('dashboard.upcomingThisWeek')}</h2>
        <Card>
          <CardContent className="py-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">{t('common.loading')}</p>
              </div>
            ) : stats.upcomingEvents.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">{t('dashboard.noUpcomingEvents')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{event.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatEventDate(event.scheduledAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
