import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, AlertCircle, Upload, FileIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useChurch } from '@/contexts/ChurchContext'
import { getSupabase } from '@/lib/supabase'
import { createMedia, createSlideFolder } from '@/services/media'
import {
  isValidPptxFile,
  getPowerPointMetadata,
  renderSlidesToImages,
  type PowerPointMetadata,
} from '@/lib/powerpoint'
import { generateStoragePath, generateImageThumbnail, resizeImageIfNeeded } from '@/lib/media-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'

interface PowerPointImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (folderId: string) => void
}

type ImportStep = 'select' | 'preview' | 'importing' | 'complete'

export function PowerPointImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: PowerPointImportDialogProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<ImportStep>('select')
  const [file, setFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<PowerPointMetadata | null>(null)
  const [folderName, setFolderName] = useState('')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [totalSlides, setTotalSlides] = useState(0)
  const [createdFolderId, setCreatedFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const resetState = useCallback(() => {
    setStep('select')
    setFile(null)
    setMetadata(null)
    setFolderName('')
    setCurrentSlide(0)
    setTotalSlides(0)
    setCreatedFolderId(null)
    setError(null)
    setIsLoading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleClose = useCallback(() => {
    if (step !== 'importing') {
      resetState()
      onOpenChange(false)
    }
  }, [step, resetState, onOpenChange])

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!isValidPptxFile(selectedFile)) {
      setError(t('slides.powerpoint.errors.invalidFile'))
      return
    }

    setFile(selectedFile)
    setIsLoading(true)
    setError(null)

    try {
      const meta = await getPowerPointMetadata(selectedFile)
      setMetadata(meta)
      setFolderName(meta.title)
      setStep('preview')
    } catch (err) {
      console.error('Failed to read PowerPoint file:', err)
      setError(t('slides.powerpoint.errors.corrupted'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }, [handleFileSelect])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [handleFileSelect])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleImport = useCallback(async () => {
    if (!file || !metadata || !currentChurch) return

    setStep('importing')
    setTotalSlides(metadata.slideCount)
    setCurrentSlide(0)
    setError(null)

    const supabase = getSupabase()
    let resizedCount = 0

    try {
      // Create folder for the slides
      const folder = await createSlideFolder(currentChurch.id, {
        name: folderName || metadata.title,
      })
      setCreatedFolderId(folder.id)

      // Render all slides to images
      const images = await renderSlidesToImages(file, (current, total) => {
        setCurrentSlide(current)
        setTotalSlides(total)
      })

      // Upload each image
      for (let i = 0; i < images.length; i++) {
        const slideImage = images[i]

        try {
          // Resize if exceeds 4K
          const resizeResult = await resizeImageIfNeeded(slideImage.blob)
          let imageFile = new File([slideImage.blob], `slide-${i + 1}.png`, { type: 'image/png' })
          let imageWidth = slideImage.width
          let imageHeight = slideImage.height

          if (resizeResult.wasResized) {
            resizedCount++
            imageFile = new File([resizeResult.blob], `slide-${i + 1}.png`, { type: 'image/png' })
            imageWidth = resizeResult.newDimensions.width
            imageHeight = resizeResult.newDimensions.height
          }

          // Generate thumbnail
          const thumbBlob = await generateImageThumbnail(imageFile)

          // Upload original to Supabase
          const storagePath = generateStoragePath(currentChurch.id, imageFile.name, false, 'image/png')
          const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(storagePath, imageFile)

          if (uploadError) throw uploadError

          // Upload thumbnail
          const thumbnailPath = generateStoragePath(currentChurch.id, imageFile.name, true)
          await supabase.storage.from('media').upload(thumbnailPath, thumbBlob)

          // Create media record
          await createMedia(currentChurch.id, {
            name: `Slide ${i + 1}`,
            type: 'image',
            mimeType: 'image/png',
            storagePath,
            thumbnailPath,
            fileSize: imageFile.size,
            width: imageWidth,
            height: imageHeight,
            source: 'upload',
            category: 'slide',
            folderId: folder.id,
            tags: ['powerpoint', metadata.title],
          })
        } catch (slideError) {
          console.error(`Failed to upload slide ${i + 1}:`, slideError)
          // Continue with remaining slides
        }
      }

      setStep('complete')
      toast.success(t('slides.powerpoint.importComplete'))

      // Show resize warning if any slides were resized
      if (resizedCount > 0) {
        toast.warning(t('media.slidesResized', { count: resizedCount }))
      }
    } catch (err) {
      console.error('Import failed:', err)
      setError(err instanceof Error ? err.message : t('slides.powerpoint.errors.importFailed'))
      setStep('preview')
    }
  }, [file, metadata, currentChurch, folderName, t])

  const handleViewFolder = useCallback(() => {
    if (createdFolderId) {
      onSuccess?.(createdFolderId)
    }
    handleClose()
  }, [createdFolderId, onSuccess, handleClose])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('slides.powerpoint.import')}</DialogTitle>
          <DialogDescription>
            {t('slides.powerpoint.importDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: File Selection */}
        {step === 'select' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={handleFileInputChange}
                className="hidden"
              />
              {isLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('slides.powerpoint.reading')}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">{t('slides.powerpoint.dropzone')}</p>
                  <p className="text-xs text-muted-foreground">.pptx</p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && metadata && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-3">
                <FileIcon className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="font-semibold">{metadata.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('slides.powerpoint.slideCount', { count: metadata.slideCount })}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-name">{t('slides.powerpoint.folderNameLabel')}</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('select')}>
                {t('common.back')}
              </Button>
              <Button onClick={handleImport} className="flex-1">
                {t('slides.powerpoint.importButton')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                {t('slides.powerpoint.importing', {
                  current: currentSlide,
                  total: totalSlides,
                })}
              </p>
            </div>
            <Progress value={(currentSlide / totalSlides) * 100} />
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <p className="font-semibold">{t('slides.powerpoint.importComplete')}</p>
              <p className="text-sm text-muted-foreground">
                {t('slides.powerpoint.importCompleteDescription', { count: totalSlides })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleViewFolder} className="flex-1">
                {t('slides.powerpoint.viewFolder')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
