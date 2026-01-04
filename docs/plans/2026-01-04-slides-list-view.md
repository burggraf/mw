# Slides List View & Bulk Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add thumbnail/list view toggle with checkboxes for bulk slide operations (move to folder, remove from folder, delete).

**Architecture:** Extend existing `MediaGrid` to support list view mode. Add selection state to `SlidesPage`. Create bulk action bar component that appears when slides are selected.

**Tech Stack:** React, TypeScript, Tailwind CSS, Shadcn UI (ToggleGroup, Checkbox, DropdownMenu), date-fns for formatting.

---

## Task 1: Add Translation Keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add English translations**

Add these keys to the `slides` section in `en.json` (after line 255, before `importFrom`):

```json
    "gridView": "Grid view",
    "listView": "List view",
    "selectedCount": "{{count}} selected",
    "selectAll": "Select all",
    "clearSelection": "Clear",
    "moveToFolder": "Move to folder",
    "removeFromFolder": "Remove from folder",
    "newFolderOption": "New folder...",
    "bulkDeleteConfirm": "Delete {{count}} slides?",
    "bulkDeleteWarning": "This action cannot be undone.",
    "bulkMoveSuccess": "{{count}} slides moved",
    "bulkDeleteSuccess": "{{count}} slides deleted",
    "bulkRemoveSuccess": "{{count}} slides removed from folder",
    "noFolder": "No folder",
```

**Step 2: Add Spanish translations**

Add corresponding keys to `es.json`:

```json
    "gridView": "Vista de cuadrícula",
    "listView": "Vista de lista",
    "selectedCount": "{{count}} seleccionados",
    "selectAll": "Seleccionar todo",
    "clearSelection": "Limpiar",
    "moveToFolder": "Mover a carpeta",
    "removeFromFolder": "Quitar de carpeta",
    "newFolderOption": "Nueva carpeta...",
    "bulkDeleteConfirm": "¿Eliminar {{count}} diapositivas?",
    "bulkDeleteWarning": "Esta acción no se puede deshacer.",
    "bulkMoveSuccess": "{{count}} diapositivas movidas",
    "bulkDeleteSuccess": "{{count}} diapositivas eliminadas",
    "bulkRemoveSuccess": "{{count}} diapositivas quitadas de la carpeta",
    "noFolder": "Sin carpeta",
```

**Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "feat(slides): add translation keys for list view and bulk actions"
```

---

## Task 2: Add Bulk Service Functions

**Files:**
- Modify: `src/services/media.ts`

**Step 1: Add bulkMoveToFolder function**

Add after `moveSlideToFolder` function (line 570):

```typescript
export async function bulkMoveToFolder(slideIds: string[], folderId: string | null): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('media')
    .update({ folder_id: folderId })
    .in('id', slideIds)

  if (error) throw error
}

