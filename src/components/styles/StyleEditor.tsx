import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { createStyle, updateStyle, getStyleById } from '@/services/styles'
import type { StyleInput } from '@/types/style'
import type { Media } from '@/types/media'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BoundingBoxEditor } from './BoundingBoxEditor'
import { toast } from 'sonner'

interface StyleEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  media: Media
  styleId?: string | null
  onSave: (styleId: string) => void
}

const FONT_FAMILIES = [
  'Inter',
  'Georgia',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Verdana',
]

export function StyleEditor({
  open,
  onOpenChange,
  media,
  styleId,
  onSave,
}: StyleEditorProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [fontFamily, setFontFamily] = useState('Inter')
  const [fontSize, setFontSize] = useState(3.5)
  const [fontWeight, setFontWeight] = useState('600')
  const [textColor, setTextColor] = useState('#ffffff')
  const [textBoxLeft, setTextBoxLeft] = useState(10)
  const [textBoxTop, setTextBoxTop] = useState(10)
  const [textBoxWidth, setTextBoxWidth] = useState(80)
  const [textBoxHeight, setTextBoxHeight] = useState(80)
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center')
  const [verticalAlign, setVerticalAlign] = useState<'top' | 'center' | 'bottom'>('center')
  const [maxLines, setMaxLines] = useState(4)
  const [backgroundOverlay, setBackgroundOverlay] = useState(0.3)
  const [showSectionLabel, setShowSectionLabel] = useState(true)
  const [showCopyright, setShowCopyright] = useState(true)

  useEffect(() => {
    if (open && styleId) {
      loadStyle(styleId)
    } else if (open) {
      // Reset to defaults for new style
      setName(`Style for ${media.name}`)
      setFontFamily('Inter')
      setFontSize(3.5)
      setFontWeight('600')
      setTextColor(media.backgroundColor === '#FFFFFF' ? '#000000' : '#ffffff')
      setTextBoxLeft(10)
      setTextBoxTop(10)
      setTextBoxWidth(80)
      setTextBoxHeight(80)
      setTextAlign('center')
      setVerticalAlign('center')
      setMaxLines(4)
      setBackgroundOverlay(media.backgroundColor ? 0 : 0.3)
      setShowSectionLabel(true)
      setShowCopyright(true)
    }
  }, [open, styleId, media])

  async function loadStyle(id: string) {
    setLoading(true)
    try {
      const style = await getStyleById(id)
      if (style) {
        setName(style.name)
        setFontFamily(style.fontFamily)
        setFontSize(parseFloat(style.fontSize))
        setFontWeight(style.fontWeight)
        setTextColor(style.textColor)
        setTextBoxLeft(style.textBoxLeft)
        setTextBoxTop(style.textBoxTop)
        setTextBoxWidth(style.textBoxWidth)
        setTextBoxHeight(style.textBoxHeight)
        setTextAlign(style.textAlign)
        setVerticalAlign(style.verticalAlign)
        setMaxLines(style.maxLines)
        setBackgroundOverlay(style.backgroundOverlay)
        setShowSectionLabel(style.showSectionLabel)
        setShowCopyright(style.showCopyright)
      }
    } catch (error) {
      console.error('Failed to load style:', error)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!currentChurch) return

    setSaving(true)
    try {
      const input: StyleInput = {
        name,
        fontFamily,
        fontSize: `${fontSize}rem`,
        fontWeight,
        textColor,
        textBoxLeft,
        textBoxTop,
        textBoxWidth,
        textBoxHeight,
        textAlign,
        verticalAlign,
        maxLines,
        lineHeight: '1.4',
        textShadow: textColor === '#000000' ? 'none' : '0 2px 4px rgba(0,0,0,0.5)',
        backgroundOverlay,
        showSectionLabel,
        showCopyright,
      }

      let savedStyleId: string

      if (styleId) {
        const style = await updateStyle(styleId, input)
        savedStyleId = style.id
        toast.success('Style updated')
      } else {
        const style = await createStyle(currentChurch.id, input)
        savedStyleId = style.id
        toast.success('Style created')
      }

      onSave(savedStyleId)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save style:', error)
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const backgroundUrl = media.storagePath
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/media/${media.storagePath}`
    : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Style for "{media.name}"</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Preview */}
            <div className="space-y-4">
              <Label>Text Position (drag to move, corner to resize)</Label>
              <BoundingBoxEditor
                value={{
                  left: textBoxLeft,
                  top: textBoxTop,
                  width: textBoxWidth,
                  height: textBoxHeight,
                }}
                onChange={(box) => {
                  setTextBoxLeft(box.left)
                  setTextBoxTop(box.top)
                  setTextBoxWidth(box.width)
                  setTextBoxHeight(box.height)
                }}
                backgroundUrl={backgroundUrl}
                backgroundColor={media.backgroundColor || undefined}
              />
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Style Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Font</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger>
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

                <div className="space-y-2">
                  <Label>Size: {fontSize}rem</Label>
                  <Slider
                    value={[fontSize]}
                    onValueChange={([v]) => setFontSize(v)}
                    min={1}
                    max={8}
                    step={0.25}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Text Color</Label>
                  <Input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-10 cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Max Lines: {maxLines}</Label>
                  <Slider
                    value={[maxLines]}
                    onValueChange={([v]) => setMaxLines(v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Horizontal Align</Label>
                  <Select value={textAlign} onValueChange={(v: 'left' | 'center' | 'right') => setTextAlign(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Vertical Align</Label>
                  <Select value={verticalAlign} onValueChange={(v: 'top' | 'center' | 'bottom') => setVerticalAlign(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="bottom">Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Background Overlay: {Math.round(backgroundOverlay * 100)}%</Label>
                <Slider
                  value={[backgroundOverlay]}
                  onValueChange={([v]) => setBackgroundOverlay(v)}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Show Section Label</Label>
                <Switch checked={showSectionLabel} onCheckedChange={setShowSectionLabel} />
              </div>

              <div className="flex items-center justify-between">
                <Label>Show Copyright</Label>
                <Switch checked={showCopyright} onCheckedChange={setShowCopyright} />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? 'Saving...' : 'Save Style'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
