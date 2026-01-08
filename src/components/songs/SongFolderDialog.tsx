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
import { Loader2 } from 'lucide-react'
import type { SongFolder, SongFolderInput } from '@/types/folder'

export interface SongFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder?: SongFolder | null
  onSave: (input: SongFolderInput) => Promise<void>
}

export function SongFolderDialog({
  open,
  onOpenChange,
  folder,
  onSave,
}: SongFolderDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

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

    setLoading(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? t('songs.folder.editFolder')
                : t('songs.folder.createFolder')}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? t('songs.folder.editFolderDescription')
                : t('songs.folder.createFolderDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">{t('songs.folder.name')}</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('songs.folder.namePlaceholder')}
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="folder-description">
                {t('songs.folder.description')}
                <span className="ml-1 text-muted-foreground">
                  ({t('common.optional')})
                </span>
              </Label>
              <Textarea
                id="folder-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('songs.folder.descriptionPlaceholder')}
                disabled={loading}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
