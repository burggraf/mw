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
import { useState } from 'react'

interface SaveAnnotationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (replaceOriginal: boolean) => void
  saving?: boolean
}

export function SaveAnnotationDialog({
  open,
  onOpenChange,
  onSave,
  saving = false,
}: SaveAnnotationDialogProps) {
  const { t } = useTranslation()
  const [saveOption, setSaveOption] = useState<'replace' | 'new'>('new')

  const handleSave = () => {
    onSave(saveOption === 'replace')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('slides.annotation.saveDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('slides.annotation.saveDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={saveOption}
          onValueChange={(value) => setSaveOption(value as 'replace' | 'new')}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="new" id="new" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="new" className="font-semibold cursor-pointer">
                {t('slides.annotation.saveDialog.saveAsNew')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('slides.annotation.saveDialog.saveAsNewDescription')}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <RadioGroupItem value="replace" id="replace" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="replace" className="font-semibold cursor-pointer">
                {t('slides.annotation.saveDialog.replaceOriginal')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('slides.annotation.saveDialog.replaceWarning')}
              </p>
            </div>
          </div>
        </RadioGroup>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
