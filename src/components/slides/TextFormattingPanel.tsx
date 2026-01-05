import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AnnotationColorPicker } from './AnnotationColorPicker'

interface TextFormattingPanelProps {
  fontSize: number
  fontFamily: string
  textBold: boolean
  textItalic: boolean
  textUnderline: boolean
  textAlign: 'left' | 'center' | 'right'
  textColor: string
  onFontSizeChange: (value: number) => void
  onFontFamilyChange: (value: string) => void
  onToggleBold: () => void
  onToggleItalic: () => void
  onToggleUnderline: () => void
  onTextAlignChange: (value: 'left' | 'center' | 'right') => void
  onTextColorChange: (value: string) => void
}

const FONT_FAMILIES = [
  { name: 'Arial', value: 'Arial' },
  { name: 'Helvetica', value: 'Helvetica' },
  { name: 'Times New Roman', value: 'Times New Roman' },
  { name: 'Georgia', value: 'Georgia' },
  { name: 'Courier New', value: 'Courier New' },
  { name: 'Verdana', value: 'Verdana' },
  { name: 'Comic Sans MS', value: 'Comic Sans MS' },
  { name: 'Impact', value: 'Impact' },
]

export function TextFormattingPanel({
  fontSize,
  fontFamily,
  textBold,
  textItalic,
  textUnderline,
  textAlign,
  textColor,
  onFontSizeChange,
  onFontFamilyChange,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onTextAlignChange,
  onTextColorChange,
}: TextFormattingPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2 border-l pl-2">
      {/* Font family selector */}
      <Select value={fontFamily} onValueChange={onFontFamilyChange}>
        <SelectTrigger className="w-40 h-8 text-sm">
          <SelectValue placeholder={t('slides.annotation.fontFamily')} />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((font) => (
            <SelectItem key={font.value} value={font.value}>
              {font.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size slider */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {t('slides.annotation.fontSize')}
        </span>
        <Slider
          value={[fontSize]}
          onValueChange={([value]) => onFontSizeChange(value)}
          min={12}
          max={72}
          step={2}
          className="w-24"
        />
        <span className="text-xs text-muted-foreground w-8">{fontSize}px</span>
      </div>

      {/* Text style toggles */}
      <div className="flex items-center gap-1 border-l pl-2">
        <Button
          variant={textBold ? 'default' : 'ghost'}
          size="sm"
          onClick={onToggleBold}
          title={t('slides.annotation.bold')}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant={textItalic ? 'default' : 'ghost'}
          size="sm"
          onClick={onToggleItalic}
          title={t('slides.annotation.italic')}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant={textUnderline ? 'default' : 'ghost'}
          size="sm"
          onClick={onToggleUnderline}
          title={t('slides.annotation.underline')}
        >
          <Underline className="h-4 w-4" />
        </Button>
      </div>

      {/* Text alignment */}
      <div className="flex items-center gap-1 border-l pl-2">
        <Button
          variant={textAlign === 'left' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onTextAlignChange('left')}
          title={t('slides.annotation.alignLeft')}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          variant={textAlign === 'center' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onTextAlignChange('center')}
          title={t('slides.annotation.alignCenter')}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          variant={textAlign === 'right' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onTextAlignChange('right')}
          title={t('slides.annotation.alignRight')}
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Text color picker */}
      <div className="border-l pl-2">
        <AnnotationColorPicker
          color={textColor}
          onChange={onTextColorChange}
        />
      </div>
    </div>
  )
}
