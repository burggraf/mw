import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Music, Calendar, Monitor, ImageIcon, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { getSongs } from '@/services/songs'
import { getEvents } from '@/services/events'
import { getDisplaysForChurch } from '@/services/displays'
import { getMedia } from '@/services/media'
import type { Event } from '@/types/event'

interface DashboardStats {
  songCount: number
  eventCount: number
  displayCount: number
  mediaCount: number
  upcomingEvents: Event[]
}

const CACHE_KEY_PREFIX = 'dashboard_stats_'

function getCacheKey(churchId: string): string {
  return `${CACHE_KEY_PREFIX}${churchId}`
}

function loadCachedStats(churchId: string): DashboardStats | null {
  try {
    const cached = localStorage.getItem(getCacheKey(churchId))
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (error) {
    console.error('Failed to load cached dashboard stats:', error)
  }
  return null
}

function saveCachedStats(churchId: string, stats: DashboardStats): void {
  try {
    localStorage.setItem(getCacheKey(churchId), JSON.stringify(stats))
  } catch (error) {
    console.error('Failed to cache dashboard stats:', error)
  }
}

const defaultStats: DashboardStats = {
  songCount: 0,
  eventCount: 0,
  displayCount: 0,
  mediaCount: 0,
  upcomingEvents: [],
}

export function DashboardPage() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>(defaultStats)

  // Load cached data immediately when church changes
  useEffect(() => {
    if (currentChurch) {
      const cached = loadCachedStats(currentChurch.id)
      if (cached) {
        // Filter out past events from cached data
        const now = new Date()
        const filteredEvents = cached.upcomingEvents.filter(event =>
          new Date(event.scheduledAt) >= now
        )
        setStats({ ...cached, upcomingEvents: filteredEvents })
      } else {
        setStats(defaultStats)
      }
    } else {
      setStats(defaultStats)
    }
  }, [currentChurch])

  // Fetch fresh data in the background
  const fetchStats = useCallback(async () => {
    if (!currentChurch) return

    try {
      const [songs, events, displays, media] = await Promise.all([
        getSongs(currentChurch.id),
        getEvents(currentChurch.id, 'upcoming'),
        getDisplaysForChurch(currentChurch.id),
        getMedia(currentChurch.id),
      ])

      // Filter events to only those in the next 7 days
      const now = new Date()
      const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const upcomingThisWeek = events.filter(event => {
        const eventDate = new Date(event.scheduledAt)
        return eventDate >= now && eventDate <= oneWeekFromNow
      })

      const newStats: DashboardStats = {
        songCount: songs.length,
        eventCount: events.length,
        displayCount: displays.length,
        mediaCount: media.length,
        upcomingEvents: upcomingThisWeek,
      }

      setStats(newStats)
      saveCachedStats(currentChurch.id, newStats)
    } catch (error) {
      console.error('Failed to load dashboard stats:', error)
    }
  }, [currentChurch])

  // Fetch fresh data after initial render
  useEffect(() => {
    fetchStats()
  }, [fetchStats])

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
      title: t('nav.media'),
      description: t('dashboard.manageMedia'),
      icon: ImageIcon,
      href: '/media',
      disabled: false,
      count: stats.mediaCount,
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
                    {action.count}
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
            {stats.upcomingEvents.length === 0 ? (
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
