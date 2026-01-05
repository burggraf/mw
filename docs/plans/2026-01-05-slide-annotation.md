# Slide Annotation Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fullscreen image annotation to slides with drawing tools, text, shapes, and save functionality.

**Architecture:** React fullscreen editor using Fabric.js canvas library, integrated into existing MediaDetailDialog. Annotations exported as PNG and saved to Supabase storage either replacing original or as new slide.

**Tech Stack:** Fabric.js, React hooks, Shadcn UI components, Supabase storage

---

## Task 1: Add Fabric.js Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install Fabric.js and types**

```bash
pnpm add fabric
pnpm add -D @types/fabric
```

**Step 2: Verify installation**

Run: `pnpm list fabric`
Expected: `fabric 6.x.x`

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add fabric.js for canvas annotation"
```

---

## Task 2: Create Base SlideAnnotationEditor Component

**Files:**
- Create: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Create component file with basic structure**

```typescript
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Will initialize Fabric.js canvas here
    setLoading(false)
  }, [imageUrl])

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
        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add base SlideAnnotationEditor component"
```

---

## Task 3: Add Annotation i18n Strings

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add English translations**

Add to `en.json` under `"slides"` object:

```json
"annotate": "Annotate",
"annotation": {
  "title": "Annotate Slide",
  "exit": "Exit",
  "cancel": "Cancel",
  "save": "Save",
  "undo": "Undo",
  "redo": "Redo",
  "tools": {
    "pen": "Pen",
    "text": "Text",
    "shapes": "Shapes",
    "highlighter": "Highlighter"
  },
  "shapeTypes": {
    "rectangle": "Rectangle",
    "circle": "Circle",
    "line": "Line",
    "arrow": "Arrow"
  },
  "color": "Color",
  "customColor": "Custom Color",
  "recentColors": "Recent Colors",
  "width": "Width",
  "size": "Size",
  "textFormatting": "Text Formatting",
  "fontFamily": "Font",
  "fontSize": "Size",
  "bold": "Bold",
  "italic": "Italic",
  "underline": "Underline",
  "alignLeft": "Align Left",
  "alignCenter": "Align Center",
  "alignRight": "Align Right",
  "textColor": "Text Color",
  "backgroundColor": "Background Color",
  "noChanges": "No changes to save",
  "unsavedChanges": "You have unsaved changes. Leave anyway?",
  "saveDialog": {
    "title": "Save Annotated Slide",
    "description": "Choose how to save your changes",
    "replaceOriginal": "Replace original slide",
    "replaceWarning": "This will permanently overwrite the original image.",
    "saveAsNew": "Save as new slide",
    "saveAsNewDescription": "Creates a new slide and keeps the original."
  },
  "success": {
    "updated": "Slide updated successfully",
    "created": "New annotated slide created"
  },
  "errors": {
    "loadFailed": "Failed to load image",
    "saveFailed": "Failed to save annotated slide",
    "uploadFailed": "Upload failed. Please try again."
  }
}
```

**Step 2: Add Spanish translations**

Add to `es.json` under `"slides"` object:

```json
"annotate": "Anotar",
"annotation": {
  "title": "Anotar Diapositiva",
  "exit": "Salir",
  "cancel": "Cancelar",
  "save": "Guardar",
  "undo": "Deshacer",
  "redo": "Rehacer",
  "tools": {
    "pen": "Lápiz",
    "text": "Texto",
    "shapes": "Formas",
    "highlighter": "Resaltador"
  },
  "shapeTypes": {
    "rectangle": "Rectángulo",
    "circle": "Círculo",
    "line": "Línea",
    "arrow": "Flecha"
  },
  "color": "Color",
  "customColor": "Color Personalizado",
  "recentColors": "Colores Recientes",
  "width": "Ancho",
  "size": "Tamaño",
  "textFormatting": "Formato de Texto",
  "fontFamily": "Fuente",
  "fontSize": "Tamaño",
  "bold": "Negrita",
  "italic": "Cursiva",
  "underline": "Subrayado",
  "alignLeft": "Alinear Izquierda",
  "alignCenter": "Alinear Centro",
  "alignRight": "Alinear Derecha",
  "textColor": "Color de Texto",
  "backgroundColor": "Color de Fondo",
  "noChanges": "No hay cambios para guardar",
  "unsavedChanges": "Tiene cambios sin guardar. ¿Salir de todos modos?",
  "saveDialog": {
    "title": "Guardar Diapositiva Anotada",
    "description": "Elija cómo guardar sus cambios",
    "replaceOriginal": "Reemplazar diapositiva original",
    "replaceWarning": "Esto sobrescribirá permanentemente la imagen original.",
    "saveAsNew": "Guardar como nueva diapositiva",
    "saveAsNewDescription": "Crea una nueva diapositiva y mantiene el original."
  },
  "success": {
    "updated": "Diapositiva actualizada exitosamente",
    "created": "Nueva diapositiva anotada creada"
  },
  "errors": {
    "loadFailed": "Error al cargar la imagen",
    "saveFailed": "Error al guardar la diapositiva anotada",
    "uploadFailed": "Error en la carga. Por favor, inténtelo de nuevo."
  }
}
```

**Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "i18n: add slide annotation translations"
```

