import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import {
  getMedia,
  deleteMedia,
  getAllTags,
  getMediaUsage,
  getSlideFolders,
  createSlideFolder,
  updateSlideFolder,
  deleteSlideFolder,
} from '@/services/media'
import type { Media, MediaFilters, SlideFolder } from '@/types/media'
import { isBuiltInMedia } from '@/types/media'
import { MediaGrid } from '@/components/media/MediaGrid'
import { MediaSidebar } from '@/components/media/MediaSidebar'
import { MediaUploadDialog } from '@/components/media/MediaUploadDialog'
import { StockMediaDialog } from '@/components/media/StockMediaDialog'
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog'
import { SlideFolderDialog } from '@/components/media/SlideFolderDialog'
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
import { Upload, Search, Sparkles, Filter, Folder } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { toast } from 'sonner'

type SmartCollection = 'all' | 'recent' | 'images' | 'videos' | 'pexels' | 'unsplash' | 'pixabay'

export function SlidesPage() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCollection, setActiveCollection] = useState<SmartCollection>('all')
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Folders
  const [folders, setFolders] = useState<SlideFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [editMedia, setEditMedia] = useState<Media | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Media | null>(null)
  const [deleteUsageCount, setDeleteUsageCount] = useState(0)

  // Folder dialogs
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<SlideFolder | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<SlideFolder | null>(null)

  useEffect(() => {
    if (currentChurch) {
      loadMedia()
      loadTags()
      loadFolders()
    }
  }, [currentChurch])

  useEffect(() => {
    if (currentChurch) {
      loadMedia()
    }
  }, [activeCollection, selectedTags, searchQuery, selectedFolderId])

  async function loadMedia() {
    if (!currentChurch) return

    setLoading(true)
    try {
      const filters: MediaFilters = {
        category: 'slide', // Only show slides
      }

      if (activeCollection === 'images') filters.type = 'image'
      if (activeCollection === 'videos') filters.type = 'video'
      if (activeCollection === 'pexels') filters.source = 'pexels'
      if (activeCollection === 'unsplash') filters.source = 'unsplash'
      if (activeCollection === 'pixabay') filters.source = 'pixabay'
      if (selectedTags.length > 0) filters.tags = selectedTags

      // Filter by folder if one is selected
      if (selectedFolderId !== null) {
        filters.folderId = selectedFolderId
      }

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
      console.error('Failed to load slides:', error)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function loadTags() {
    if (!currentChurch) return

    try {
      const tags = await getAllTags(currentChurch.id, 'slide')
      setAllTags(tags)
    } catch (error) {
      console.error('Failed to load tags:', error)
    }
  }

  async function loadFolders() {
    if (!currentChurch) return

    try {
      const data = await getSlideFolders(currentChurch.id)
      setFolders(data)
    } catch (error) {
      console.error('Failed to load folders:', error)
    }
  }

  function handleTagToggle(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  function handleFolderSelect(folderId: string | null) {
    setSelectedFolderId(folderId)
    // Reset smart collection when selecting a specific folder
    if (folderId !== null) {
      setActiveCollection('all')
    }
  }

  function handleCreateFolder() {
    setEditingFolder(null)
    setFolderDialogOpen(true)
  }

  function handleEditFolder(folder: SlideFolder) {
    setEditingFolder(folder)
    setFolderDialogOpen(true)
  }

  async function handleSaveFolder(input: { name: string; description?: string }) {
    if (!currentChurch) return

    try {
      if (editingFolder) {
        await updateSlideFolder(editingFolder.id, input)
        toast.success(t('slides.folderUpdated'))
      } else {
        await createSlideFolder(currentChurch.id, input)
        toast.success(t('slides.folderCreated'))
      }
      loadFolders()
    } catch (error) {
      console.error('Failed to save folder:', error)
      toast.error(t('common.error'))
      throw error
    }
  }

  async function handleDeleteFolder() {
    if (!deleteFolderTarget) return

    try {
      await deleteSlideFolder(deleteFolderTarget.id)
      // If we were viewing the deleted folder, go back to all slides
      if (selectedFolderId === deleteFolderTarget.id) {
        setSelectedFolderId(null)
      }
      toast.success(t('slides.folderDeleted'))
      loadFolders()
      loadMedia() // Reload to show slides that were in the folder
    } catch (error) {
      console.error('Failed to delete folder:', error)
      toast.error(t('common.error'))
    } finally {
      setDeleteFolderTarget(null)
    }
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
      toast.success(t('slides.slideDeleted'))
    } catch (error) {
      console.error('Failed to delete slide:', error)
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
        <h1 className="text-2xl sm:text-3xl font-bold">{t('slides.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setStockOpen(true)} className="flex-1 sm:flex-none">
            <Sparkles className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('slides.stockMedia')}</span>
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="flex-1 sm:flex-none">
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('slides.upload')}</span>
          </Button>
        </div>
      </div>

      {/* Search and Mobile Filter */}
      <div className="flex gap-2 mb-4 md:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('slides.searchPlaceholder')}
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
              <SheetTitle>{t('slides.filters')}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <MediaSidebar
                activeCollection={activeCollection}
                onCollectionChange={setActiveCollection}
                tags={allTags}
                selectedTags={selectedTags}
                onTagToggle={handleTagToggle}
                translationNamespace="slides"
                folders={folders}
                selectedFolderId={selectedFolderId}
                onFolderSelect={handleFolderSelect}
                onCreateFolder={handleCreateFolder}
                onEditFolder={handleEditFolder}
                onDeleteFolder={setDeleteFolderTarget}
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
            translationNamespace="slides"
            folders={folders}
            selectedFolderId={selectedFolderId}
            onFolderSelect={handleFolderSelect}
            onCreateFolder={handleCreateFolder}
            onEditFolder={handleEditFolder}
            onDeleteFolder={setDeleteFolderTarget}
          />
        </div>

        <div className="flex-1">
          {/* Folder header when viewing a specific folder */}
          {selectedFolderId && (
            <div className="flex items-center gap-3 mb-4 pb-3 border-b">
              <Folder className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <h2 className="font-semibold">
                  {folders.find(f => f.id === selectedFolderId)?.name}
                </h2>
                {folders.find(f => f.id === selectedFolderId)?.description && (
                  <p className="text-sm text-muted-foreground">
                    {folders.find(f => f.id === selectedFolderId)?.description}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFolderId(null)}
              >
                {t('slides.viewAllSlides')}
              </Button>
            </div>
          )}

          <MediaGrid
            media={media}
            loading={loading}
            onClick={(m) => !isBuiltInMedia(m) && setEditMedia(m)}
            onEdit={(m) => !isBuiltInMedia(m) && setEditMedia(m)}
            onDelete={(m) => !isBuiltInMedia(m) && handleDeleteClick(m)}
            emptyTitle={selectedFolderId ? t('slides.emptyFolder') : t('slides.noSlides')}
            emptyDescription={selectedFolderId ? t('slides.emptyFolderDescription') : t('slides.noSlidesDescription')}
          />
        </div>
      </div>

      {/* Dialogs */}
      <MediaUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        category="slide"
        folderId={selectedFolderId || undefined}
        onSuccess={() => {
          loadMedia()
          loadTags()
        }}
      />

      <StockMediaDialog
        open={stockOpen}
        onOpenChange={setStockOpen}
        category="slide"
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
        folders={folders}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('slides.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUsageCount > 0
                ? t('slides.deleteWarningUsed', { count: deleteUsageCount })
                : t('slides.deleteWarning')}
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

      {/* Folder Dialog */}
      <SlideFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        folder={editingFolder}
        onSave={handleSaveFolder}
      />

      {/* Delete Folder Confirmation */}
      <AlertDialog open={!!deleteFolderTarget} onOpenChange={() => setDeleteFolderTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('slides.deleteFolderConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('slides.deleteFolderWarning', { name: deleteFolderTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
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