export async function bulkDeleteMedia(ids: string[]): Promise<void> {
  // Delete one at a time to properly clean up storage files
  for (const id of ids) {
    await deleteMedia(id)
  }
}
```

**Step 2: Commit**

```bash
git add src/services/media.ts
git commit -m "feat(slides): add bulk move and delete service functions"
```

---

## Task 3: Create MediaListView Component

**Files:**
- Create: `src/components/media/MediaListView.tsx`

**Step 1: Create the component**

```typescript
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { MoreHorizontal, Pencil, Trash2, Play, Folder } from 'lucide-react'
import type { Media, SlideFolder } from '@/types/media'
import { isBuiltInMedia } from '@/types/media'
import { getSignedMediaUrl } from '@/services/media'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface MediaListViewProps {
  media: Media[]
  loading?: boolean
  onEdit?: (media: Media) => void
  onDelete?: (media: Media) => void
  onClick?: (media: Media) => void
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  folders?: SlideFolder[]
  emptyTitle?: string
  emptyDescription?: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '—'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function MediaListRow({
  media,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onClick,
  folderName,
}: {
  media: Media
  selected: boolean
  onSelect: (checked: boolean) => void
  onEdit?: (media: Media) => void
  onDelete?: (media: Media) => void
  onClick?: (media: Media) => void
  folderName?: string
}) {
  const { t } = useTranslation()
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!media.backgroundColor)

  const isSolidColor = !!media.backgroundColor
  const isBuiltIn = isBuiltInMedia(media)

  useEffect(() => {
    if (isSolidColor) {
      setIsLoading(false)
      return
    }

    let isMounted = true

    async function loadThumbnail() {
      try {
        const path = media.thumbnailPath || media.storagePath
        if (!path) {
          if (isMounted) setIsLoading(false)
          return
        }
        const url = await getSignedMediaUrl(path)
        if (isMounted) {
          setThumbnailUrl(url)
          setIsLoading(false)
        }
      } catch {
        if (isMounted) setIsLoading(false)
      }
    }

    loadThumbnail()
    return () => { isMounted = false }
  }, [media.thumbnailPath, media.storagePath, isSolidColor])

  const handleRowClick = () => {
    if (onClick && !isBuiltIn) onClick(media)
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 border-b hover:bg-muted/50 transition-colors',
        onClick && !isBuiltIn && 'cursor-pointer',
        selected && 'bg-primary/5'
      )}
      onClick={handleRowClick}
    >
      {/* Checkbox */}
      {!isBuiltIn && (
        <div onClick={handleCheckboxClick}>
          <Checkbox
            checked={selected}
            onCheckedChange={onSelect}
          />
        </div>
      )}
      {isBuiltIn && <div className="w-4" />}

      {/* Thumbnail */}
      <div className="w-16 h-9 rounded overflow-hidden bg-muted shrink-0 relative">
        {isLoading ? (
          <Skeleton className="absolute inset-0" />
        ) : isSolidColor ? (
          <div className="absolute inset-0" style={{ backgroundColor: media.backgroundColor! }} />
        ) : thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        {media.type === 'video' && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="h-4 w-4 text-white fill-white drop-shadow" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{media.name}</p>
      </div>

      {/* Date - hidden on mobile */}
      <div className="hidden sm:block w-28 text-sm text-muted-foreground">
        {format(new Date(media.createdAt), 'MMM d, yyyy')}
      </div>

      {/* Size - hidden on mobile */}
      <div className="hidden sm:block w-20 text-sm text-muted-foreground text-right">
        {formatFileSize(media.fileSize)}
      </div>

      {/* Folder */}
      <div className="hidden md:flex w-32 items-center gap-1 text-sm text-muted-foreground">
        {folderName ? (
          <>
            <Folder className="h-3 w-3" />
            <span className="truncate">{folderName}</span>
          </>
        ) : (
          <span>—</span>
        )}
      </div>

      {/* Actions */}
      {(onEdit || onDelete) && !isBuiltIn && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(media)}>
                <Pencil className="h-4 w-4 mr-2" />
                {t('common.edit')}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={() => onDelete(media)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isBuiltIn && <div className="w-8" />}
    </div>
  )
}

export function MediaListView({
  media,
  loading = false,
  onEdit,
  onDelete,
  onClick,
  selectedIds,
  onSelectionChange,
  folders = [],
  emptyTitle,
  emptyDescription,
}: MediaListViewProps) {
  const { t } = useTranslation()

  const folderMap = new Map(folders.map(f => [f.id, f.name]))

  const handleSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds)
    if (checked) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    onSelectionChange(newSet)
  }

  const selectableMedia = media.filter(m => !isBuiltInMedia(m))
  const allSelected = selectableMedia.length > 0 && selectableMedia.every(m => selectedIds.has(m.id))
  const someSelected = selectableMedia.some(m => selectedIds.has(m.id))

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(new Set(selectableMedia.map(m => m.id)))
    } else {
      onSelectionChange(new Set())
    }
  }

  if (loading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 border-b">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="w-16 h-9" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden sm:block h-4 w-28" />
            <Skeleton className="hidden sm:block h-4 w-20" />
            <Skeleton className="hidden md:block h-4 w-32" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    )
  }

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="font-medium">{emptyTitle || t('slides.noSlides')}</p>
        {emptyDescription && <p className="text-sm mt-1">{emptyDescription}</p>}
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 border-b text-sm font-medium text-muted-foreground">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={allSelected}
            onCheckedChange={handleSelectAll}
            className={cn(!allSelected && someSelected && 'data-[state=checked]:bg-primary/50')}
          />
        </div>
        <div className="w-16 shrink-0">{t('slides.preview')}</div>
        <div className="flex-1">{t('slides.name')}</div>
        <div className="hidden sm:block w-28">{t('slides.uploaded')}</div>
        <div className="hidden sm:block w-20 text-right">{t('slides.size')}</div>
        <div className="hidden md:block w-32">{t('slides.folders')}</div>
        <div className="w-8" />
      </div>

      {/* Rows */}
      {media.map((item) => (
        <MediaListRow
          key={item.id}
          media={item}
          selected={selectedIds.has(item.id)}
          onSelect={(checked) => handleSelect(item.id, checked)}
          onEdit={onEdit}
          onDelete={onDelete}
          onClick={onClick}
          folderName={item.folderId ? folderMap.get(item.folderId) : undefined}
        />
      ))}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/media/MediaListView.tsx
