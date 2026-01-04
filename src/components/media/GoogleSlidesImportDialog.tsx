import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, AlertCircle, Link2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useChurch } from '@/contexts/ChurchContext'
import { useGoogleAuth } from '@/contexts/GoogleAuthContext'
import { getSupabase } from '@/lib/supabase'
import { createMedia, createSlideFolder } from '@/services/media'
import {
  extractPresentationId,
  getPresentation,
  getSlideThumbnail,
  downloadImage,
} from '@/lib/google-slides'
import { generateStoragePath, generateImageThumbnail } from '@/lib/media-utils'
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

interface GoogleSlidesImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (folderId: string) => void
}

type ImportStep = 'url' | 'preview' | 'importing' | 'complete'

interface PresentationInfo {
  id: string
  title: string
  slideCount: number
  slides: Array<{ objectId: string }>
}

export function GoogleSlidesImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: GoogleSlidesImportDialogProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const { accessToken, isAuthenticated, isConfigured, login } = useGoogleAuth()

  const [step, setStep] = useState<ImportStep>('url')
  const [url, setUrl] = useState('')
  const [presentation, setPresentation] = useState<PresentationInfo | null>(null)
  const [folderName, setFolderName] = useState('')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [totalSlides, setTotalSlides] = useState(0)
  const [createdFolderId, setCreatedFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const resetState = useCallback(() => {
    setStep('url')
    setUrl('')
    setPresentation(null)
    setFolderName('')
    setCurrentSlide(0)
    setTotalSlides(0)
    setCreatedFolderId(null)
    setError(null)
    setIsLoading(false)
  }, [])

  const handleClose = useCallback(() => {
    if (step !== 'importing') {
      resetState()
      onOpenChange(false)
    }
  }, [step, resetState, onOpenChange])

  const handleLoadPresentation = useCallback(async () => {
    if (!accessToken) {
      setError(t('slides.googleSlides.errors.authFailed'))
      return
    }

    const presentationId = extractPresentationId(url)
    if (!presentationId) {
      setError(t('slides.googleSlides.errors.invalidUrl'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await getPresentation(accessToken, presentationId)
      setPresentation({
        id: data.presentationId,
        title: data.title,
        slideCount: data.slides.length,
        slides: data.slides,
      })
      setFolderName(data.title)
      setStep('preview')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('slides.googleSlides.errors.networkError')
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, url, t])

  const handleImport = useCallback(async () => {
    if (!accessToken || !presentation || !currentChurch) return

    setStep('importing')
    setTotalSlides(presentation.slideCount)
    setCurrentSlide(0)
    setError(null)

    const supabase = getSupabase()

    try {
      // Create folder for the slides
      const folder = await createSlideFolder(currentChurch.id, {
        name: folderName || presentation.title,
      })
      setCreatedFolderId(folder.id)

      // Import each slide
      for (let i = 0; i < presentation.slides.length; i++) {
        setCurrentSlide(i + 1)
        const slide = presentation.slides[i]

        try {
          // Get thumbnail URL from Google
          const thumbnail = await getSlideThumbnail(
            accessToken,
            presentation.id,
            slide.objectId
          )

          // Download the image
          const imageBlob = await downloadImage(thumbnail.contentUrl)

          // Generate thumbnail for our app
          const file = new File([imageBlob], `slide-${i + 1}.png`, { type: 'image/png' })
          const thumbBlob = await generateImageThumbnail(file)

          // Upload original to Supabase
          const storagePath = generateStoragePath(currentChurch.id, file.name, false, 'image/png')
          const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(storagePath, imageBlob)

          if (uploadError) throw uploadError

          // Upload thumbnail
          const thumbnailPath = generateStoragePath(currentChurch.id, file.name, true)
          await supabase.storage.from('media').upload(thumbnailPath, thumbBlob)

          // Create media record
          await createMedia(currentChurch.id, {
            name: `Slide ${i + 1}`,
            type: 'image',
            mimeType: 'image/png',
            storagePath,
            thumbnailPath,
            fileSize: imageBlob.size,
            width: thumbnail.width,
            height: thumbnail.height,
            source: 'upload',
            category: 'slide',
            folderId: folder.id,
            tags: ['google-slides', presentation.title],
          })

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (slideError) {
          console.error(`Failed to import slide ${i + 1}:`, slideError)
          // Continue with remaining slides
        }
      }

      setStep('complete')
      toast.success(t('slides.googleSlides.importComplete'))
    } catch (err) {
      console.error('Import failed:', err)
      setError(err instanceof Error ? err.message : t('slides.googleSlides.errors.networkError'))
      setStep('preview')
    }
  }, [accessToken, presentation, currentChurch, folderName, t])

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
          <DialogTitle>{t('slides.googleSlides.import')}</DialogTitle>
          <DialogDescription>
            {t('slides.googleSlides.importDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: URL Input */}
        {step === 'url' && (
          <div className="space-y-4">
            {!isConfigured ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 bg-muted rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {t('slides.googleSlides.errors.notConfigured')}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="slides-url">{t('slides.googleSlides.urlLabel')}</Label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="slides-url"
                      placeholder={t('slides.googleSlides.urlPlaceholder')}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}

                {!isAuthenticated ? (
                  <Button onClick={() => login()} className="w-full">
                    <LogIn className="h-4 w-4 mr-2" />
                    {t('slides.googleSlides.connectGoogle')}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleLoadPresentation}
                      disabled={!url || isLoading}
                      className="flex-1"
                    >
                      {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {isLoading ? t('slides.googleSlides.loadingPresentation') : t('common.next')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && presentation && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">{t('slides.googleSlides.presentationTitle')}</p>
              <p className="text-lg font-semibold">{presentation.title}</p>
              <p className="text-sm text-muted-foreground">
                {t('slides.googleSlides.slideCount', { count: presentation.slideCount })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-name">{t('slides.googleSlides.folderNameLabel')}</Label>
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
              <Button variant="outline" onClick={() => setStep('url')}>
                {t('common.back')}
              </Button>
              <Button onClick={handleImport} className="flex-1">
                {t('slides.googleSlides.importButton')}
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
                {t('slides.googleSlides.importing', {
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
              <p className="font-semibold">{t('slides.googleSlides.importComplete')}</p>
              <p className="text-sm text-muted-foreground">
                {t('slides.googleSlides.importCompleteDescription', { count: totalSlides })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleViewFolder} className="flex-1">
                {t('slides.googleSlides.viewFolder')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
