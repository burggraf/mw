import { useTranslation } from 'react-i18next'
import type { Song } from '@/types/song'
import { cn } from '@/lib/utils'

interface SetlistPickerProps {
  songs: Song[]
  currentSongId: string | null
  onSelectSong: (id: string) => void
}

export function SetlistPicker({ songs, currentSongId, onSelectSong }: SetlistPickerProps) {
  const { t } = useTranslation()

  if (songs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('live.noSongsInSetlist')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {songs.map((song) => (
        <button
          key={song.id}
          onClick={() => onSelectSong(song.id)}
          className={cn(
            'w-full text-left px-4 py-3 rounded-lg transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            currentSongId === song.id
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted/50'
          )}
        >
          <div className="font-medium">{song.title}</div>
          {song.author && (
            <div className={cn(
              'text-sm mt-1',
              currentSongId === song.id ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}>
              {song.author}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