git commit -m "feat(slides): create MediaListView component with checkboxes"
```

---

## Task 4: Create BulkActionBar Component

**Files:**
- Create: `src/components/media/BulkActionBar.tsx`

**Step 1: Create the component**

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, FolderInput, FolderMinus, Trash2, ChevronDown, Plus, Loader2 } from 'lucide-react'
import type { SlideFolder } from '@/types/media'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface BulkActionBarProps {
  selectedCount: number
  onClear: () => void
  onMoveToFolder: (folderId: string | null) => Promise<void>
  onCreateNewFolder: () => void
  onRemoveFromFolder: () => Promise<void>
  onDelete: () => Promise<void>
  folders: SlideFolder[]
  currentFolderId: string | null
  isProcessing?: boolean
}

export function BulkActionBar({
  selectedCount,
  onClear,
  onMoveToFolder,
  onCreateNewFolder,
  onRemoveFromFolder,
  onDelete,
  folders,
  currentFolderId,
  isProcessing = false,
}: BulkActionBarProps) {
  const { t } = useTranslation()
  const [movingTo, setMovingTo] = useState<string | null>(null)

  if (selectedCount === 0) return null

  const handleMoveToFolder = async (folderId: string | null) => {
    setMovingTo(folderId)
    try {
      await onMoveToFolder(folderId)
    } finally {
      setMovingTo(null)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-background border rounded-lg shadow-lg px-4 py-3">
        {/* Clear button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isProcessing}
          className="h-8 px-2"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Selected count */}
        <span className="text-sm font-medium px-2 border-r">
          {t('slides.selectedCount', { count: selectedCount })}
        </span>

        {/* Move to folder dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isProcessing} className="h-8">
              {movingTo !== null ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderInput className="h-4 w-4 mr-2" />
              )}
              {t('slides.moveToFolder')}
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onClick={() => handleMoveToFolder(folder.id)}
                disabled={folder.id === currentFolderId}
              >
                {folder.name}
              </DropdownMenuItem>
            ))}
            {folders.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onCreateNewFolder}>
              <Plus className="h-4 w-4 mr-2" />
              {t('slides.newFolderOption')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Remove from folder - only show when viewing a folder */}
        {currentFolderId && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRemoveFromFolder}
            disabled={isProcessing}
            className="h-8"
          >
            <FolderMinus className="h-4 w-4 mr-2" />
            {t('slides.removeFromFolder')}
          </Button>
        )}

        {/* Delete */}
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isProcessing}
          className="h-8"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t('common.delete')}
        </Button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/media/BulkActionBar.tsx
git commit -m "feat(slides): create BulkActionBar component for bulk operations"
```

---

## Task 5: Update Slides Page with View Toggle and Selection

**Files:**
- Modify: `src/pages/Slides.tsx`

**Step 1: Add imports**

Add to existing imports at the top:

```typescript
import { LayoutGrid, List } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MediaListView } from '@/components/media/MediaListView'
import { BulkActionBar } from '@/components/media/BulkActionBar'
import { bulkMoveToFolder, bulkDeleteMedia } from '@/services/media'
```

**Step 2: Add state variables**

Add after line 76 (after `const [deletingFolder, setDeletingFolder] = useState(false)`):

```typescript
  // View mode and selection
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('slides-view-mode') as 'grid' | 'list') || 'grid'
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
```

**Step 3: Add view mode persistence**

Add after the state declarations:

```typescript
  useEffect(() => {
    localStorage.setItem('slides-view-mode', viewMode)
  }, [viewMode])
```

**Step 4: Add bulk action handlers**

Add after `handleDeleteFolder` function (around line 222):

```typescript
  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleBulkMoveToFolder(folderId: string | null) {
    if (selectedIds.size === 0) return

    setBulkProcessing(true)
    try {
      await bulkMoveToFolder(Array.from(selectedIds), folderId)
      toast.success(t('slides.bulkMoveSuccess', { count: selectedIds.size }))
      clearSelection()
      loadMedia()
    } catch (error) {
      console.error('Failed to move slides:', error)
      toast.error(t('common.error'))
    } finally {
      setBulkProcessing(false)
    }
  }

  async function handleBulkRemoveFromFolder() {
    await handleBulkMoveToFolder(null)
    toast.success(t('slides.bulkRemoveSuccess', { count: selectedIds.size }))
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return

    setBulkProcessing(true)
    const toastId = toast.loading(t('common.deleting'))
    try {
      await bulkDeleteMedia(Array.from(selectedIds))
      toast.success(t('slides.bulkDeleteSuccess', { count: selectedIds.size }), { id: toastId })
      clearSelection()
      loadMedia()
    } catch (error) {
      console.error('Failed to delete slides:', error)
      toast.error(t('common.error'), { id: toastId })
    } finally {
      setBulkProcessing(false)
    }
  }

  function handleCreateFolderFromBulk() {
    setEditingFolder(null)
    setFolderDialogOpen(true)
  }
```

