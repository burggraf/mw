import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Pen, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Canvas, FabricImage, PencilBrush, Rect, Circle, Line, Triangle, Group } from 'fabric'
import type { TPointerEventInfo } from 'fabric'
import { AnnotationColorPicker } from './AnnotationColorPicker'

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

  type ToolType = 'select' | 'pen' | 'text' | 'shapes' | 'highlighter'
  const [activeTool, setActiveTool] = useState<ToolType>('select')
  const [strokeColor, setStrokeColor] = useState('#EF4444') // Red
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [selectedShape, setSelectedShape] = useState<'rectangle' | 'circle' | 'line' | 'arrow'>('rectangle')

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

  useEffect(() => {
    if (!fabricCanvasRef.current) return

    const canvas = fabricCanvasRef.current

    if (activeTool === 'pen') {
      canvas.isDrawingMode = true
      const brush = new PencilBrush(canvas)
      brush.color = strokeColor
      brush.width = strokeWidth
      canvas.freeDrawingBrush = brush
    } else {
      canvas.isDrawingMode = false
    }
  }, [activeTool, strokeColor, strokeWidth])

  // Handle shapes tool
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    if (activeTool !== 'shapes') {
      canvas.defaultCursor = 'default'
      return
    }

    canvas.isDrawingMode = false
    canvas.defaultCursor = 'crosshair'

    let isDrawing = false
    let startX = 0
    let startY = 0
    let shape: Rect | Circle | Line | null = null

    const handleMouseDown = (e: TPointerEventInfo) => {
      isDrawing = true
      const pointer = e.scenePoint
      startX = pointer.x
      startY = pointer.y

      // Create shape based on selectedShape
      if (selectedShape === 'rectangle') {
        shape = new Rect({
          left: startX,
          top: startY,
          width: 0,
          height: 0,
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        })
      } else if (selectedShape === 'circle') {
        shape = new Circle({
          left: startX,
          top: startY,
          radius: 0,
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          originX: 'center',
          originY: 'center',
        })
      } else if (selectedShape === 'line' || selectedShape === 'arrow') {
        shape = new Line([startX, startY, startX, startY], {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        })
      }

      if (shape) {
        canvas.add(shape)
      }
    }

    const handleMouseMove = (e: TPointerEventInfo) => {
      if (!isDrawing || !shape) return

      const pointer = e.scenePoint

      if (selectedShape === 'rectangle' && shape instanceof Rect) {
        const width = pointer.x - startX
        const height = pointer.y - startY
        shape.set({ width: Math.abs(width), height: Math.abs(height) })
        if (width < 0) shape.set({ left: pointer.x })
        if (height < 0) shape.set({ top: pointer.y })
      } else if (selectedShape === 'circle' && shape instanceof Circle) {
        const radius = Math.sqrt(Math.pow(pointer.x - startX, 2) + Math.pow(pointer.y - startY, 2))
        shape.set({ radius })
      } else if ((selectedShape === 'line' || selectedShape === 'arrow') && shape instanceof Line) {
        shape.set({ x2: pointer.x, y2: pointer.y })
      }

      canvas.renderAll()
    }

    const handleMouseUp = () => {
      isDrawing = false

      // Remove zero-size shapes
      if (shape) {
        let shouldRemove = false

        if (shape instanceof Rect && (shape.width === 0 || shape.height === 0)) {
          shouldRemove = true
        } else if (shape instanceof Circle && shape.radius === 0) {
          shouldRemove = true
        } else if (shape instanceof Line) {
          const x1 = shape.x1 || 0
          const y1 = shape.y1 || 0
          const x2 = shape.x2 || 0
          const y2 = shape.y2 || 0
          if (x1 === x2 && y1 === y2) {
            shouldRemove = true
          }
        }

        if (shouldRemove) {
          canvas.remove(shape)
          shape = null
          return
        }
      }

      // Add arrow head if arrow type and group with line
      if (selectedShape === 'arrow' && shape instanceof Line) {
        const x1 = shape.x1 || 0
        const y1 = shape.y1 || 0
        const x2 = shape.x2 || 0
        const y2 = shape.y2 || 0

        const angle = Math.atan2(y2 - y1, x2 - x1)
        // Scale arrow head with stroke width
        const headLength = Math.max(15, strokeWidth * 4)

        const arrowHead = new Triangle({
          left: x2,
          top: y2,
          width: headLength,
          height: headLength,
          fill: strokeColor,
          angle: (angle * 180 / Math.PI) + 90,
          originX: 'center',
          originY: 'center',
        })

        // Group the line and arrowhead together
        const group = new Group([shape, arrowHead], {
          selectable: true,
        })

        canvas.remove(shape)
        canvas.add(group)
      }

      shape = null
    }

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)

    return () => {
      canvas.defaultCursor = 'default'
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
    }
  }, [activeTool, selectedShape, strokeColor, strokeWidth])

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />
          {t('slides.annotation.exit')}
        </Button>
        <h2 className="text-lg font-semibold">{imageName}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant={activeTool === 'pen' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTool('pen')}
          >
            <Pen className="h-4 w-4" />
          </Button>

          <Button
            variant={activeTool === 'shapes' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTool('shapes')}
          >
            <Shapes className="h-4 w-4" />
          </Button>

          {/* Shape selector - only show when shapes tool is active */}
          {activeTool === 'shapes' && (
            <div className="flex gap-1 ml-2 border-l pl-2">
              {(['rectangle', 'circle', 'line', 'arrow'] as const).map((shapeType) => (
                <Button
                  key={shapeType}
                  variant={selectedShape === shapeType ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedShape(shapeType)}
                >
                  {t(`slides.annotation.shapeTypes.${shapeType}`)}
                </Button>
              ))}
            </div>
          )}

          {/* Color picker */}
          <AnnotationColorPicker
            color={strokeColor}
            onChange={setStrokeColor}
          />

          {/* Stroke width slider */}
          <div className="flex items-center gap-2 px-2">
            <span className="text-sm text-muted-foreground">
              {t('slides.annotation.width')}
            </span>
            <Slider
              value={[strokeWidth]}
              onValueChange={([value]) => setStrokeWidth(value)}
              min={1}
              max={20}
              step={1}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground w-6">{strokeWidth}px</span>
          </div>
        </div>
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
