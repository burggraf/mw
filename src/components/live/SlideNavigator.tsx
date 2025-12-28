import { useTranslation } from 'react-i18next'
import type { Song } from '@/types/song'
import { getSectionLabels } from '@/lib/slide-generator'
import { cn } from '@/lib/utils'

interface SlideNavigatorProps {
  song: Song | null
  currentIndex: number
  onSelectSlide: (index: number) => void
}

export function SlideNavigator({ song, currentIndex, onSelectSlide }: SlideNavigatorProps) {
  const { t } = useTranslation()

  if (!song) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('live.noSongSelected')}
      </div>
    )
  }

  const sections = getSectionLabels(song)

  if (sections.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('live.noSectionsAvailable')}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {sections.map((section, index) => (
        <button
          key={index}
          onClick={() => onSelectSlide(index)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            currentIndex === index
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted/50'
          )}
        >
          {section}
        </button>
      ))}
    </div>
  )
}