**Step 5: Update Search section with view toggle**

Replace the search section (lines 287-326) with:

```typescript
      {/* Search and View Toggle */}
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

        {/* View toggle */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && setViewMode(value as 'grid' | 'list')}
          className="hidden sm:flex"
        >
          <ToggleGroupItem value="grid" aria-label={t('slides.gridView')}>
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={t('slides.listView')}>
            <List className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>

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
```

**Step 6: Update media display section**

Replace the MediaGrid usage (around line 373-382) with:

```typescript
          {viewMode === 'grid' ? (
            <MediaGrid
              media={media}
              loading={loading}
              onClick={(m) => !isBuiltInMedia(m) && setEditMedia(m)}
              onEdit={(m) => !isBuiltInMedia(m) && setEditMedia(m)}
              onDelete={(m) => !isBuiltInMedia(m) && handleDeleteClick(m)}
              emptyTitle={selectedFolderId ? t('slides.emptyFolder') : t('slides.noSlides')}
              emptyDescription={selectedFolderId ? t('slides.emptyFolderDescription') : t('slides.noSlidesDescription')}
            />
          ) : (
            <MediaListView
              media={media}
              loading={loading}
              onClick={(m) => !isBuiltInMedia(m) && setEditMedia(m)}
              onEdit={(m) => !isBuiltInMedia(m) && setEditMedia(m)}
              onDelete={(m) => !isBuiltInMedia(m) && handleDeleteClick(m)}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              folders={folders}
              emptyTitle={selectedFolderId ? t('slides.emptyFolder') : t('slides.noSlides')}
              emptyDescription={selectedFolderId ? t('slides.emptyFolderDescription') : t('slides.noSlidesDescription')}
            />
          )}
```

**Step 7: Add BulkActionBar before closing div**

Add just before the final `</div>` (before line 490):

```typescript
      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        onMoveToFolder={handleBulkMoveToFolder}
        onCreateNewFolder={handleCreateFolderFromBulk}
        onRemoveFromFolder={handleBulkRemoveFromFolder}
        onDelete={handleBulkDelete}
        folders={folders}
        currentFolderId={selectedFolderId}
        isProcessing={bulkProcessing}
      />
```

**Step 8: Add bulk delete confirmation dialog**

Add after the existing delete folder AlertDialog:

```typescript
      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkProcessing && selectedIds.size > 0} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('slides.bulkDeleteConfirm', { count: selectedIds.size })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('slides.bulkDeleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
```

**Step 9: Commit**

```bash
git add src/pages/Slides.tsx
git commit -m "feat(slides): add view toggle and bulk selection to slides page"
```

---

## Task 6: Clear Selection on Navigation

**Files:**
- Modify: `src/pages/Slides.tsx`

**Step 1: Clear selection when changing folders or collections**

Update `handleFolderSelect` function:

```typescript
  function handleFolderSelect(folderId: string | null) {
    setSelectedFolderId(folderId)
    setSelectedIds(new Set()) // Clear selection when changing folders
    if (folderId !== null) {
      setActiveCollection('all')
    }
  }
```

Update the `setActiveCollection` calls to also clear selection. Add a wrapper function:

```typescript
  function handleCollectionChange(collection: SmartCollection) {
    setActiveCollection(collection)
    setSelectedIds(new Set())
  }
```

Then update both MediaSidebar instances to use `onCollectionChange={handleCollectionChange}` instead of `onCollectionChange={setActiveCollection}`.

**Step 2: Commit**

```bash
git add src/pages/Slides.tsx
git commit -m "fix(slides): clear selection when changing folders or collections"
```

---

## Task 7: Test and Verify

**Step 1: Start dev server**

```bash
pnpm dev
```

**Step 2: Manual testing checklist**

- [ ] Navigate to /slides
- [ ] View toggle appears next to search box
- [ ] Click list icon - view switches to list
- [ ] List shows: checkbox, thumbnail, name, date, size, folder
- [ ] Checkbox click selects slide, shows bulk action bar
- [ ] "Select all" checkbox in header works
- [ ] "Move to folder" dropdown shows all folders
- [ ] Moving slides to folder updates their location
- [ ] "Remove from folder" only shows when viewing a folder
- [ ] Delete button shows confirmation, deletes selected slides
- [ ] Selection clears after bulk action
- [ ] View preference persists on refresh
- [ ] Mobile: date/size columns hidden, view toggle hidden

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(slides): address testing feedback"
```

---

## Summary

This plan adds:
1. Translation keys for list view and bulk actions
2. Service functions for bulk operations
3. `MediaListView` component with checkboxes
4. `BulkActionBar` component with move/delete actions
5. View toggle in Slides page with localStorage persistence
6. Selection state management with clear on navigation
