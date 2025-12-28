import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useChurch } from '@/contexts/ChurchContext'
import { getEventById, createEvent, updateEvent } from '@/services/events'
import type { EventInput } from '@/types/event'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

export function EventEditorPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentChurch } = useChurch()

  const isEditing = !!id

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  useEffect(() => {
    if (isEditing) {
      loadEvent()
    } else {
      // Default to next Sunday at 10am
      const now = new Date()
      const nextSunday = new Date(now)
      nextSunday.setDate(now.getDate() + (7 - now.getDay()))
      nextSunday.setHours(10, 0, 0, 0)

      setDate(format(nextSunday, 'yyyy-MM-dd'))
      setTime('10:00')
    }
  }, [id])

  async function loadEvent() {
    if (!id) return

    setLoading(true)
    try {
      const event = await getEventById(id)
      if (event) {
        setName(event.name)
        setDescription(event.description || '')
        const scheduledDate = new Date(event.scheduledAt)
        setDate(format(scheduledDate, 'yyyy-MM-dd'))
        setTime(format(scheduledDate, 'HH:mm'))
      }
    } catch (error) {
      console.error('Failed to load event:', error)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentChurch) return

    setSaving(true)
    try {
      const scheduledAt = new Date(`${date}T${time}`).toISOString()
      const input: EventInput = {
        name,
        description: description || undefined,
        scheduledAt,
      }

      if (isEditing && id) {
        await updateEvent(id, input)
        toast.success(t('events.eventUpdated'))
        navigate(`/events/${id}`)
      } else {
        const event = await createEvent(currentChurch.id, input)
        toast.success(t('events.eventCreated'))
        navigate(`/events/${event.id}`)
      }
    } catch (error) {
      console.error('Failed to save event:', error)
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-8" />
        <div className="max-w-2xl space-y-4">
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="h-24 bg-muted animate-pulse rounded" />
          <div className="h-10 bg-muted animate-pulse rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold">
          {isEditing ? t('events.editEvent') : t('events.newEvent')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('events.eventDetails', 'Event Details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('events.eventName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('events.eventNamePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('events.description')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('events.descriptionPlaceholder')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">{t('events.date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">{t('events.time')}</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