---

## Task 4: Initialize Fabric.js Canvas

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add Fabric.js initialization**

Update the component:

```typescript
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
            Loading...
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
```

**Step 2: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): initialize Fabric.js canvas with image"
```

---

## Task 5: Add Pen Tool

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add pen tool state and functionality**

Add at the top of the component:

```typescript
type ToolType = 'select' | 'pen' | 'text' | 'shapes' | 'highlighter'

// Inside component
const [activeTool, setActiveTool] = useState<ToolType>('select')
const [strokeColor, setStrokeColor] = useState('#EF4444') // Red
const [strokeWidth, setStrokeWidth] = useState(3)

// Add tool activation effect after canvas initialization
useEffect(() => {
  if (!fabricCanvasRef.current) return

  const canvas = fabricCanvasRef.current

  if (activeTool === 'pen') {
    canvas.isDrawingMode = true
    const brush = new fabric.PencilBrush(canvas)
    brush.color = strokeColor
    brush.width = strokeWidth
    canvas.freeDrawingBrush = brush
  } else {
    canvas.isDrawingMode = false
  }
}, [activeTool, strokeColor, strokeWidth])
```

Add Pen button to toolbar (after title):

```typescript
<div className="flex items-center gap-1">
  <Button
    variant={activeTool === 'pen' ? 'default' : 'ghost'}
    size="sm"
    onClick={() => setActiveTool('pen')}
  >
    <Pen className="h-4 w-4" />
  </Button>
</div>
```

**Step 2: Import Pen icon**

Add to imports:

```typescript
import { X, Pen } from 'lucide-react'
```

**Step 3: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add pen drawing tool"
```

---

## Task 6: Create AnnotationColorPicker Component

**Files:**
- Create: `src/components/slides/AnnotationColorPicker.tsx`

**Step 1: Create color picker component**

```typescript
import { useState } from 'react'
import { Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTranslation } from 'react-i18next'

interface AnnotationColorPickerProps {
  color: string
  onChange: (color: string) => void
}

const PRESET_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Gray', value: '#6B7280' },
  { name: 'Brown', value: '#92400E' },
]

export function AnnotationColorPicker({ color, onChange }: AnnotationColorPickerProps) {
  const { t } = useTranslation()
  const [customColor, setCustomColor] = useState(color)
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    const saved = localStorage.getItem('annotation-recent-colors')
    return saved ? JSON.parse(saved) : []
  })

  const handlePresetClick = (value: string) => {
    onChange(value)
  }

  const handleCustomColorChange = (value: string) => {
    setCustomColor(value)
    onChange(value)

    // Add to recent colors
    const updated = [value, ...recentColors.filter(c => c !== value)].slice(0, 5)
    setRecentColors(updated)
    localStorage.setItem('annotation-recent-colors', JSON.stringify(updated))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <div
            className="w-4 h-4 rounded border border-border"
            style={{ backgroundColor: color }}
          />
          {t('slides.annotation.color')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-3">
          {/* Preset colors */}
          <div>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  className="w-8 h-8 rounded border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: preset.value,
                    borderColor: color === preset.value ? '#3B82F6' : '#E5E7EB',
                  }}
                  onClick={() => handlePresetClick(preset.value)}
                  title={preset.name}
                />
              ))}
            </div>
          </div>

          {/* Recent colors */}
          {recentColors.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                {t('slides.annotation.recentColors')}
              </p>
              <div className="flex gap-2">
                {recentColors.map((recentColor) => (
                  <button
                    key={recentColor}
                    className="w-8 h-8 rounded border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: recentColor,
                      borderColor: color === recentColor ? '#3B82F6' : '#E5E7EB',
                    }}
                    onClick={() => handlePresetClick(recentColor)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom color picker */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {t('slides.annotation.customColor')}
            </p>
            <div className="flex gap-2">
              <input
                type="color"
                value={customColor}
                onChange={(e) => handleCustomColorChange(e.target.value)}
                className="w-full h-10 rounded border border-input cursor-pointer"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

**Step 2: Install popover component if needed**

```bash
pnpm dlx shadcn@latest add popover
```

**Step 3: Commit**

```bash
git add src/components/slides/AnnotationColorPicker.tsx
git commit -m "feat(slides): add annotation color picker component"
```

---

## Task 7: Integrate Color Picker into Editor

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Import and add color picker to toolbar**

Add import:

```typescript
import { AnnotationColorPicker } from './AnnotationColorPicker'
```

Add to toolbar (after Pen button):

```typescript
<AnnotationColorPicker
  color={strokeColor}
  onChange={setStrokeColor}
