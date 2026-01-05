import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Pen, Shapes, Type, MousePointer2, Highlighter, Undo, Redo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Canvas, FabricImage, PencilBrush, Rect, Circle, Line, Triangle, Group, IText } from 'fabric'
import type { TPointerEventInfo } from 'fabric'
import { AnnotationColorPicker } from './AnnotationColorPicker'
import { TextFormattingPanel } from './TextFormattingPanel'
import { SaveAnnotationDialog } from './SaveAnnotationDialog'

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

  // Text tool state
  const [textColor, setTextColor] = useState('#FFFFFF')
  const [fontSize, setFontSize] = useState(24)
  const [fontFamily, setFontFamily] = useState('Arial')
  const [textBold, setTextBold] = useState(false)
  const [textItalic, setTextItalic] = useState(false)
  const [textUnderline, setTextUnderline] = useState(false)
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left')

  // Undo/Redo state
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const isUndoRedoRef = useRef(false)

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return

    let cancelled = false
    let canvas: Canvas | null = null
    let handleResize: (() => void) | null = null

    const initCanvas = async () => {
      try {
        setLoading(true)
        setError(null)

        // Get viewport dimensions
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight - 64

        // Clear any existing dimensions on canvas element before Fabric initializes
        canvasRef.current!.width = 0
        canvasRef.current!.height = 0

        // Create Fabric canvas with viewport dimensions
        // enableRetinaScaling handles high-DPI displays automatically
        canvas = new Canvas(canvasRef.current!, {
          width: viewportWidth,
          height: viewportHeight,
          backgroundColor: '#1a1a1a',
          enableRetinaScaling: true,
        })

        // Attach to DOM element for debugging
        ;(canvasRef.current as any).__fabric = canvas

        if (cancelled) {
          canvas.dispose()
          return
        }

        fabricCanvasRef.current = canvas

        // Handle window resize
        handleResize = () => {
          if (canvas) {
            canvas.setDimensions({
              width: window.innerWidth,
              height: window.innerHeight - 64,
            })
            canvas.renderAll()
          }
        }

        window.addEventListener('resize', handleResize)

        // Load image (Fabric v7 uses Promise-based API)
        const img = await FabricImage.fromURL(imageUrl, {
          crossOrigin: 'anonymous'
        })

        // Check if component was unmounted during image load
        if (cancelled || !canvas) {
          setLoading(false)
          return
        }

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

        // Set scale and position - use center origin for proper centering
        img.set({
          scaleX: scale,
          scaleY: scale,
          originX: 'center',
          originY: 'center',
          left: canvasWidth / 2,
          top: canvasHeight / 2,
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
          lockMovementX: true,
          lockMovementY: true,
        })

        // Add as regular object at bottom of z-index instead of backgroundImage
        canvas.add(img)
        canvas.sendObjectToBack(img)
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
      cancelled = true
      if (handleResize) {
        window.removeEventListener('resize', handleResize)
      }
      if (canvas) {
        canvas.dispose()
        fabricCanvasRef.current = null
      }
    }
  }, [imageUrl, t])

  // Handle select mode and drawing mode
  useEffect(() => {
    if (!fabricCanvasRef.current) return

    const canvas = fabricCanvasRef.current

    if (activeTool === 'select') {
      // Enable object selection
      canvas.isDrawingMode = false
      canvas.selection = true
      canvas.forEachObject((obj) => {
        // Don't make background image selectable
        if (obj.evented === false) return
        obj.selectable = true
        obj.evented = true
      })
      canvas.defaultCursor = 'default'
    } else if (activeTool === 'pen' || activeTool === 'highlighter') {
      // Enable drawing mode
      canvas.selection = false
      canvas.isDrawingMode = true
      const brush = new PencilBrush(canvas)

      if (activeTool === 'highlighter') {
        // Highlighter: semi-transparent, thicker strokes
        brush.color = strokeColor
        brush.width = Math.max(strokeWidth * 3, 15) // Make highlighter 3x thicker, minimum 15px
        // Will set opacity on the path after creation
      } else {
        // Regular pen
        brush.color = strokeColor
        brush.width = strokeWidth
      }

      canvas.freeDrawingBrush = brush
      // Deselect any active objects
      canvas.discardActiveObject()
      canvas.renderAll()

      // Listen for path creation to auto-switch to select mode
      const handlePathCreated = (e: any) => {
        if (e.path) {
          e.path.set({
            selectable: true,
            evented: true,
          })

          // Make highlighter semi-transparent
          if (activeTool === 'highlighter') {
            e.path.set({
              opacity: 0.4,
            })
          }

          // Switch to select mode and select the new path
          setActiveTool('select')
          setTimeout(() => {
            canvas.setActiveObject(e.path)
            canvas.renderAll()
          }, 0)
        }
      }

      canvas.on('path:created', handlePathCreated)

      // Cleanup listener
      return () => {
        canvas.off('path:created', handlePathCreated)
      }
    } else {
      // For other tools, disable selection but not drawing mode
      canvas.isDrawingMode = false
      canvas.selection = false
      // Deselect any active objects
      canvas.discardActiveObject()
      canvas.renderAll()
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
          evented: true,
        })

        canvas.remove(shape)
        canvas.add(group)

        // Switch to select mode and select the new object
        setActiveTool('select')
        canvas.setActiveObject(group)
        canvas.renderAll()
      } else if (shape) {
        // For non-arrow shapes, make them selectable
        shape.set({
          selectable: true,
          evented: true,
        })

        // Switch to select mode and select the new object
        setActiveTool('select')
        canvas.setActiveObject(shape)
        canvas.renderAll()
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

  // Handle text tool
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    if (activeTool !== 'text') {
      canvas.defaultCursor = 'default'
      return
    }

    canvas.isDrawingMode = false
    canvas.defaultCursor = 'text'

    const handleCanvasClick = (e: TPointerEventInfo) => {
      const pointer = e.scenePoint

      const text = new IText('Text', {
        left: pointer.x,
        top: pointer.y,
        fill: textColor,
        fontSize: fontSize,
        fontFamily: fontFamily,
        fontWeight: textBold ? 'bold' : 'normal',
        fontStyle: textItalic ? 'italic' : 'normal',
        underline: textUnderline,
        textAlign: textAlign,
        selectable: true,
        evented: true,
      })

      canvas.add(text)

      // Switch to select mode first
      setActiveTool('select')

      // Then set active and enter editing
      // Use setTimeout to ensure mode switch completes first
      setTimeout(() => {
        canvas.setActiveObject(text)
        text.enterEditing()
        text.selectAll()
      }, 0)
    }

    canvas.on('mouse:down', handleCanvasClick)

    return () => {
      canvas.defaultCursor = 'default'
      canvas.off('mouse:down', handleCanvasClick)
    }
  }, [activeTool, textColor, fontSize, fontFamily, textBold, textItalic, textUnderline, textAlign])

  // Delete key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const canvas = fabricCanvasRef.current
      if (!canvas) return

      // Check if Delete or Backspace key was pressed
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObject = canvas.getActiveObject()

        // Don't delete if user is editing text
        if (activeObject && activeObject.type === 'i-text' && (activeObject as any).isEditing) {
          return
        }

        // Delete selected object(s)
        if (activeObject) {
          e.preventDefault()
          canvas.remove(activeObject)
          canvas.discardActiveObject()
          canvas.renderAll()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Undo/Redo functionality
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const saveState = () => {
      if (isUndoRedoRef.current) return

      const json = JSON.stringify(canvas.toJSON())

      // Remove any redo states after current index
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)

      // Add new state
      historyRef.current.push(json)
      historyIndexRef.current++

      // Limit history to 50 states
      if (historyRef.current.length > 50) {
        historyRef.current.shift()
        historyIndexRef.current--
      }

      setCanUndo(historyIndexRef.current > 0)
      setCanRedo(false)
    }

    // Save initial state
    if (historyRef.current.length === 0) {
      saveState()
    }

    // Listen for canvas modifications
    const handleObjectModified = () => saveState()
    const handleObjectAdded = () => saveState()
    const handleObjectRemoved = () => saveState()

    canvas.on('object:modified', handleObjectModified)
    canvas.on('object:added', handleObjectAdded)
    canvas.on('object:removed', handleObjectRemoved)
    canvas.on('path:created', saveState)

    return () => {
      canvas.off('object:modified', handleObjectModified)
      canvas.off('object:added', handleObjectAdded)
      canvas.off('object:removed', handleObjectRemoved)
      canvas.off('path:created', saveState)
    }
  }, [])

  const handleUndo = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas || historyIndexRef.current <= 0) return

    isUndoRedoRef.current = true
    historyIndexRef.current--
    const json = historyRef.current[historyIndexRef.current]

    canvas.loadFromJSON(json).then(() => {
      canvas.renderAll()
      isUndoRedoRef.current = false
      setCanUndo(historyIndexRef.current > 0)
      setCanRedo(true)
    })
  }

  const handleRedo = () => {
    const canvas = fabricCanvasRef.current
    if (!canvas || historyIndexRef.current >= historyRef.current.length - 1) return

    isUndoRedoRef.current = true
    historyIndexRef.current++
    const json = historyRef.current[historyIndexRef.current]

    canvas.loadFromJSON(json).then(() => {
      canvas.renderAll()
      isUndoRedoRef.current = false
      setCanUndo(true)
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
    })
  }

  const handleSaveClick = () => {
    setShowSaveDialog(true)
  }

  const handleSave = async (replaceOriginal: boolean) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    try {
      setSaving(true)

      // Export canvas to blob
      const dataUrl = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1,
      })

      // Convert data URL to blob
      const response = await fetch(dataUrl)
      const blob = await response.blob()

      // Call the onSave prop
      await _onSave(blob, replaceOriginal)

      setShowSaveDialog(false)
      onClose()
    } catch (error) {
      console.error('Failed to save annotation:', error)
      // Error handling will be done by parent component
    } finally {
      setSaving(false)
    }
  }

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
            variant={activeTool === 'select' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTool('select')}
            title={t('slides.annotation.tools.select')}
          >
            <MousePointer2 className="h-4 w-4" />
          </Button>

          <Button
            variant={activeTool === 'pen' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTool('pen')}
            title={t('slides.annotation.tools.pen')}
          >
            <Pen className="h-4 w-4" />
          </Button>

          <Button
            variant={activeTool === 'text' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTool('text')}
            title={t('slides.annotation.tools.text')}
          >
            <Type className="h-4 w-4" />
          </Button>

          <Button
            variant={activeTool === 'shapes' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTool('shapes')}
            title={t('slides.annotation.tools.shapes')}
          >
            <Shapes className="h-4 w-4" />
          </Button>

          <Button
            variant={activeTool === 'highlighter' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTool('highlighter')}
            title={t('slides.annotation.tools.highlighter')}
          >
            <Highlighter className="h-4 w-4" />
          </Button>

          {/* Undo/Redo buttons */}
          <div className="flex gap-1 ml-2 border-l pl-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={!canUndo}
              title={t('slides.annotation.undo')}
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRedo}
              disabled={!canRedo}
              title={t('slides.annotation.redo')}
            >
              <Redo className="h-4 w-4" />
            </Button>
          </div>

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

          {/* Text formatting panel - only show when text tool is active */}
          {activeTool === 'text' && (
            <TextFormattingPanel
              fontSize={fontSize}
              fontFamily={fontFamily}
              textBold={textBold}
              textItalic={textItalic}
              textUnderline={textUnderline}
              textAlign={textAlign}
              textColor={textColor}
              onFontSizeChange={setFontSize}
              onFontFamilyChange={setFontFamily}
              onToggleBold={() => setTextBold(!textBold)}
              onToggleItalic={() => setTextItalic(!textItalic)}
              onToggleUnderline={() => setTextUnderline(!textUnderline)}
              onTextAlignChange={setTextAlign}
              onTextColorChange={setTextColor}
            />
          )}

          {/* Color picker - only show when not on text tool (text has its own color picker) */}
          {activeTool !== 'text' && (
            <AnnotationColorPicker
              color={strokeColor}
              onChange={setStrokeColor}
            />
          )}

          {/* Stroke width slider - hide when text tool is active */}
          {activeTool !== 'text' && (
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
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('slides.annotation.cancel')}
          </Button>
          <Button onClick={handleSaveClick}>
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

      {/* Save Annotation Dialog */}
      <SaveAnnotationDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  )
}
