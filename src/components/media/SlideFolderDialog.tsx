import { useState, useEffect } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SlideFolder, SlideFolderInput } from '@/types/media'

export interface SlideFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder?: SlideFolder | null // If provided, we're editing; otherwise creating
  onSave: (input: SlideFolderInput) => Promise<void>
}

export function SlideFolderDialog({
  open,
  onOpenChange,
  folder,
  onSave,
}: SlideFolderDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!folder

  useEffect(() => {
    if (open) {
      if (folder) {
        setName(folder.name)
        setDescription(folder.description || '')
      } else {
        setName('')
        setDescription('')
      }
    }
  }, [open, folder])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t('slides.editFolder') : t('slides.createFolder')}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? t('slides.editFolderDescription')
                : t('slides.createFolderDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">{t('slides.folderName')}</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('slides.folderNamePlaceholder')}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="folder-description">
                {t('slides.folderDescription')}
                <span className="ml-1 text-muted-foreground">
                  ({t('common.optional')})
                </span>
              </Label>
              <Textarea
                id="folder-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('slides.folderDescriptionPlaceholder')}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving
                ? t('common.saving')
                : isEditing
                  ? t('common.save')
                  : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
