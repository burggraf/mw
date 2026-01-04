import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { MoreHorizontal, Pencil, Trash2, Play, Folder, ArrowUp, ArrowDown } from 'lucide-react'
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

type SortField = 'name' | 'uploaded' | 'size' | 'folder'
type SortDirection = 'asc' | 'desc'

function SortableHeader({
  field,
  currentField,
  direction,
  onSort,
  children,
  className,
}: {
  field: SortField
  currentField: SortField | null
  direction: SortDirection
  onSort: (field: SortField) => void
  children: React.ReactNode
  className?: string
}) {
  const isActive = currentField === field

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        'flex items-center gap-1 hover:text-foreground transition-colors',
        isActive && 'text-foreground',
        className
      )}
    >
      {children}
      {isActive && (
        direction === 'asc'
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />
      )}
    </button>
  )
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
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const folderMap = new Map(folders.map(f => [f.id, f.name]))

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedMedia = useMemo(() => {
    if (!sortField) return media

    return [...media].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'uploaded':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'size':
          comparison = a.fileSize - b.fileSize
          break
        case 'folder': {
          const folderA = a.folderId ? folderMap.get(a.folderId) || '' : ''
          const folderB = b.folderId ? folderMap.get(b.folderId) || '' : ''
          comparison = folderA.localeCompare(folderB)
          break
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [media, sortField, sortDirection, folderMap])

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
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={handleSelectAll}
          />
        </div>
        <div className="w-16 shrink-0">{t('slides.preview')}</div>
        <SortableHeader
          field="name"
          currentField={sortField}
          direction={sortDirection}
          onSort={handleSort}
          className="flex-1"
        >
          {t('slides.name')}
        </SortableHeader>
        <SortableHeader
          field="uploaded"
          currentField={sortField}
          direction={sortDirection}
          onSort={handleSort}
          className="hidden sm:flex w-28"
        >
          {t('slides.uploaded')}
        </SortableHeader>
        <SortableHeader
          field="size"
          currentField={sortField}
          direction={sortDirection}
          onSort={handleSort}
          className="hidden sm:flex w-20 justify-end"
        >
          {t('slides.size')}
        </SortableHeader>
        <SortableHeader
          field="folder"
          currentField={sortField}
          direction={sortDirection}
          onSort={handleSort}
          className="hidden md:flex w-32"
        >
          {t('slides.folder')}
        </SortableHeader>
        <div className="w-8" />
      </div>

      {/* Rows */}
      {sortedMedia.map((item) => (
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
