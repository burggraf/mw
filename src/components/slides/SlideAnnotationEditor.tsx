import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Canvas, FabricImage } from 'fabric'

interface SlideAnnotationEditorProps {
  imageUrl: string
  imageName: string
  onClose: () => void
  onSave: (imageBlob: Blob, replaceOriginal: boolean) => Promise<void>
}

export function SlideAnnotationEditor({
  imageUrl,
  imageName,
  onClose,
  onSave: _onSave,
}: SlideAnnotationEditorProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<Canvas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    let cleanupFunc: (() => void) | undefined

    const initCanvas = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create Fabric canvas
        const canvas = new Canvas(canvasRef.current!, {
          width: window.innerWidth,
          height: window.innerHeight - 64,
          backgroundColor: '#1a1a1a',
        })

        fabricCanvasRef.current = canvas

        // Handle window resize
        const handleResize = () => {
          canvas.setDimensions({
            width: window.innerWidth,
            height: window.innerHeight - 64,
          })
          canvas.renderAll()
        }

        window.addEventListener('resize', handleResize)

        // Set up cleanup function BEFORE loading image
        cleanupFunc = () => {
          window.removeEventListener('resize', handleResize)
          canvas.dispose()
        }

        // Load image (Fabric v7 uses Promise-based API)
        const img = await FabricImage.fromURL(imageUrl, {
          crossOrigin: 'anonymous'
        })

        if (!img.width || !img.height) {
          setError(t('slides.annotation.errors.loadFailed'))
          setLoading(false)
          return
        }

        // Scale image to fit canvas while maintaining aspect ratio
        const canvasWidth = canvas.width!
        const canvasHeight = canvas.height!
        const scale = Math.min(
          canvasWidth / img.width,
          canvasHeight / img.height,
          1
        )

        img.scale(scale)
        img.set({
          left: (canvasWidth - img.width! * scale) / 2,
          top: (canvasHeight - img.height! * scale) / 2,
          selectable: false,
          evented: false,
        })

        canvas.backgroundImage = img
        canvas.renderAll()
        setLoading(false)
      } catch (err) {
        console.error('Failed to initialize canvas:', err)
        setError(t('slides.annotation.errors.loadFailed'))
        setLoading(false)
      }
    }

    initCanvas()

    return () => {
      if (cleanupFunc) {
        cleanupFunc()
      }
    }
  }, [imageUrl, t])

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />
          {t('slides.annotation.exit')}
        </Button>
        <h2 className="text-lg font-semibold">{imageName}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('slides.annotation.cancel')}
          </Button>
          <Button onClick={() => {}}>
            {t('slides.annotation.save')}
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-muted/20">
        {loading && (
          <div className="absolute text-muted-foreground">
            {t('slides.loading')}
          </div>
        )}
        {error && (
          <div className="absolute text-destructive">
            {error}
          </div>
        )}
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
