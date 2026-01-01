import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { createSolidColorBackground } from '@/services/media'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface SolidColorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const PRESET_COLORS = [
  { name: 'Red', color: '#DC2626' },
  { name: 'Orange', color: '#EA580C' },
  { name: 'Yellow', color: '#CA8A04' },
  { name: 'Green', color: '#16A34A' },
  { name: 'Blue', color: '#2563EB' },
  { name: 'Purple', color: '#9333EA' },
  { name: 'Pink', color: '#DB2777' },
  { name: 'Gray', color: '#6B7280' },
  { name: 'Navy', color: '#1E3A5F' },
  { name: 'Teal', color: '#0D9488' },
]

// Normalize short hex (#fff) to full format (#ffffff)
function normalizeHex(hex: string): string {
  const c = hex.replace('#', '')
  if (c.length === 3) {
    return '#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2]
  }
  return hex
}

// Helper to determine if a color is light (for text contrast)
function isLightColor(hex: string): boolean {
  const normalized = normalizeHex(hex)
  const c = normalized.replace('#', '')
  const r = parseInt(c.substr(0, 2), 16)
  const g = parseInt(c.substr(2, 2), 16)
  const b = parseInt(c.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

export function SolidColorDialog({
  open,
  onOpenChange,
  onSuccess,
}: SolidColorDialogProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [name, setName] = useState('')
  const [color, setColor] = useState('#3B82F6')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!currentChurch || !name.trim()) return

    setSaving(true)
    try {
      await createSolidColorBackground(currentChurch.id, name.trim(), color)
      toast.success('Background created')
      onSuccess()
      onOpenChange(false)
      setName('')
      setColor('#3B82F6')
    } catch (error) {
      console.error('Failed to create background:', error)
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  function handlePresetClick(preset: { name: string; color: string }) {
    setColor(preset.color)
    if (!name.trim()) {
      setName(preset.name)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Solid Color Background</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Deep Blue"
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={normalizeHex(color)}
                onChange={(e) => setColor(e.target.value)}
                className="w-16 h-10 p-1 cursor-pointer"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                onBlur={(e) => setColor(normalizeHex(e.target.value))}
                placeholder="#000000"
                className="flex-1 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Presets</Label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.color}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  className="aspect-square rounded-md border-2 border-transparent hover:border-primary transition-colors"
                  style={{ backgroundColor: preset.color }}
                  title={preset.name}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className="aspect-video rounded-lg flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <span
                className="text-lg font-semibold"
                style={{ color: isLightColor(color) ? '#000' : '#fff' }}
              >
                {name || 'Sample Text'}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Creating...' : 'Create Background'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
