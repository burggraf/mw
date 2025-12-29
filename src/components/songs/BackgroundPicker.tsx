import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getMedia, getSignedMediaUrl } from '@/services/media'
import type { Media } from '@/types/media'
import type { DisplayClass } from '@/types/style'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface BackgroundPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  displayClass?: DisplayClass  // Optional - defaults to 'audience'
  currentBackgroundId: string | null
  onSelect: (backgroundId: string | null) => void
}

export function BackgroundPicker({
  open,
  onOpenChange,
  displayClass = 'audience',  // Default to audience
  currentBackgroundId,
  onSelect,
}: BackgroundPickerProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const [backgrounds, setBackgrounds] = useState<Media[]>([])
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && currentChurch) {
      loadBackgrounds()
    }
  }, [open, currentChurch])

  async function loadBackgrounds() {
    if (!currentChurch) return
    setLoading(true)
    try {
      // Get all media that can serve as backgrounds (images, videos, colors)
      const media = await getMedia(currentChurch.id)
      // Filter to images and videos, plus include built-in solid colors
      const validBackgrounds = media.filter(m =>
        m.type === 'image' || m.type === 'video' || m.backgroundColor !== null
      )
      setBackgrounds(validBackgrounds)

      // Load thumbnail URLs for non-solid-color backgrounds
      const urlMap = new Map<string, string>()
      await Promise.all(
        validBackgrounds.map(async (m) => {
          if (!m.backgroundColor) {
            try {
              const path = m.thumbnailPath || m.storagePath
              if (path) {
                const url = await getSignedMediaUrl(path)
                urlMap.set(m.id, url)
              }
            } catch (err) {
              console.error('Failed to load thumbnail for', m.id, err)
            }
          }
        })
      )
      setThumbnailUrls(urlMap)
    } catch (error) {
      console.error('Failed to load backgrounds:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(backgroundId: string | null) {
    onSelect(backgroundId)
    onOpenChange(false)
  }

  // Get background thumbnail or color
  function getBackgroundStyle(media: Media): React.CSSProperties {
    if (media.backgroundColor) {
      return { backgroundColor: media.backgroundColor }
    }
    const thumbnailUrl = thumbnailUrls.get(media.id)
    if (thumbnailUrl) {
      return {
        backgroundImage: `url(${thumbnailUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }
    return { backgroundColor: '#374151' }
  }

  const displayClassLabels: Record<DisplayClass, string> = {
    audience: t('styles.displayClass.audience'),
    stage: t('styles.displayClass.stage'),
    lobby: t('styles.displayClass.lobby'),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('media.selectBackground')} - {displayClassLabels[displayClass]}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-4">
            {/* None option */}
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start',
                currentBackgroundId === null && 'ring-2 ring-primary'
              )}
              onClick={() => handleSelect(null)}
            >
              {t('media.noBackground', 'No background')}
              {currentBackgroundId === null && <Check className="ml-auto h-4 w-4" />}
            </Button>

            {/* Background grid */}
            <div className="grid grid-cols-3 gap-4">
              {backgrounds.map((bg) => (
                <button
                  key={bg.id}
                  className={cn(
                    'relative aspect-video rounded-lg overflow-hidden border-2 transition-all',
                    currentBackgroundId === bg.id
                      ? 'border-primary ring-2 ring-primary'
                      : 'border-transparent hover:border-muted-foreground/50'
                  )}
                  style={getBackgroundStyle(bg)}
                  onClick={() => handleSelect(bg.id)}
                >
                  {/* Name overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                    <p className="text-xs text-white truncate">{bg.name}</p>
                  </div>

                  {/* Selected check */}
                  {currentBackgroundId === bg.id && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {backgrounds.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                {t('media.noBackgroundsAvailable', 'No backgrounds available. Upload media or create solid color backgrounds.')}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
