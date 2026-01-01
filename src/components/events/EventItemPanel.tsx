import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'
import type { EventItemWithData, EventItemCustomizations } from '@/types/event'
import type { DisplayClass } from '@/types/style'
import { parseSong } from '@/lib/song-parser'
import { BackgroundPicker } from '@/components/songs/BackgroundPicker'
import { getSignedMediaUrl } from '@/services/media'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { X, GripVertical, RotateCcw, Trash2, ImageIcon, Copy } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SongSection } from '@/lib/song-parser'

interface EventItemPanelProps {
  item: EventItemWithData | null
  onClose: () => void
  onUpdate: (customizations: EventItemCustomizations) => void
  onRemove: () => void
}

// Each item in the arrangement list - instanceId is unique, sectionId references the original section
interface ArrangementItem {
  instanceId: string  // Unique ID for this instance (for drag-and-drop)
  sectionId: string   // Original section ID (can repeat)
  label: string
}

interface SortableSectionProps {
  item: ArrangementItem
  canDelete: boolean
  onDuplicate: () => void
  onDelete: () => void
}

function SortableSection({ item, canDelete, onDuplicate, onDelete }: SortableSectionProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.instanceId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group"
    >
      <button className="touch-none cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <span className="flex-1 text-sm">{item.label}</span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDuplicate}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t('events.duplicateSection', 'Duplicate')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {canDelete && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{t('events.deleteSection', 'Remove')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

export function EventItemPanel({ item, onClose, onUpdate, onRemove }: EventItemPanelProps) {
  const { t } = useTranslation()
  const [arrangement, setArrangement] = useState<ArrangementItem[]>([])
  const [availableSections, setAvailableSections] = useState<SongSection[]>([])
  const [audienceBgId, setAudienceBgId] = useState<string | null>(null)
  const [stageBgId, setStageBgId] = useState<string | null>(null)
  const [lobbyBgId, setLobbyBgId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState<DisplayClass | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (item?.song) {
      const parsed = parseSong(item.song.content)
      setAvailableSections(parsed.sections)

      const defaultArrangement = item.song.arrangements?.default || parsed.sections.map((s: SongSection) => s.id)
      const customArrangement = item.customizations.arrangement || defaultArrangement

      // Build arrangement list with unique instance IDs
      const arrangementList: ArrangementItem[] = customArrangement.map((sectionId: string) => {
        const section = parsed.sections.find((s: SongSection) => s.id === sectionId)
        return {
          instanceId: uuidv4(),
          sectionId,
          label: section?.label || sectionId,
        }
      })

      setArrangement(arrangementList)

      // Set backgrounds
      setAudienceBgId(item.customizations.audienceBackgroundId || null)
      setStageBgId(item.customizations.stageBackgroundId || null)
      setLobbyBgId(item.customizations.lobbyBackgroundId || null)
    }

    // Load media preview URL for slide items
    if (item?.slide) {
      setMediaLoading(true)
      getSignedMediaUrl(item.slide.storagePath)
        .then(setMediaPreviewUrl)
        .catch(err => {
          console.error('Failed to load slide preview:', err)
          setMediaPreviewUrl(null)
        })
        .finally(() => setMediaLoading(false))
    } else {
      setMediaPreviewUrl(null)
    }
  }, [item])

  if (!item) return null

  const isSong = item.itemType === 'song' && item.song
  const isSlide = item.itemType === 'slide' && item.slide
  const isSlideFolder = item.itemType === 'slideFolder' && item.slideFolder

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setArrangement(prev => {
        const oldIndex = prev.findIndex((item: ArrangementItem) => item.instanceId === active.id)
        const newIndex = prev.findIndex((item: ArrangementItem) => item.instanceId === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  function handleDuplicate(instanceId: string) {
    setArrangement(prev => {
      const index = prev.findIndex((item: ArrangementItem) => item.instanceId === instanceId)
      if (index === -1) return prev

      const itemToDuplicate = prev[index]
      const newItem: ArrangementItem = {
        instanceId: uuidv4(),
        sectionId: itemToDuplicate.sectionId,
        label: itemToDuplicate.label,
      }

      // Insert after the current item
      const newArr = [...prev]
      newArr.splice(index + 1, 0, newItem)
      return newArr
    })
  }

  function handleDelete(instanceId: string) {
    setArrangement(prev => prev.filter((item: ArrangementItem) => item.instanceId !== instanceId))
  }

  function handleAddSection(sectionId: string) {
    const section = availableSections.find((s: SongSection) => s.id === sectionId)
    if (!section) return

    setArrangement(prev => [
      ...prev,
      {
        instanceId: uuidv4(),
        sectionId,
        label: section.label,
      }
    ])
  }

  function handleSave() {
    const customizations: EventItemCustomizations = {}

    if (isSong) {
      // Save arrangement as array of section IDs (can have duplicates)
      customizations.arrangement = arrangement.map((item: ArrangementItem) => item.sectionId)
    }

    if (audienceBgId) customizations.audienceBackgroundId = audienceBgId
    if (stageBgId) customizations.stageBackgroundId = stageBgId
    if (lobbyBgId) customizations.lobbyBackgroundId = lobbyBgId

    onUpdate(customizations)
  }

  function handleReset() {
    setAudienceBgId(null)
    setStageBgId(null)
    setLobbyBgId(null)

    if (item?.song) {
      const parsed = parseSong(item.song.content)
      const defaultArrangement = item.song.arrangements?.default || parsed.sections.map((s: SongSection) => s.id)

      setArrangement(defaultArrangement.map((sectionId: string) => {
        const section = parsed.sections.find((s: SongSection) => s.id === sectionId)
        return {
          instanceId: uuidv4(),
          sectionId,
          label: section?.label || sectionId,
        }
      }))
    }

    onUpdate({})
  }

  function handleBackgroundSelect(bgId: string | null) {
    if (!pickerOpen) return

    switch (pickerOpen) {
      case 'audience':
        setAudienceBgId(bgId)
        break
      case 'stage':
        setStageBgId(bgId)
        break
      case 'lobby':
        setLobbyBgId(bgId)
        break
    }
    setPickerOpen(null)
  }

  function getBackgroundLabel(bgId: string | null): string {
    if (!bgId) return t('events.usingDefaults')
    return t('styles.selectBackground')
  }

  // Check if a section can be deleted (allow deletion as long as there's more than one item)
  function canDeleteSection(): boolean {
    return arrangement.length > 1
  }

  // Find sections not currently in arrangement (for "Add Section" dropdown)
  const sectionsInArrangement = new Set(arrangement.map((item: ArrangementItem) => item.sectionId))
  const unusedSections = availableSections.filter((s: SongSection) => !sectionsInArrangement.has(s.id))

  return (
    <div className="w-80 border-l bg-card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold truncate">
          {item.song?.title || item.slide?.name || item.slideFolder?.name || 'Item'}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isSong && (
          <>
            {/* Arrangement */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">{t('events.arrangement')}</Label>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  {t('events.resetArrangement')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {t('events.arrangementDragDuplicate', 'Drag to reorder. Use icons to duplicate or remove sections.')}
              </p>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={arrangement.map((item: ArrangementItem) => item.instanceId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {arrangement.map((item: ArrangementItem) => (
                      <SortableSection
                        key={item.instanceId}
                        item={item}
                        canDelete={canDeleteSection()}
                        onDuplicate={() => handleDuplicate(item.instanceId)}
                        onDelete={() => handleDelete(item.instanceId)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Add section buttons for unused sections */}
              {unusedSections.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">{t('events.addSection', 'Add section:')}</p>
                  <div className="flex flex-wrap gap-1">
                    {unusedSections.map((section: SongSection) => (
                      <Button
                        key={section.id}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleAddSection(section.id)}
                      >
                        + {section.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Backgrounds */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">{t('events.backgrounds')}</Label>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t('styles.displayClass.audience')}</Label>
                  <Button
                    variant="outline"
                    className="w-full mt-1 justify-start"
                    onClick={() => setPickerOpen('audience')}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {getBackgroundLabel(audienceBgId)}
                  </Button>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('styles.displayClass.stage')}</Label>
                  <Button
                    variant="outline"
                    className="w-full mt-1 justify-start"
                    onClick={() => setPickerOpen('stage')}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {getBackgroundLabel(stageBgId)}
                  </Button>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('styles.displayClass.lobby')}</Label>
                  <Button
                    variant="outline"
                    className="w-full mt-1 justify-start"
                    onClick={() => setPickerOpen('lobby')}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {getBackgroundLabel(lobbyBgId)}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {isSlide && item.slide && (
          <div className="aspect-video rounded-lg overflow-hidden bg-black">
            {mediaLoading ? (
              <Skeleton className="w-full h-full" />
            ) : mediaPreviewUrl ? (
              <img
                src={mediaPreviewUrl}
                alt={item.slide.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                Failed to load
              </div>
            )}
          </div>
        )}

        {isSlideFolder && item.slideFolder && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {item.slideFolder.description && (
                <p className="mb-2">{item.slideFolder.description}</p>
              )}
              <p>
                {t('events.folderSlideCount', { count: item.slideFolder.slides.length })}
              </p>
              {item.slideFolder.defaultLoopTime > 0 && (
                <p className="text-xs">
                  {t('events.folderAutoLoop', { seconds: item.slideFolder.defaultLoopTime })}
                </p>
              )}
            </div>
            {/* Show slide thumbnails */}
            <div className="grid grid-cols-2 gap-2">
              {item.slideFolder.slides.slice(0, 4).map((slide, idx) => (
                <div key={slide.id} className="aspect-video rounded bg-black overflow-hidden">
                  <img
                    src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/media/${slide.thumbnailPath || slide.storagePath}`}
                    alt={slide.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              ))}
              {item.slideFolder.slides.length > 4 && (
                <div className="aspect-video rounded bg-muted flex items-center justify-center text-sm text-muted-foreground">
                  +{item.slideFolder.slides.length - 4} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t space-y-2">
        {isSong && (
          <Button onClick={handleSave} className="w-full">
            {t('common.save')}
          </Button>
        )}
        <Button variant="destructive" onClick={onRemove} className="w-full">
          <Trash2 className="h-4 w-4 mr-2" />
          {t('events.removeItem')}
        </Button>
      </div>

      {/* Background Picker Dialog */}
      {pickerOpen && (
        <BackgroundPicker
          open={!!pickerOpen}
          onOpenChange={(open) => !open && setPickerOpen(null)}
          displayClass={pickerOpen}
          currentBackgroundId={
            pickerOpen === 'audience' ? audienceBgId :
            pickerOpen === 'stage' ? stageBgId :
            lobbyBgId
          }
          onSelect={handleBackgroundSelect}
        />
      )}
    </div>
  )
}
