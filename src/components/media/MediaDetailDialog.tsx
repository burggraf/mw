import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Type } from 'lucide-react'
import { toast } from 'sonner'
import type { Media } from '@/types/media'
import { updateMedia, getSignedMediaUrl } from '@/services/media'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface MediaDetailDialogProps {
  media: Media | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Helper to determine if a color is light (for text contrast)
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  const r = parseInt(c.substr(0, 2), 16)
  const g = parseInt(c.substr(2, 2), 16)
  const b = parseInt(c.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

export function MediaDetailDialog({
  media,
  open,
  onOpenChange,
  onUpdate,
}: MediaDetailDialogProps) {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [showSampleText, setShowSampleText] = useState(false)

  // Check if this is a solid color background
  const isSolidColor = media?.backgroundColor && !media?.storagePath

  const SAMPLE_TEXT = `Amazing grace, how sweet the sound
That saved a wretch like me
I once was lost, but now am found
Was blind, but now I see`

  // Load media data when media prop changes
  useEffect(() => {
    if (media) {
      setName(media.name)
      setTags([...media.tags])
      setNewTag('')
      setPreviewUrl(null)
      setShowSampleText(false)

      // Skip loading for solid color backgrounds
      if (media.backgroundColor && !media.storagePath) {
        setLoadingPreview(false)
        return
      }

      setLoadingPreview(true)

      // Load signed URL for preview
      getSignedMediaUrl(media.storagePath)
        .then((url) => {
          setPreviewUrl(url)
          setLoadingPreview(false)
        })
        .catch((err) => {
          console.error('Failed to load preview:', err)
          setLoadingPreview(false)
        })
    }
  }, [media])

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase()
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleSave = async () => {
    if (!media) return

    setSaving(true)
    try {
      await updateMedia(media.id, { name, tags })
      toast.success(t('songs.songUpdated'))
      onUpdate?.()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to update media:', err)
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (!media) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('common.edit')}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit media name and tags
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Preview */}
          <div className="aspect-video relative rounded-lg overflow-hidden bg-muted border border-gray-400">
            {loadingPreview ? (
              <Skeleton className="absolute inset-0" />
            ) : isSolidColor ? (
              <div
                className="absolute inset-0"
                style={{ backgroundColor: media.backgroundColor! }}
              />
            ) : previewUrl ? (
              media.type === 'video' ? (
                <video
                  src={previewUrl}
                  autoPlay
                  loop
                  muted
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={media.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                {t('common.error')}
              </div>
            )}

            {/* Sample text overlay - shown for all media types */}
            {!loadingPreview && (previewUrl || isSolidColor) && showSampleText && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p
                  className="text-center text-lg font-semibold whitespace-pre-line px-8 text-white"
                  style={{
                    textShadow: `
                      -0.5px -0.5px 0 rgba(0,0,0,0.8),
                       0.5px -0.5px 0 rgba(0,0,0,0.8),
                      -0.5px  0.5px 0 rgba(0,0,0,0.8),
                       0.5px  0.5px 0 rgba(0,0,0,0.8)
                    `,
                  }}
                >
                  {SAMPLE_TEXT}
                </p>
              </div>
            )}
          </div>

          {/* Media Info with toggle button */}
          <div className="flex items-start justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm flex-1">
            <div>
              <span className="text-muted-foreground">{t('media.type')}</span>
              <p className="font-medium capitalize">{media.type}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t('media.size')}</span>
              <p className="font-medium">{formatFileSize(media.fileSize)}</p>
            </div>
            {media.width && media.height && (
              <div>
                <span className="text-muted-foreground">{t('media.dimensions')}</span>
                <p className="font-medium">{media.width} x {media.height}</p>
              </div>
            )}
            {media.duration && (
              <div>
                <span className="text-muted-foreground">{t('media.duration')}</span>
                <p className="font-medium">{formatDuration(media.duration)}</p>
              </div>
            )}
            </div>

            {/* Sample text toggle button */}
            {!loadingPreview && (previewUrl || isSolidColor) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSampleText(!showSampleText)}
              >
                <Type className="h-4 w-4 mr-1" />
                {showSampleText ? 'Hide Text' : 'Show Text'}
              </Button>
            )}
          </div>

          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="media-name">{t('media.name')}</Label>
            <Input
              id="media-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('media.name')}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>{t('media.tags')}</Label>

            {/* Existing tags */}
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 rounded-full hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Remove {tag}</span>
                  </button>
                </Badge>
              ))}
            </div>

            {/* Add new tag */}
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('media.addTag')}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddTag}
                disabled={!newTag.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
