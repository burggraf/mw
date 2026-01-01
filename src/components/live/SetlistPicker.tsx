import { useTranslation } from 'react-i18next'
import type { EventItemWithData } from '@/types/event'
import { cn } from '@/lib/utils'
import { Music, Image, Folder, Clock } from 'lucide-react'

interface SetlistPickerProps {
  items: EventItemWithData[]
  currentItemId: string | null
  onSelectItem: (itemId: string) => void
}

export function SetlistPicker({ items, currentItemId, onSelectItem }: SetlistPickerProps) {
  const { t } = useTranslation()

  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('live.noItemsInSetlist')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isActive = currentItemId === item.id

        // Determine item display based on type
        let icon = <Music className="h-4 w-4 shrink-0" />
        let title = ''
        let subtitle = ''

        if (item.itemType === 'song' && item.song) {
          icon = <Music className="h-4 w-4 shrink-0" />
          title = item.song.title
          subtitle = item.song.author || ''
        } else if (item.itemType === 'slide' && item.slide) {
          icon = <Image className="h-4 w-4 shrink-0" />
          title = item.slide.name
        } else if (item.itemType === 'slideFolder' && item.slideFolder) {
          icon = <Folder className="h-4 w-4 shrink-0" />
          title = item.slideFolder.name
          subtitle = item.slideFolder.defaultLoopTime > 0
            ? `${item.slideFolder.slides.length} slides • ${item.slideFolder.defaultLoopTime}s loop`
            : `${item.slideFolder.slides.length} slides`
        }

        return (
          <button
            key={item.id}
            onClick={() => onSelectItem(item.id)}
            className={cn(
              'w-full text-left px-4 py-3 rounded-lg transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isActive
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted/50'
            )}
          >
            <div className="flex items-center gap-2">
              {icon}
              <div className="font-medium truncate">{title}</div>
              {item.itemType === 'slideFolder' && item.slideFolder?.defaultLoopTime > 0 && (
                <Clock className="h-3 w-3 ml-auto shrink-0 opacity-70" />
              )}
            </div>
            {subtitle && (
              <div className={cn(
                'text-sm mt-1 truncate',
                isActive ? 'text-primary-foreground/70' : 'text-muted-foreground'
              )}>
                {subtitle}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
