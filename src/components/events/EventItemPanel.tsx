import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { EventItemWithData, EventItemCustomizations } from '@/types/event'
import { parseSongContent } from '@/lib/song-parser'
import { BackgroundPicker } from '@/components/songs/BackgroundPicker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { X, GripVertical, RotateCcw, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface EventItemPanelProps {
  item: EventItemWithData | null
  onClose: () => void
  onUpdate: (customizations: EventItemCustomizations) => void
  onRemove: () => void
}

interface SectionItem {
  id: string
  label: string
  included: boolean
}

function SortableSection({ section, onToggle }: { section: SectionItem; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
    >
      <button className="touch-none cursor-grab" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Checkbox
        id={section.id}
        checked={section.included}
        onCheckedChange={onToggle}
      />
      <Label htmlFor={section.id} className="flex-1 cursor-pointer">
        {section.label}
      </Label>
    </div>
  )
}

export function EventItemPanel({ item, onClose, onUpdate, onRemove }: EventItemPanelProps) {
  const { t } = useTranslation()
  const [sections, setSections] = useState<SectionItem[]>([])
  const [audienceBgId, setAudienceBgId] = useState<string | undefined>()
  const [stageBgId, setStageBgId] = useState<string | undefined>()
  const [lobbyBgId, setLobbyBgId] = useState<string | undefined>()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (item?.song) {
      const parsed = parseSongContent(item.song.content)
      const defaultArrangement = item.song.arrangements?.default || parsed.sections.map(s => s.id)
      const customArrangement = item.customizations.arrangement

      // Build sections list
      const sectionList: SectionItem[] = (customArrangement || defaultArrangement).map(id => {
        const section = parsed.sections.find(s => s.id === id)
        return {
          id,
          label: section?.label || id,
          included: true,
        }
      })

      // Add any sections not in arrangement as unchecked
      for (const section of parsed.sections) {
        if (!sectionList.find(s => s.id === section.id)) {
          sectionList.push({
            id: section.id,
            label: section.label,
            included: false,
          })
        }
      }

      setSections(sectionList)

      // Set backgrounds
      setAudienceBgId(item.customizations.audienceBackgroundId || undefined)
      setStageBgId(item.customizations.stageBackgroundId || undefined)
      setLobbyBgId(item.customizations.lobbyBackgroundId || undefined)
    }
  }, [item])

  if (!item) return null

  const isSong = item.itemType === 'song' && item.song

  function handleSectionToggle(id: string) {
    setSections(prev => prev.map(s =>
      s.id === id ? { ...s, included: !s.included } : s
    ))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSections(prev => {
        const oldIndex = prev.findIndex(s => s.id === active.id)
        const newIndex = prev.findIndex(s => s.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  function handleSave() {
    const customizations: EventItemCustomizations = {}

    if (isSong) {
      // Only save arrangement if different from default
      const arrangement = sections.filter(s => s.included).map(s => s.id)
      customizations.arrangement = arrangement
    }

    if (audienceBgId) customizations.audienceBackgroundId = audienceBgId
    if (stageBgId) customizations.stageBackgroundId = stageBgId
    if (lobbyBgId) customizations.lobbyBackgroundId = lobbyBgId

    onUpdate(customizations)
  }

  function handleReset() {
    setAudienceBgId(undefined)
    setStageBgId(undefined)
    setLobbyBgId(undefined)

    if (item?.song) {
      const parsed = parseSongContent(item.song.content)
      const defaultArrangement = item.song.arrangements?.default || parsed.sections.map(s => s.id)
      setSections(parsed.sections.map(s => ({
        id: s.id,
        label: s.label,
        included: defaultArrangement.includes(s.id),
      })))
    }

    onUpdate({})
  }

  return (
    <div className="w-80 border-l bg-card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold truncate">
          {item.song?.title || item.media?.name || 'Item'}
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
                {t('events.arrangementDescription')}
              </p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {sections.map(section => (
                      <SortableSection
                        key={section.id}
                        section={section}
                        onToggle={() => handleSectionToggle(section.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <Separator />

            {/* Backgrounds */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">{t('events.backgrounds')}</Label>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">{t('styles.displayClass.audience')}</Label>
                  <div className="mt-1">
                    <BackgroundPicker
                      value={audienceBgId}
                      onChange={setAudienceBgId}
                      placeholder={t('events.usingDefaults')}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('styles.displayClass.stage')}</Label>
                  <div className="mt-1">
                    <BackgroundPicker
                      value={stageBgId}
                      onChange={setStageBgId}
                      placeholder={t('events.usingDefaults')}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('styles.displayClass.lobby')}</Label>
                  <div className="mt-1">
                    <BackgroundPicker
                      value={lobbyBgId}
                      onChange={setLobbyBgId}
                      placeholder={t('events.usingDefaults')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {!isSong && item.media && (
          <div className="aspect-video rounded-lg overflow-hidden bg-muted">
            <img
              src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/media/${item.media.storagePath}`}
              alt={item.media.name}
              className="w-full h-full object-cover"
            />
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
    </div>
  )
}
