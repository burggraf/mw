import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getMedia, getMediaById, getSignedMediaUrl } from '@/services/media'
import type { Media } from '@/types/media'
import { MediaGrid } from './MediaGrid'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, X, ImageIcon } from 'lucide-react'

interface MediaPickerProps {
  value?: string // Media ID
  onChange: (mediaId: string | undefined) => void
  type?: 'image' | 'video'
}

export function MediaPicker({ value, onChange, type = 'image' }: MediaPickerProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const [open, setOpen] = useState(false)
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  // Load current selection
  useEffect(() => {
    if (value) {
      getMediaById(value).then((m) => {
        setSelectedMedia(m)
        if (m?.thumbnailPath) {
          getSignedMediaUrl(m.thumbnailPath).then(setThumbnailUrl)
        }
      })
    } else {
      setSelectedMedia(null)
      setThumbnailUrl(null)
    }
  }, [value])

  // Load media when dialog opens
  useEffect(() => {
    if (open && currentChurch) {
      loadMedia()
    }
  }, [open, currentChurch, searchQuery])

  async function loadMedia() {
    if (!currentChurch) return

    setLoading(true)
    try {
      let data = await getMedia(currentChurch.id, { type })
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        data = data.filter((m) => m.name.toLowerCase().includes(query))
      }
      setMedia(data)
    } catch (error) {
      console.error('Failed to load media:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(media: Media) {
    onChange(media.id)
    setOpen(false)
  }

  function handleClear() {
    onChange(undefined)
  }

  return (
    <>
      {/* Preview/trigger */}
      <div className="space-y-2">
        {selectedMedia ? (
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted border">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={selectedMedia.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Skeleton className="w-full h-full" />
            )}
            <button
              onClick={handleClear}
              className="absolute top-2 right-2 p-1 bg-black/50 rounded-full hover:bg-black/70"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => setOpen(true)}
            className="aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
          >
            <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">
              {t('media.selectBackground')}
            </span>
          </div>
        )}

        {selectedMedia && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setOpen(true)}
          >
            {t('common.change', 'Change')}
          </Button>
        )}
      </div>

      {/* Selection dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('media.selectBackground')}</DialogTitle>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('media.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <MediaGrid
              media={media}
              loading={loading}
              onClick={handleSelect}
              selectedId={value}
              selectable
              emptyMessage={t('media.noMedia')}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
