import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { EventItemWithData } from '@/types/event'
import { cn } from '@/lib/utils'
import { GripVertical, Music, Image, Folder, FileText } from 'lucide-react'

interface EventItemCardProps {
  item: EventItemWithData
  isSelected?: boolean
  onClick?: () => void
}

export function EventItemCard({ item, isSelected, onClick }: EventItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const getIcon = () => {
    switch (item.itemType) {
      case 'song': return <Music className="h-4 w-4" />
      case 'slide': return <Image className="h-4 w-4" />
      case 'slideFolder': return <Folder className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  const getTitle = () => {
    if (item.song) return item.song.title
    if (item.slide) return item.slide.name
    if (item.slideFolder) return item.slideFolder.name
    return 'Unknown Item'
  }

  const getSubtitle = () => {
    if (item.song?.author) return item.song.author
    if (item.slide) return item.slide.type
    if (item.slideFolder) return `${item.slideFolder.slides.length} slides`
    return null
  }

  const hasCustomizations = () => {
    const c = item.customizations
    return c.arrangement || c.audienceBackgroundId || c.stageBackgroundId || c.lobbyBackgroundId
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors',
        isSelected && 'ring-2 ring-primary',
        isDragging && 'opacity-50',
        onClick && 'cursor-pointer hover:bg-muted/50'
      )}
      onClick={onClick}
    >
      {/* Drag handle */}
      <button
        className="touch-none text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Icon */}
      <div className="shrink-0 text-muted-foreground">
        {getIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{getTitle()}</div>
        {getSubtitle() && (
          <div className="text-sm text-muted-foreground truncate">{getSubtitle()}</div>
        )}
      </div>

      {/* Customization indicator */}
      {hasCustomizations() && (
        <div className="shrink-0 w-2 h-2 rounded-full bg-primary" title="Customized" />
      )}
    </div>
  )
}
