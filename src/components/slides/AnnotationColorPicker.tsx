import { useState } from 'react'
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
    try {
      const saved = localStorage.getItem('annotation-recent-colors')
      return saved ? JSON.parse(saved) : []
    } catch (error) {
      console.warn('Failed to load recent colors:', error)
      return []
    }
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
    try {
      localStorage.setItem('annotation-recent-colors', JSON.stringify(updated))
    } catch (error) {
      console.warn('Failed to save recent colors:', error)
    }
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
