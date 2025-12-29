import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { Event } from '@/types/event'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Music, Image, Play } from 'lucide-react'

interface EventCardProps {
  event: Event
  itemCounts?: { songs: number; media: number }
}

export function EventCard({ event, itemCounts }: EventCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const totalItems = (itemCounts?.songs || 0) + (itemCounts?.media || 0)
  const scheduledDate = new Date(event.scheduledAt)
  const isPast = scheduledDate < new Date()

  const handleStart = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate(`/live/controller/${event.id}`)
  }

  return (
    <Link to={`/events/${event.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{event.name}</h3>
              {event.description && (
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {event.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="default"
                onClick={handleStart}
                className="shrink-0"
              >
                <Play className="h-4 w-4 mr-1" />
                {t('events.start')}
              </Button>

              <div className={`text-right shrink-0 ${isPast ? 'text-muted-foreground' : ''}`}>
                <div className="flex items-center gap-1.5 text-sm">
                  <Calendar className="h-4 w-4" />
                  <span>{format(scheduledDate, 'MMM d, yyyy')}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {format(scheduledDate, 'h:mm a')}
                </div>
              </div>
            </div>
          </div>

          {itemCounts && totalItems > 0 && (
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              {itemCounts.songs > 0 && (
                <div className="flex items-center gap-1">
                  <Music className="h-3.5 w-3.5" />
                  <span>{itemCounts.songs}</span>
                </div>
              )}
              {itemCounts.media > 0 && (
                <div className="flex items-center gap-1">
                  <Image className="h-3.5 w-3.5" />
                  <span>{itemCounts.media}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
