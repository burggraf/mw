import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  getEventById,
  getEventItems,
  addEventItem,
  updateEventItem,
  removeEventItem,
  reorderEventItems,
  deleteEvent,
  duplicateEvent,
} from '@/services/events'
import type { Event, EventItemWithData, EventItemType, EventItemCustomizations } from '@/types/event'
import { SortableItemList } from '@/components/events/SortableItemList'
import { AddItemDialog } from '@/components/events/AddItemDialog'
import { EventItemPanel } from '@/components/events/EventItemPanel'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Plus, MoreHorizontal, Pencil, Copy, Trash2, Calendar, ListMusic } from 'lucide-react'
import { toast } from 'sonner'

export function EventDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState<Event | null>(null)
  const [items, setItems] = useState<EventItemWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<EventItemWithData | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    if (id) {
      loadEvent()
    }
  }, [id])

  async function loadEvent() {
    if (!id) return

    setLoading(true)
    try {
      const [eventData, itemsData] = await Promise.all([
        getEventById(id),
        getEventItems(id),
      ])
      setEvent(eventData)
      setItems(itemsData)
    } catch (error) {
      console.error('Failed to load event:', error)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleAddItem(itemType: EventItemType, itemId: string) {
    if (!id) return
    await addEventItem(id, itemType, itemId)
    await loadEvent()
  }

  async function handleUpdateItem(customizations: EventItemCustomizations) {
    if (!selectedItem) return
    await updateEventItem(selectedItem.id, customizations)
    await loadEvent()
    // Keep panel open with updated data
    const updatedItems = await getEventItems(id!)
    setSelectedItem(updatedItems.find(i => i.id === selectedItem.id) || null)
  }

  async function handleRemoveItem() {
    if (!selectedItem) return
    await removeEventItem(selectedItem.id)
    toast.success(t('events.itemRemoved'))
    setSelectedItem(null)
    await loadEvent()
  }

  async function handleReorder(itemIds: string[]) {
    if (!id) return
    await reorderEventItems(id, itemIds)
    // Optimistically update local state
    const reorderedItems = itemIds.map(itemId => items.find(i => i.id === itemId)!).filter(Boolean)
    setItems(reorderedItems)
  }

  async function handleDuplicate() {
    if (!event) return
    try {
      // Default to one week later
      const newDate = new Date(event.scheduledAt)
      newDate.setDate(newDate.getDate() + 7)
      const duplicated = await duplicateEvent(event.id, newDate.toISOString())
      toast.success(t('events.eventDuplicated'))
      navigate(`/events/${duplicated.id}`)
    } catch (error) {
      console.error('Failed to duplicate event:', error)
      toast.error(t('common.error'))
    }
  }

  async function handleDelete() {
    if (!event) return
    try {
      await deleteEvent(event.id)
      toast.success(t('events.eventDeleted'))
      navigate('/events')
    } catch (error) {
      console.error('Failed to delete event:', error)
      toast.error(t('common.error'))
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6 md:mb-8" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-muted-foreground">{t('common.notFound')}</p>
      </div>
    )
  }

  const scheduledDate = new Date(event.scheduledAt)

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)]">
      {/* Main content */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-start gap-3 md:gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/events')} className="shrink-0 mt-1">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{event.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>
                  {format(scheduledDate, 'MMM d, yyyy')} at {format(scheduledDate, 'h:mm a')}
                </span>
              </div>
              {event.description && (
                <p className="text-muted-foreground mt-2 text-sm">{event.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
            <Button asChild variant="outline" size="sm">
              <Link to={`/events/${event.id}/edit`}>
                <Pencil className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('common.edit')}</span>
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  {t('events.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('events.deleteEvent')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Items section */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ListMusic className="h-5 w-5" />
            {t('events.items')}
            <span className="text-muted-foreground font-normal">({items.length})</span>
          </h2>
          <Button onClick={() => setAddDialogOpen(true)} size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            {t('events.addItem')}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <ListMusic className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">{t('events.noItemsDescription')}</p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('events.addItem')}
            </Button>
          </div>
        ) : (
          <SortableItemList
            items={items}
            selectedItemId={selectedItem?.id}
            onItemClick={setSelectedItem}
            onReorder={handleReorder}
          />
        )}
      </div>

      {/* Side panel */}
      {selectedItem && (
        <EventItemPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleUpdateItem}
          onRemove={handleRemoveItem}
        />
      )}

      {/* Add item dialog */}
      <AddItemDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddItem}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('events.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('events.deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