/>
```

**Step 2: Add stroke width slider**

Add import:

```typescript
import { Slider } from '@/components/ui/slider'
```

Add after color picker:

```typescript
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
  <span className="text-xs text-muted-foreground w-6">
    {strokeWidth}
  </span>
</div>
```

**Step 3: Install slider if needed**

```bash
pnpm dlx shadcn@latest add slider
```

**Step 4: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): integrate color picker and width slider"
```

---

## Task 8: Add Shapes Tool

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add shapes state and handler**

Add to component state:

```typescript
type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow'
const [selectedShape, setSelectedShape] = useState<ShapeType>('rectangle')
const [isDrawingShape, setIsDrawingShape] = useState(false)
const shapeOriginRef = useRef<{ x: number; y: number } | null>(null)
const activeShapeRef = useRef<fabric.Object | null>(null)
```

Add shape drawing logic:

```typescript
useEffect(() => {
  if (!fabricCanvasRef.current) return

  const canvas = fabricCanvasRef.current

  if (activeTool === 'shapes') {
    canvas.isDrawingMode = false
    canvas.selection = false

    const handleMouseDown = (e: fabric.IEvent<MouseEvent>) => {
      const pointer = canvas.getPointer(e.e)
      shapeOriginRef.current = { x: pointer.x, y: pointer.y }
      setIsDrawingShape(true)

      let shape: fabric.Object | null = null

      if (selectedShape === 'rectangle') {
        shape = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        })
      } else if (selectedShape === 'circle') {
        shape = new fabric.Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 0,
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        })
      } else if (selectedShape === 'line') {
        shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        })
      }

      if (shape) {
        activeShapeRef.current = shape
        canvas.add(shape)
      }
    }

    const handleMouseMove = (e: fabric.IEvent<MouseEvent>) => {
      if (!isDrawingShape || !shapeOriginRef.current || !activeShapeRef.current) return

      const pointer = canvas.getPointer(e.e)
      const origin = shapeOriginRef.current

      if (selectedShape === 'rectangle') {
        const rect = activeShapeRef.current as fabric.Rect
        rect.set({
          width: Math.abs(pointer.x - origin.x),
          height: Math.abs(pointer.y - origin.y),
          left: Math.min(pointer.x, origin.x),
          top: Math.min(pointer.y, origin.y),
        })
      } else if (selectedShape === 'circle') {
        const circle = activeShapeRef.current as fabric.Circle
        const radius = Math.sqrt(
          Math.pow(pointer.x - origin.x, 2) + Math.pow(pointer.y - origin.y, 2)
        )
        circle.set({ radius })
      } else if (selectedShape === 'line') {
        const line = activeShapeRef.current as fabric.Line
        line.set({ x2: pointer.x, y2: pointer.y })
      }

      canvas.renderAll()
    }

    const handleMouseUp = () => {
      setIsDrawingShape(false)
      shapeOriginRef.current = null
      activeShapeRef.current = null
      canvas.selection = true
    }

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
    }
  } else {
    canvas.selection = true
  }
}, [activeTool, selectedShape, strokeColor, strokeWidth, isDrawingShape])
```

**Step 2: Add shapes button to toolbar**

Add imports:

```typescript
import { X, Pen, Square } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
```

Add to toolbar:

```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant={activeTool === 'shapes' ? 'default' : 'ghost'}
      size="sm"
    >
      <Square className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => {
      setActiveTool('shapes')
      setSelectedShape('rectangle')
    }}>
      {t('slides.annotation.shapeTypes.rectangle')}
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => {
      setActiveTool('shapes')
      setSelectedShape('circle')
    }}>
      {t('slides.annotation.shapeTypes.circle')}
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => {
      setActiveTool('shapes')
      setSelectedShape('line')
    }}>
      {t('slides.annotation.shapeTypes.line')}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Step 3: Install dropdown if needed**

```bash
pnpm dlx shadcn@latest add dropdown-menu
```

**Step 4: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add shapes drawing tool"
```

---

## Task 9: Add Text Tool

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add text tool handler**

Add state:

```typescript
const [fontFamily, setFontFamily] = useState('Arial')
const [fontSize, setFontSize] = useState(24)
const [isBold, setIsBold] = useState(false)
const [isItalic, setIsItalic] = useState(false)
const [isUnderline, setIsUnderline] = useState(false)
const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left')
```

Add text tool logic:

```typescript
useEffect(() => {
  if (!fabricCanvasRef.current) return

  const canvas = fabricCanvasRef.current

  if (activeTool === 'text') {
    canvas.isDrawingMode = false

    const handleMouseDown = (e: fabric.IEvent<MouseEvent>) => {
      const pointer = canvas.getPointer(e.e)

      const text = new fabric.IText(t('slides.annotation.tools.text'), {
        left: pointer.x,
        top: pointer.y,
        fontFamily,
        fontSize,
        fill: strokeColor,
        fontWeight: isBold ? 'bold' : 'normal',
        fontStyle: isItalic ? 'italic' : 'normal',
        underline: isUnderline,
        textAlign,
      })

      canvas.add(text)
      canvas.setActiveObject(text)
      text.enterEditing()
      text.selectAll()
    }

    canvas.on('mouse:down', handleMouseDown)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
    }
  }
}, [activeTool, fontFamily, fontSize, strokeColor, isBold, isItalic, isUnderline, textAlign, t])
```

