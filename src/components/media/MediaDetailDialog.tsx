import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Type, Folder, Pen } from 'lucide-react'
import { toast } from 'sonner'
import type { Media, SlideFolder } from '@/types/media'
import { updateMedia, getSignedMediaUrl, getMediaById, createMedia } from '@/services/media'
import { SlideAnnotationEditor } from '@/components/slides/SlideAnnotationEditor'
import { getSupabase } from '@/lib/supabase'
import { generateStoragePath, generateImageThumbnail, getImageDimensions } from '@/lib/media-utils'
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
  folders?: SlideFolder[]
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
  folders,
}: MediaDetailDialogProps) {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [loopTime, setLoopTime] = useState<number | null>(null)
  const [loopTimeInput, setLoopTimeInput] = useState('') // String for controlled input
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [showSampleText, setShowSampleText] = useState(false)
  const [isLightBackground, setIsLightBackground] = useState(false)
  const [showAnnotationEditor, setShowAnnotationEditor] = useState(false)

  // Check if this is a solid color background
  const isSolidColor = media?.backgroundColor && !media?.storagePath

  // Analyze image to determine if background is light or dark
  const analyzeImageBrightness = (imgSrc: string) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Sample at smaller size for performance
      const sampleSize = 50
      canvas.width = sampleSize
      canvas.height = sampleSize
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize)

      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize)
      const data = imageData.data

      let totalLuminance = 0
      const pixelCount = data.length / 4

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b) / 255
      }

      const avgLuminance = totalLuminance / pixelCount
      setIsLightBackground(avgLuminance > 0.5)
    }
    img.src = imgSrc
  }

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
      setLoopTime(media.loopTime)
      setLoopTimeInput(media.loopTime !== null ? String(media.loopTime) : '')
      setPreviewUrl(null)
      setShowSampleText(false)
      setIsLightBackground(false)

      // Handle solid color backgrounds
      if (media.backgroundColor && !media.storagePath) {
        setLoadingPreview(false)
        setIsLightBackground(isLightColor(media.backgroundColor))
        return
      }

      setLoadingPreview(true)

      // Load signed URL for preview
      getSignedMediaUrl(media.storagePath)
        .then((url) => {
          setPreviewUrl(url)
          setLoadingPreview(false)
          // Analyze image brightness for text contrast
          if (media.type === 'image') {
            analyzeImageBrightness(url)
          }
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

  // Handle loop time input change - only allow positive integers up to 999
  const handleLoopTimeChange = (value: string) => {
    // Allow empty string (null value)
    if (value === '') {
      setLoopTimeInput('')
      setLoopTime(null)
      return
    }

    // Only allow digits
    const cleaned = value.replace(/\D/g, '')
    if (cleaned === '') {
      setLoopTimeInput('')
      setLoopTime(null)
      return
    }

    // Parse and clamp to 0-999
    const num = Math.min(999, Math.max(0, parseInt(cleaned, 10)))
    setLoopTimeInput(String(num))
    setLoopTime(num)
  }

  const handleSaveAnnotation = async (imageBlob: Blob, replaceOriginal: boolean) => {
    if (!media) return

    try {
      const supabase = getSupabase()

      // Create a File object from the blob with a descriptive name
      const timestamp = Date.now()
      const baseName = media.name.replace(/\.[^/.]+$/, '') // Remove extension
      const fileName = `${baseName}_annotated_${timestamp}.png`
      const annotatedFile = new File([imageBlob], fileName, { type: 'image/png' })

      // Get dimensions from the annotated image
      let dimensions: { width: number; height: number }
      try {
        dimensions = await getImageDimensions(annotatedFile)
      } catch (err) {
        // Fallback to original media dimensions if available
        console.warn('Failed to get annotated image dimensions, using original:', err)
        dimensions = {
          width: media.width || 1920,
          height: media.height || 1080,
        }
      }

      // Generate storage paths
      const storagePath = generateStoragePath(media.churchId!, fileName, false, 'image/png')
      const thumbnailPath = generateStoragePath(media.churchId!, fileName, true)

      // Generate thumbnail
      let thumbnailBlob: Blob | null = null
      try {
        thumbnailBlob = await generateImageThumbnail(annotatedFile)
      } catch (err) {
        console.error('Failed to generate thumbnail:', err)
        toast.error(t('common.error'))
        return
      }

      // Upload the annotated image
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(storagePath, imageBlob, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        console.error('Failed to upload annotated image:', uploadError)
        toast.error(t('common.error'))
        return
      }

      // Upload the thumbnail
      const { error: thumbUploadError } = await supabase.storage
        .from('media')
        .upload(thumbnailPath, thumbnailBlob, {
          contentType: 'image/webp',
          cacheControl: '3600',
          upsert: false,
        })

      if (thumbUploadError) {
        console.error('Failed to upload thumbnail:', thumbUploadError)
        // Continue even if thumbnail upload fails
      }

      if (replaceOriginal) {
        // Replace the original: update the media record with new storage paths
        // and delete the old files from storage
        const oldStoragePath = media.storagePath
        const oldThumbnailPath = media.thumbnailPath

        // Update the database record to point to new files
        const { data, error } = await supabase
          .from('media')
          .update({
            storage_path: storagePath,
            thumbnail_path: thumbnailPath,
            file_size: imageBlob.size,
            width: dimensions.width,
            height: dimensions.height,
            mime_type: 'image/png',
            updated_at: new Date().toISOString(),
          })
          .eq('id', media.id)
          .select()
          .single()

        if (error) {
          console.error('Failed to update media record:', error)
          toast.error(t('common.error'))
          return
        }

        // Delete old storage files (best effort, don't fail if this errors)
        const filesToDelete = [oldStoragePath]
        if (oldThumbnailPath) {
          filesToDelete.push(oldThumbnailPath)
        }

        await supabase.storage
          .from('media')
          .remove(filesToDelete)
          .catch((err) => console.warn('Failed to delete old files:', err))

        toast.success(t('slides.annotation.success.updated'))
      } else {
        // Save as new: create a new media record
        const newName = `${baseName} (annotated)`

        await createMedia(media.churchId!, {
          name: newName,
          type: 'image',
          mimeType: 'image/png',
          storagePath,
          thumbnailPath,
          fileSize: imageBlob.size,
          width: dimensions.width,
          height: dimensions.height,
          source: 'upload',
          tags: [...media.tags, 'annotated'],
          category: 'slide',
          folderId: media.folderId,
          loopTime: media.loopTime,
        })

        toast.success(t('slides.annotation.success.created'))
      }

      // Close the annotation editor, refresh the UI, and close the dialog
      setShowAnnotationEditor(false)
      onUpdate?.()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save annotation:', err)
      toast.error(t('common.error'))
    }
  }

  const handleSave = async () => {
    if (!media) return

    setSaving(true)
    try {
      // Only send loopTime for slides
      const updateData: { name: string; tags: string[]; loopTime?: number | null } = { name, tags }
      if (media.category === 'slide') {
        updateData.loopTime = loopTime
      }
      await updateMedia(media.id, updateData)
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

  // Find the folder name if the slide is in a folder
  const folderName = media.folderId && folders
    ? folders.find(f => f.id === media.folderId)?.name
    : null

  return (
    <>
      <Dialog open={open && !showAnnotationEditor} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('common.edit')}</DialogTitle>
          {folderName && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Folder className="h-3.5 w-3.5" />
              <span>{folderName}</span>
            </div>
          )}
          <DialogDescription className="sr-only">
            Edit media name and tags
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 pr-2">
          {/* Preview */}
          <div className="aspect-video relative rounded-lg overflow-hidden bg-black border border-gray-400">
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
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={media.name}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                {t('common.error')}
              </div>
            )}

            {/* Sample text overlay - only for backgrounds, not slides */}
            {!loadingPreview && (previewUrl || isSolidColor) && showSampleText && media.category === 'background' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p
                  className="text-center text-lg font-semibold whitespace-pre-line px-8"
                  style={{
                    color: isLightBackground ? '#000000' : '#ffffff',
                    textShadow: isLightBackground
                      ? '2px 2px 6px rgba(255,255,255,0.8)'
                      : '2px 2px 6px rgba(0,0,0,0.8)',
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
                <span className="text-muted-foreground">{t('backgrounds.type')}</span>
                <p className="font-medium capitalize">{media.type}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('backgrounds.size')}</span>
                <p className="font-medium">{formatFileSize(media.fileSize)}</p>
              </div>
              {media.width && media.height && (
                <div>
                  <span className="text-muted-foreground">{t('backgrounds.dimensions')}</span>
                  <p className="font-medium">{media.width} x {media.height}</p>
                </div>
              )}
              {media.duration && (
                <div>
                  <span className="text-muted-foreground">{t('backgrounds.duration')}</span>
                  <p className="font-medium">{formatDuration(media.duration)}</p>
                </div>
              )}
              {/* Loop Time - only for slides */}
              {media.category === 'slide' && (
                <div>
                  <span className="text-muted-foreground">{t('slides.loopTime')}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      value={loopTimeInput}
                      onChange={(e) => handleLoopTimeChange(e.target.value)}
                      placeholder="—"
                      className="w-16 h-7 text-sm px-2"
                    />
                    <span className="text-xs text-muted-foreground">s</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sample text toggle button - only for backgrounds, not slides */}
            {!loadingPreview && (previewUrl || isSolidColor) && media.category === 'background' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSampleText(!showSampleText)}
              >
                <Type className="h-4 w-4 mr-1" />
                {showSampleText ? 'Hide Text' : 'Show Text'}
              </Button>
            )}

            {/* Annotate button - only for image slides */}
            {!loadingPreview && previewUrl && media.category === 'slide' && media.type === 'image' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAnnotationEditor(true)}
              >
                <Pen className="h-4 w-4 mr-1" />
                {t('slides.annotation.title')}
              </Button>
            )}
          </div>

          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="media-name">{t('backgrounds.name')}</Label>
            <Input
              id="media-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('backgrounds.name')}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>{t('backgrounds.tags')}</Label>

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
                placeholder={t('backgrounds.addTag')}
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

      {/* Annotation Editor - fullscreen overlay outside Dialog */}
      {showAnnotationEditor && previewUrl && (
        <SlideAnnotationEditor
          imageUrl={previewUrl}
          imageName={media.name}
          onClose={() => setShowAnnotationEditor(false)}
          onSave={handleSaveAnnotation}
        />
      )}
    </>
  )
}
