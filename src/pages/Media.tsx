import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getMedia, deleteMedia, getAllTags, getMediaUsage, updateMediaStyle } from '@/services/media'
import type { Media, MediaFilters } from '@/types/media'
import { MediaGrid } from '@/components/media/MediaGrid'
import { MediaSidebar } from '@/components/media/MediaSidebar'
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog'
import { StockMediaDialog } from '@/components/media/StockMediaDialog'
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog'
import { SolidColorDialog } from '@/components/media/SolidColorDialog'
import { StyleEditor } from '@/components/styles'
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
import { Upload, Search, Sparkles, Palette, Filter } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
  const [colorOpen, setColorOpen] = useState(false)
  const [editMedia, setEditMedia] = useState<Media | null>(null)
  const [styleEditorMedia, setStyleEditorMedia] = useState<Media | null>(null)
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
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('media.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setColorOpen(true)} className="flex-1 sm:flex-none">
            <Palette className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Color</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStockOpen(true)} className="flex-1 sm:flex-none">
            <Sparkles className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('media.stockMedia')}</span>
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="flex-1 sm:flex-none">
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('media.upload')}</span>
          </Button>
        </div>
      </div>

      {/* Search and Mobile Filter */}
      <div className="flex gap-2 mb-4 md:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('media.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {/* Mobile filter button */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden shrink-0">
              <Filter className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px]">
            <SheetHeader>
              <SheetTitle>{t('media.filters')}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <MediaSidebar
                activeCollection={activeCollection}
                onCollectionChange={setActiveCollection}
                tags={allTags}
                selectedTags={selectedTags}
                onTagToggle={handleTagToggle}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main content */}
      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <MediaSidebar
            activeCollection={activeCollection}
            onCollectionChange={setActiveCollection}
            tags={allTags}
            selectedTags={selectedTags}
            onTagToggle={handleTagToggle}
          />
        </div>

        <div className="flex-1">
          <MediaGrid
            media={media}
            loading={loading}
            onClick={setEditMedia}
            onEdit={setEditMedia}
            onDelete={handleDeleteClick}
            onConfigureStyle={setStyleEditorMedia}
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

      <SolidColorDialog
        open={colorOpen}
        onOpenChange={setColorOpen}
        onSuccess={() => {
          loadMedia()
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

      {styleEditorMedia && (
        <StyleEditor
          open={!!styleEditorMedia}
          onOpenChange={(open) => !open && setStyleEditorMedia(null)}
          media={styleEditorMedia}
          styleId={styleEditorMedia.styleId}
          onSave={async (styleId) => {
            await updateMediaStyle(styleEditorMedia.id, styleId)
            loadMedia()
          }}
        />
      )}

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