**Step 2: Add text tool button**

Add import:

```typescript
import { X, Pen, Square, Type } from 'lucide-react'
```

Add button:

```typescript
<Button
  variant={activeTool === 'text' ? 'default' : 'ghost'}
  size="sm"
  onClick={() => setActiveTool('text')}
>
  <Type className="h-4 w-4" />
</Button>
```

**Step 3: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add text annotation tool"
```

---

## Task 10: Create Text Formatting Panel

**Files:**
- Create: `src/components/slides/AnnotationTextPanel.tsx`

**Step 1: Create text formatting panel**

```typescript
import { useTranslation } from 'react-i18next'
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface AnnotationTextPanelProps {
  fontFamily: string
  fontSize: number
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  textAlign: 'left' | 'center' | 'right'
  onFontFamilyChange: (family: string) => void
  onFontSizeChange: (size: number) => void
  onBoldToggle: () => void
  onItalicToggle: () => void
  onUnderlineToggle: () => void
  onTextAlignChange: (align: 'left' | 'center' | 'right') => void
}

const FONT_FAMILIES = [
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier',
  'Verdana',
]

export function AnnotationTextPanel({
  fontFamily,
  fontSize,
  isBold,
  isItalic,
  isUnderline,
  textAlign,
  onFontFamilyChange,
  onFontSizeChange,
  onBoldToggle,
  onItalicToggle,
  onUnderlineToggle,
  onTextAlignChange,
}: AnnotationTextPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="border-b bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Font family */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('slides.annotation.fontFamily')}
          </span>
          <Select value={fontFamily} onValueChange={onFontFamilyChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((font) => (
                <SelectItem key={font} value={font}>
                  {font}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Font size */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('slides.annotation.fontSize')}
          </span>
          <Slider
            value={[fontSize]}
            onValueChange={([value]) => onFontSizeChange(value)}
            min={12}
            max={96}
            step={1}
            className="w-24"
          />
          <span className="text-xs text-muted-foreground w-8">
            {fontSize}
          </span>
        </div>

        {/* Text styling */}
        <div className="flex items-center gap-1">
          <Button
            variant={isBold ? 'default' : 'outline'}
            size="sm"
            onClick={onBoldToggle}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant={isItalic ? 'default' : 'outline'}
            size="sm"
            onClick={onItalicToggle}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant={isUnderline ? 'default' : 'outline'}
            size="sm"
            onClick={onUnderlineToggle}
          >
            <Underline className="h-4 w-4" />
          </Button>
        </div>

        {/* Text alignment */}
        <ToggleGroup
          type="single"
          value={textAlign}
          onValueChange={(value) => value && onTextAlignChange(value as 'left' | 'center' | 'right')}
        >
          <ToggleGroupItem value="left">
            <AlignLeft className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center">
            <AlignCenter className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right">
            <AlignRight className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}
```

**Step 2: Install select and toggle-group if needed**

```bash
pnpm dlx shadcn@latest add select toggle-group
```

**Step 3: Commit**

```bash
git add src/components/slides/AnnotationTextPanel.tsx
git commit -m "feat(slides): add text formatting panel component"
```

---

## Task 11: Integrate Text Panel into Editor

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Import and add text panel**

Add import:

```typescript
import { AnnotationTextPanel } from './AnnotationTextPanel'
```

Add after main toolbar (before canvas area):

```typescript
{activeTool === 'text' && (
  <AnnotationTextPanel
    fontFamily={fontFamily}
    fontSize={fontSize}
    isBold={isBold}
    isItalic={isItalic}
    isUnderline={isUnderline}
    textAlign={textAlign}
    onFontFamilyChange={setFontFamily}
    onFontSizeChange={setFontSize}
    onBoldToggle={() => setIsBold(!isBold)}
    onItalicToggle={() => setIsItalic(!isItalic)}
    onUnderlineToggle={() => setIsUnderline(!isUnderline)}
    onTextAlignChange={setTextAlign}
  />
)}
```

**Step 2: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): integrate text formatting panel"
```

---

## Task 12: Add Highlighter Tool

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add highlighter state and logic**

Add state:

```typescript
const HIGHLIGHTER_COLORS = [
  { name: 'Yellow', value: 'rgba(234, 179, 8, 0.3)' },
  { name: 'Green', value: 'rgba(34, 197, 94, 0.3)' },
  { name: 'Pink', value: 'rgba(236, 72, 153, 0.3)' },
  { name: 'Blue', value: 'rgba(59, 130, 246, 0.3)' },
]

const [highlighterColor, setHighlighterColor] = useState(HIGHLIGHTER_COLORS[0].value)
```

Add highlighter logic to existing pen useEffect:

```typescript
useEffect(() => {
  if (!fabricCanvasRef.current) return

  const canvas = fabricCanvasRef.current

  if (activeTool === 'pen') {
    canvas.isDrawingMode = true
    const brush = new fabric.PencilBrush(canvas)
    brush.color = strokeColor
    brush.width = strokeWidth
    canvas.freeDrawingBrush = brush
  } else if (activeTool === 'highlighter') {
    canvas.isDrawingMode = true
    const brush = new fabric.PencilBrush(canvas)
    brush.color = highlighterColor
    brush.width = 20 // Thicker for highlighting
    canvas.freeDrawingBrush = brush
  } else {
    canvas.isDrawingMode = false
  }
}, [activeTool, strokeColor, strokeWidth, highlighterColor])
```

**Step 2: Add highlighter button**

Add import:

```typescript
import { X, Pen, Square, Type, Highlighter } from 'lucide-react'
```

Add button with color selector:

```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant={activeTool === 'highlighter' ? 'default' : 'ghost'}
      size="sm"
    >
      <Highlighter className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    {HIGHLIGHTER_COLORS.map((color) => (
      <DropdownMenuItem
        key={color.value}
        onClick={() => {
          setActiveTool('highlighter')
          setHighlighterColor(color.value)
        }}
      >
        <div
          className="w-4 h-4 rounded border mr-2"
          style={{ backgroundColor: color.value }}
        />
        {color.name}
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

**Step 3: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add highlighter tool"
```

---

## Task 13: Add Undo/Redo Functionality

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add history state and handlers**

Add state:

```typescript
const [history, setHistory] = useState<string[]>([])
const [historyPointer, setHistoryPointer] = useState(-1)
```

Add save state function:

```typescript
const saveState = useCallback(() => {
  if (!fabricCanvasRef.current) return

  const json = JSON.stringify(fabricCanvasRef.current.toJSON())

  setHistory((prev) => {
    const newHistory = prev.slice(0, historyPointer + 1)
    newHistory.push(json)
    // Limit to 50 entries
    if (newHistory.length > 50) {
      newHistory.shift()
      return newHistory
    }
    return newHistory
  })

  setHistoryPointer((prev) => Math.min(prev + 1, 49))
}, [historyPointer])

const undo = useCallback(() => {
  if (historyPointer <= 0 || !fabricCanvasRef.current) return

  const newPointer = historyPointer - 1
  setHistoryPointer(newPointer)

  const canvas = fabricCanvasRef.current
  canvas.loadFromJSON(history[newPointer], () => {
    canvas.renderAll()
  })
}, [history, historyPointer])

const redo = useCallback(() => {
  if (historyPointer >= history.length - 1 || !fabricCanvasRef.current) return

  const newPointer = historyPointer + 1
  setHistoryPointer(newPointer)

  const canvas = fabricCanvasRef.current
  canvas.loadFromJSON(history[newPointer], () => {
    canvas.renderAll()
  })
}, [history, historyPointer])
```

Add event listeners for history:

```typescript
useEffect(() => {
  if (!fabricCanvasRef.current) return

  const canvas = fabricCanvasRef.current

  const handleObjectAdded = () => {
    saveState()
  }

  const handleObjectModified = () => {
    saveState()
  }

  const handleObjectRemoved = () => {
    saveState()
  }

  canvas.on('object:added', handleObjectAdded)
  canvas.on('object:modified', handleObjectModified)
  canvas.on('object:removed', handleObjectRemoved)

  // Save initial state
  saveState()

  return () => {
    canvas.off('object:added', handleObjectAdded)
    canvas.off('object:modified', handleObjectModified)
    canvas.off('object:removed', handleObjectRemoved)
  }
}, [saveState])
```

Add keyboard shortcuts:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault()
      redo()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [undo, redo])
```

**Step 2: Add undo/redo buttons to toolbar**

Add imports:

```typescript
import { X, Pen, Square, Type, Highlighter, Undo, Redo } from 'lucide-react'
```

Add buttons (before Cancel/Save):

```typescript
<div className="flex items-center gap-1 border-l pl-2">
  <Button
    variant="ghost"
    size="sm"
    onClick={undo}
    disabled={historyPointer <= 0}
  >
    <Undo className="h-4 w-4" />
  </Button>
  <Button
    variant="ghost"
    size="sm"
    onClick={redo}
    disabled={historyPointer >= history.length - 1}
  >
    <Redo className="h-4 w-4" />
  </Button>
</div>
```

**Step 3: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add undo/redo functionality"
```

---

## Task 14: Create SaveAnnotationDialog Component

**Files:**
- Create: `src/components/slides/SaveAnnotationDialog.tsx`

**Step 1: Create save dialog component**

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

interface SaveAnnotationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (replaceOriginal: boolean) => void
  saving: boolean
}

