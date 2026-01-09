import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { structureSongLyrics } from '@/services/songStructure'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface SongReformatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  author: string
  originalMarkdown: string
  onAccept: (formattedMarkdown: string) => void
}

export function SongReformatDialog({
  open,
  onOpenChange,
  title,
  author,
  originalMarkdown,
  onAccept,
}: SongReformatDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [structuring, setStructuring] = useState(false)
  const [formattedMarkdown, setFormattedMarkdown] = useState<string | null>(null)
  const [sectionsDetected, setSectionsDetected] = useState(0)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFormattedMarkdown(null)
      setSectionsDetected(0)
      setLoading(true)

      // Call AI to structure the lyrics
      structureWithAI()
    }
  }, [open, originalMarkdown])

  async function structureWithAI() {
    setStructuring(true)
    try {
      const response = await structureSongLyrics(title, author, originalMarkdown)
      setFormattedMarkdown(response.markdown)
      setSectionsDetected(response.sections)
    } catch (error) {
      console.error('Failed to structure lyrics:', error)
      toast.error(t('songs.aiProcessingError'))
      onOpenChange(false)
    } finally {
      setLoading(false)
      setStructuring(false)
    }
  }

  function handleRegenerate() {
    setStructuring(true)
    structureWithAI()
  }

  function handleAccept() {
    if (formattedMarkdown) {
      onAccept(formattedMarkdown)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{t('songs.reformatPreview')}</DialogTitle>
        </DialogHeader>

        {loading || structuring ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : formattedMarkdown ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('songs.sectionsDetected', { count: sectionsDetected })}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={structuring}
              >
                {structuring ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('songs.regenerate')}
              </Button>
            </div>

            <Textarea
              value={formattedMarkdown}
              onChange={(e) => setFormattedMarkdown(e.target.value)}
              className="min-h-[400px] font-mono text-sm resize-none"
              placeholder={t('songs.editManually')}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleAccept} disabled={!formattedMarkdown || structuring}>
            {t('common.accept', 'Accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
