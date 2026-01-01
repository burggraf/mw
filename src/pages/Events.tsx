import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useChurch } from '@/contexts/ChurchContext'
import { getEvents, getEventItems, getEventItemCount } from '@/services/events'
import type { Event, EventFilter } from '@/types/event'
import { EventCard } from '@/components/events/EventCard'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Calendar } from 'lucide-react'

export function EventsPage() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [events, setEvents] = useState<Event[]>([])
  const [itemCounts, setItemCounts] = useState<Record<string, { songs: number; slides: number }>>({})
  const [filter, setFilter] = useState<EventFilter>('upcoming')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentChurch) {
      loadEvents()
    }
  }, [currentChurch, filter])

  async function loadEvents() {
    if (!currentChurch) return

    setLoading(true)
    try {
      const eventsData = await getEvents(currentChurch.id, filter)
      setEvents(eventsData)

      // Load item counts for each event
      const counts: Record<string, { songs: number; slides: number }> = {}
      await Promise.all(
        eventsData.map(async (event) => {
          const items = await getEventItems(event.id)
          counts[event.id] = getEventItemCount(items)
        })
      )
      setItemCounts(counts)
    } catch (error) {
      console.error('Failed to load events:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!currentChurch) return null

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('events.title')}</h1>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/events/new">
            <Plus className="h-4 w-4 mr-2" />
            {t('events.newEvent')}
          </Link>
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as EventFilter)} className="mb-4 md:mb-6">
        <TabsList>
          <TabsTrigger value="upcoming">{t('events.upcomingEvents')}</TabsTrigger>
          <TabsTrigger value="past">{t('events.pastEvents')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Events list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-1">
            {filter === 'upcoming' ? t('events.noUpcoming') : t('events.noPast')}
          </p>
          {filter === 'upcoming' && (
            <>
              <p className="text-muted-foreground mb-4">
                {t('events.noEventsDescription')}
              </p>
              <Button asChild>
                <Link to="/events/new">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('events.newEvent')}
                </Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              itemCounts={itemCounts[event.id]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