export function SaveAnnotationDialog({
  open,
  onOpenChange,
  onSave,
  saving,
}: SaveAnnotationDialogProps) {
  const { t } = useTranslation()
  const [replaceOriginal, setReplaceOriginal] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('slides.annotation.saveDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('slides.annotation.saveDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={replaceOriginal ? 'replace' : 'new'}
          onValueChange={(value) => setReplaceOriginal(value === 'replace')}
          className="space-y-4"
        >
          <div className="flex items-start space-x-3 space-y-0">
            <RadioGroupItem value="replace" id="replace" />
            <div className="space-y-1">
              <Label htmlFor="replace" className="font-medium cursor-pointer">
                {t('slides.annotation.saveDialog.replaceOriginal')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('slides.annotation.saveDialog.replaceWarning')}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 space-y-0">
            <RadioGroupItem value="new" id="new" />
            <div className="space-y-1">
              <Label htmlFor="new" className="font-medium cursor-pointer">
                {t('slides.annotation.saveDialog.saveAsNew')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('slides.annotation.saveDialog.saveAsNewDescription')}
              </p>
            </div>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('slides.annotation.cancel')}
          </Button>
          <Button
            onClick={() => onSave(replaceOriginal)}
            disabled={saving}
          >
            {saving ? t('common.saving') : t('slides.annotation.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Install radio-group if needed**

```bash
pnpm dlx shadcn@latest add radio-group
```

**Step 3: Commit**

```bash
git add src/components/slides/SaveAnnotationDialog.tsx
git commit -m "feat(slides): add save annotation dialog"
```

---

## Task 15: Implement Save Functionality

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`
- Modify: `src/services/media.ts`

**Step 1: Add export function to media service**

Add to `src/services/media.ts`:

```typescript
export async function saveAnnotatedSlide(
  originalMedia: Media,
  imageBlob: Blob,
  replaceOriginal: boolean
): Promise<Media> {
  if (replaceOriginal) {
    // Upload to same path (overwrites)
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(originalMedia.storagePath, imageBlob, {
        upsert: true,
        contentType: 'image/png',
      })

    if (uploadError) throw uploadError

    // Update file size
    const { error: updateError } = await supabase
      .from('media')
      .update({
        file_size: imageBlob.size,
        updated_at: new Date().toISOString(),
      })
      .eq('id', originalMedia.id)

    if (updateError) throw updateError

    return { ...originalMedia, file_size: imageBlob.size }
  } else {
    // Create new slide
    const timestamp = Date.now()
    const newFileName = `${originalMedia.storagePath.split('/').pop()?.replace(/\.[^.]+$/, '')}-annotated-${timestamp}.png`
    const newPath = `${originalMedia.storagePath.split('/').slice(0, -1).join('/')}/${newFileName}`

    // Upload new file
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(newPath, imageBlob, {
        contentType: 'image/png',
      })

    if (uploadError) throw uploadError

    // Create new media record
    const { data: newMedia, error: insertError } = await supabase
      .from('media')
      .insert({
        church_id: originalMedia.church_id,
        name: `${originalMedia.name} (annotated)`,
        storage_path: newPath,
        type: 'image',
        category: originalMedia.category,
        file_size: imageBlob.size,
        tags: originalMedia.tags,
        folder_id: originalMedia.folder_id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return newMedia
  }
}
```

**Step 2: Add save logic to editor**

Add to `SlideAnnotationEditor.tsx`:

```typescript
import { SaveAnnotationDialog } from './SaveAnnotationDialog'
import { saveAnnotatedSlide } from '@/services/media'
import type { Media } from '@/types/media'

// Add to props
interface SlideAnnotationEditorProps {
  media: Media // Change from imageUrl to full media object
  onClose: () => void
  onSaveComplete: () => void
}

// Add state
const [showSaveDialog, setShowSaveDialog] = useState(false)
const [saving, setSaving] = useState(false)

// Add export function
const exportCanvas = useCallback(async (): Promise<Blob> => {
  if (!fabricCanvasRef.current) throw new Error('Canvas not initialized')

  return new Promise((resolve, reject) => {
    const canvas = fabricCanvasRef.current!

    // Export at original resolution
    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1.0,
      multiplier: 1, // Can calculate from original image dimensions if needed
    })

    fetch(dataUrl)
      .then(res => res.blob())
      .then(resolve)
      .catch(reject)
  })
}, [])

// Add save handler
const handleSave = useCallback(async (replaceOriginal: boolean) => {
  setSaving(true)

  try {
    const blob = await exportCanvas()
    await saveAnnotatedSlide(media, blob, replaceOriginal)

    toast.success(
      replaceOriginal
        ? t('slides.annotation.success.updated')
        : t('slides.annotation.success.created')
    )

    setShowSaveDialog(false)
    onSaveComplete()
    onClose()
  } catch (error) {
    console.error('Failed to save annotation:', error)
    toast.error(t('slides.annotation.errors.saveFailed'))
  } finally {
    setSaving(false)
  }
}, [exportCanvas, media, onClose, onSaveComplete, t])

// Update Save button in toolbar
<Button onClick={() => setShowSaveDialog(true)}>
  {t('slides.annotation.save')}
</Button>

// Add dialog before closing div
<SaveAnnotationDialog
  open={showSaveDialog}
  onOpenChange={setShowSaveDialog}
  onSave={handleSave}
  saving={saving}
/>
```

Add toast import:

```typescript
import { toast } from 'sonner'
```

**Step 3: Update image loading to use media object**

Update initialization to load from media:

```typescript
useEffect(() => {
  // ... existing code ...

  // Load image from signed URL
  const loadImage = async () => {
    const url = await getSignedMediaUrl(media.storagePath)

    fabric.Image.fromURL(url, (img) => {
      // ... existing image setup ...
    }, {
      crossOrigin: 'anonymous'
    })
  }

  loadImage()
}, [media])
```

**Step 4: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx src/services/media.ts
git commit -m "feat(slides): implement save annotation functionality"
```

---

## Task 16: Integrate Annotation into MediaDetailDialog

**Files:**
- Modify: `src/components/media/MediaDetailDialog.tsx`

**Step 1: Add annotate button**

Add imports:

```typescript
import { useState } from 'react'
import { Palette } from 'lucide-react'
import { SlideAnnotationEditor } from '@/components/slides/SlideAnnotationEditor'
```

Add state:

```typescript
const [showAnnotationEditor, setShowAnnotationEditor] = useState(false)
```

Add button (after "Show Text" button, around line 340):

```typescript
{/* Annotate button - only for image slides */}
{!loadingPreview && media.type === 'image' && media.category === 'slide' && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setShowAnnotationEditor(true)}
  >
    <Palette className="h-4 w-4 mr-1" />
    {t('slides.annotate')}
  </Button>
)}
```

Add editor (before closing Dialog):

```typescript
{/* Annotation editor */}
{showAnnotationEditor && media && (
  <SlideAnnotationEditor
    media={media}
    onClose={() => setShowAnnotationEditor(false)}
    onSaveComplete={() => {
      setShowAnnotationEditor(false)
      onUpdate?.()
    }}
  />
)}
```

**Step 2: Commit**

```bash
git add src/components/media/MediaDetailDialog.tsx
git commit -m "feat(slides): integrate annotation into media detail dialog"
```

---

## Task 17: Add Delete Key Handler

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add delete key handler**

Add to keyboard shortcuts useEffect:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault()
      redo()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // Delete selected objects
      if (!fabricCanvasRef.current) return

      const canvas = fabricCanvasRef.current
      const activeObjects = canvas.getActiveObjects()

      if (activeObjects.length > 0) {
        activeObjects.forEach(obj => canvas.remove(obj))
        canvas.discardActiveObject()
        canvas.renderAll()
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [undo, redo])
```

**Step 2: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add delete key handler for objects"
```

---

## Task 18: Add Unsaved Changes Warning

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Add change detection and warning**

Add state:

```typescript
const [hasChanges, setHasChanges] = useState(false)
```

Track changes:

```typescript
useEffect(() => {
  if (!fabricCanvasRef.current) return

  const canvas = fabricCanvasRef.current

  const handleChange = () => {
    setHasChanges(historyPointer > 0)
  }

  canvas.on('object:added', handleChange)
  canvas.on('object:modified', handleChange)
  canvas.on('object:removed', handleChange)

  return () => {
    canvas.off('object:added', handleChange)
    canvas.off('object:modified', handleChange)
    canvas.off('object:removed', handleChange)
  }
}, [historyPointer])
```

Update close handlers:

```typescript
const handleClose = useCallback(() => {
  if (hasChanges) {
    if (window.confirm(t('slides.annotation.unsavedChanges'))) {
      onClose()
    }
  } else {
    onClose()
  }
}, [hasChanges, onClose, t])

// Update Exit and Cancel buttons
<Button variant="ghost" size="sm" onClick={handleClose}>
  <X className="h-4 w-4 mr-2" />
  {t('slides.annotation.exit')}
</Button>

// ...

<Button variant="outline" onClick={handleClose}>
  {t('slides.annotation.cancel')}
</Button>
```

**Step 2: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "feat(slides): add unsaved changes warning"
```

---

## Task 19: Fix Canvas Background Image Loading

**Files:**
- Modify: `src/components/slides/SlideAnnotationEditor.tsx`

**Step 1: Import getSignedMediaUrl**

Add import:

```typescript
import { getSignedMediaUrl } from '@/services/media'
```

**Step 2: Fix image loading in useEffect**

Update the canvas initialization to properly load signed URL:

```typescript
useEffect(() => {
  if (!canvasRef.current) return

  const initCanvas = async () => {
    try {
      setLoading(true)
      setError(null)

      // Create Fabric canvas
      const canvas = new fabric.Canvas(canvasRef.current!, {
        width: window.innerWidth,
        height: window.innerHeight - 64,
        backgroundColor: '#1a1a1a',
      })

      fabricCanvasRef.current = canvas

      // Get signed URL and load image
      const imageUrl = await getSignedMediaUrl(media.storagePath)

      fabric.Image.fromURL(imageUrl, (img) => {
        if (!img.width || !img.height) {
          setError(t('slides.annotation.errors.loadFailed'))
          setLoading(false)
          return
        }

        // Scale image to fit canvas
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

        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))
        setLoading(false)
      }, {
        crossOrigin: 'anonymous'
      })

      // ... rest of existing code ...
    } catch (err) {
      console.error('Failed to initialize canvas:', err)
      setError(t('slides.annotation.errors.loadFailed'))
      setLoading(false)
    }
  }

  initCanvas()
}, [media, t])
```

**Step 3: Commit**

```bash
git add src/components/slides/SlideAnnotationEditor.tsx
git commit -m "fix(slides): properly load signed image URL in canvas"
```

---

## Task 20: Test and Verify Complete Flow

**Files:**
- Test manually

**Step 1: Build the application**

```bash
pnpm build
```

Expected: Build succeeds with no errors

**Step 2: Start dev server**

```bash
pnpm dev
```

**Step 3: Manual testing checklist**

1. Navigate to /slides
2. Click on an image slide
3. Click "Annotate" button
4. Verify editor opens fullscreen
5. Test Pen tool:
   - Select pen
   - Draw lines
   - Change color
   - Change width
6. Test Shapes tool:
   - Draw rectangle
   - Draw circle
   - Draw line
7. Test Text tool:
   - Add text
   - Change font
   - Change size
   - Apply bold/italic
8. Test Highlighter:
   - Select highlighter
   - Draw highlighted areas
   - Try different colors
9. Test Undo/Redo:
   - Undo last action (Cmd+Z)
   - Redo (Cmd+Shift+Z)
   - Verify buttons disabled at boundaries
10. Test Save:
    - Click Save
    - Verify dialog appears
    - Select "Save as new"
    - Verify success toast
    - Verify new slide created
11. Test Replace:
    - Annotate same slide
    - Save and select "Replace original"
    - Verify original updated
12. Test Delete:
    - Select annotation
    - Press Delete key
    - Verify object removed
13. Test Exit warning:
    - Make changes
    - Click Exit
    - Verify unsaved changes warning

**Step 4: Commit**

```bash
git add .
git commit -m "test: verify complete annotation workflow"
```

---

## Task 21: Final Polish and Cleanup

**Files:**
- Review all files

**Step 1: Add keyboard shortcut hints to toolbar**

Optional enhancement: Add tooltips showing keyboard shortcuts

**Step 2: Verify all translations exist**

Check both en.json and es.json have all keys

**Step 3: Check for console errors**

Run app and check browser console for warnings/errors

**Step 4: Performance check**

Test with large images (> 5MB) to ensure loading is smooth

**Step 5: Final commit**

```bash
git add .
git commit -m "polish: final cleanup and verification"
```

---

## Task 22: Merge to Main

**Files:**
- Git commands

**Step 1: Push branch**

```bash
git push -u origin slide-annotation
```

**Step 2: Create pull request**

```bash
gh pr create --title "feat: Add slide annotation feature" --body "$(cat <<'EOF'
## Summary
Add fullscreen image annotation to slides with drawing tools, text, shapes, and save functionality.

## Features
- Pen drawing tool with customizable color and width
- Text tool with full formatting (font, size, bold, italic, underline, alignment)
- Shapes (rectangle, circle, line)
- Highlighter with preset colors
- Undo/Redo with keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)
- Save as new slide or replace original
- Color picker with preset and custom colors
- Delete objects with Delete key
- Unsaved changes warning

## Tech Stack
- Fabric.js for canvas manipulation
- React hooks for state management
- Shadcn UI components
- Supabase storage for image upload

## Testing
Manually tested all tools, save functionality, and keyboard shortcuts.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

**Step 3: Verify PR created**

Expected: PR link displayed

**Step 4: Merge when ready**

After review (or self-approval if authorized):

```bash
gh pr merge --squash --delete-branch
```

---

## Success Criteria

✅ User can click "Annotate" on image slides
✅ Fullscreen editor opens with image loaded
✅ All tools work: Pen, Text, Shapes, Highlighter
✅ Color picker allows preset and custom colors
✅ Undo/Redo works with keyboard shortcuts
✅ Save dialog offers "Replace" or "Save as new"
✅ Annotated images upload to Supabase successfully
✅ No console errors or warnings
✅ Works on desktop and tablet viewports
✅ All text translated to English and Spanish

---

## Notes

- Fabric.js is loaded synchronously for simplicity; could be lazy-loaded for better initial bundle size
- Canvas renders at viewport size; could implement 2x multiplier for higher resolution exports
- Mobile support is basic; could add touch gestures and better mobile UI
- Arrow shape not implemented in this version (can be added later)
- No fill color selector for shapes (only stroke) - YAGNI for v1
