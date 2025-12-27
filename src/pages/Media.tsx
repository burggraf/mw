import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getMedia, deleteMedia, getAllTags, getMediaUsage } from '@/services/media'
import type { Media, MediaFilters } from '@/types/media'
import { MediaGrid } from '@/components/media/MediaGrid'
import { MediaSidebar } from '@/components/media/MediaSidebar'
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog'
import { StockMediaDialog } from '@/components/media/StockMediaDialog'
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Upload, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

type SmartCollection = 'all' | 'recent' | 'images' | 'videos' | 'pexels' | 'unsplash'

export function MediaPage() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCollection, setActiveCollection] = useState<SmartCollection>('all')
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [editMedia, setEditMedia] = useState<Media | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Media | null>(null)
  const [deleteUsageCount, setDeleteUsageCount] = useState(0)

  useEffect(() => {
    if (currentChurch) {
      loadMedia()
      loadTags()
    }
  }, [currentChurch])

  useEffect(() => {
    if (currentChurch) {
      loadMedia()
    }
  }, [activeCollection, selectedTags, searchQuery])

  async function loadMedia() {
    if (!currentChurch) return

    setLoading(true)
    try {
      const filters: MediaFilters = {}

      if (activeCollection === 'images') filters.type = 'image'
      if (activeCollection === 'videos') filters.type = 'video'
      if (activeCollection === 'pexels') filters.source = 'pexels'
      if (activeCollection === 'unsplash') filters.source = 'unsplash'
      if (selectedTags.length > 0) filters.tags = selectedTags

      let data = await getMedia(currentChurch.id, filters)

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        data = data.filter((m) => m.name.toLowerCase().includes(query))
      }

      // Apply recent filter (just limit to 20)
      if (activeCollection === 'recent') {
        data = data.slice(0, 20)
      }

      setMedia(data)
    } catch (error) {
      console.error('Failed to load media:', error)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function loadTags() {
    if (!currentChurch) return

    try {
      const tags = await getAllTags(currentChurch.id)
      setAllTags(tags)
    } catch (error) {
      console.error('Failed to load tags:', error)
    }
  }

  function handleTagToggle(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function handleDeleteClick(media: Media) {
    const usage = await getMediaUsage(media.id)
    setDeleteUsageCount(usage.songIds.length)
    setDeleteTarget(media)
  }

  async function handleDelete() {
    if (!deleteTarget) return

    try {
      await deleteMedia(deleteTarget.id)
      setMedia((prev) => prev.filter((m) => m.id !== deleteTarget.id))
      toast.success(t('media.mediaDeleted'))
    } catch (error) {
      console.error('Failed to delete media:', error)
      toast.error(t('common.error'))
    } finally {
      setDeleteTarget(null)
      setDeleteUsageCount(0)
    }
  }

  if (!currentChurch) return null

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">{t('media.title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStockOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            {t('media.stockMedia')}
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t('media.upload')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('media.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Main content */}
      <div className="flex gap-6">
        <MediaSidebar
          activeCollection={activeCollection}
          onCollectionChange={setActiveCollection}
          tags={allTags}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
        />

        <div className="flex-1">
          <MediaGrid
            media={media}
            loading={loading}
            onClick={setEditMedia}
            onEdit={setEditMedia}
            onDelete={handleDeleteClick}
          />
        </div>
      </div>

      {/* Dialogs */}
      <MediaUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => {
          loadMedia()
          loadTags()
        }}
      />

      <StockMediaDialog
        open={stockOpen}
        onOpenChange={setStockOpen}
        onSuccess={() => {
          loadMedia()
          loadTags()
        }}
      />

      <MediaDetailDialog
        media={editMedia}
        open={!!editMedia}
        onOpenChange={(open) => !open && setEditMedia(null)}
        onUpdate={() => {
          loadMedia()
          loadTags()
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('media.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUsageCount > 0
                ? t('media.deleteWarningUsed', { count: deleteUsageCount })
                : t('media.deleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
