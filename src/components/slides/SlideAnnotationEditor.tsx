import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fabric } from 'fabric'

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
  onSave,
}: SlideAnnotationEditorProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const initCanvas = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create Fabric canvas
        const canvas = new fabric.Canvas(canvasRef.current!, {
          width: window.innerWidth,
          height: window.innerHeight - 64, // Subtract header height
          backgroundColor: '#1a1a1a',
        })

        fabricCanvasRef.current = canvas

        // Load image
        fabric.Image.fromURL(imageUrl, (img) => {
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
            1 // Don't scale up
          )

          img.scale(scale)
          img.set({
            left: (canvasWidth - img.width! * scale) / 2,
            top: (canvasHeight - img.height! * scale) / 2,
            selectable: false, // Background image shouldn't be selectable
            evented: false,
          })

          canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))
          setLoading(false)
        }, {
          crossOrigin: 'anonymous'
        })

        // Handle window resize
        const handleResize = () => {
          canvas.setDimensions({
            width: window.innerWidth,
            height: window.innerHeight - 64,
          })
          canvas.renderAll()
        }

        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
          canvas.dispose()
        }
      } catch (err) {
        console.error('Failed to initialize canvas:', err)
        setError(t('slides.annotation.errors.loadFailed'))
        setLoading(false)
      }
    }

    initCanvas()
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
