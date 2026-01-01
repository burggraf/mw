import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  Clock,
  ImageIcon,
  Video,
  Camera,
  Tag,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SlideFolder } from '@/types/media'

export type SmartCollection = 'all' | 'recent' | 'images' | 'videos' | 'pexels' | 'unsplash' | 'pixabay'

export interface MediaSidebarProps {
  activeCollection: SmartCollection
  onCollectionChange: (collection: SmartCollection) => void
  tags: string[]
  selectedTags: string[]
  onTagToggle: (tag: string) => void
  translationNamespace?: 'backgrounds' | 'slides'
  // Folder support (optional - only for slides)
  folders?: SlideFolder[]
  selectedFolderId?: string | null
  onFolderSelect?: (folderId: string | null) => void
  onCreateFolder?: () => void
  onEditFolder?: (folder: SlideFolder) => void
  onDeleteFolder?: (folder: SlideFolder) => void
}

// Collection config with label keys relative to namespace
const collections = [
  { key: 'all' as const, icon: Sparkles, labelKey: 'allMedia' },
  { key: 'recent' as const, icon: Clock, labelKey: 'recentlyAdded' },
  { key: 'images' as const, icon: ImageIcon, labelKey: 'images' },
  { key: 'videos' as const, icon: Video, labelKey: 'videos' },
  { key: 'pexels' as const, icon: Camera, labelKey: 'fromPexels' },
  { key: 'unsplash' as const, icon: Camera, labelKey: 'fromUnsplash' },
  { key: 'pixabay' as const, icon: Camera, labelKey: 'fromPixabay' },
]

export function MediaSidebar({
  activeCollection,
  onCollectionChange,
  tags,
  selectedTags,
  onTagToggle,
  translationNamespace = 'backgrounds',
  folders,
  selectedFolderId,
  onFolderSelect,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
}: MediaSidebarProps) {
  const { t } = useTranslation()
  const ns = translationNamespace
  const showFolders = folders !== undefined && onFolderSelect !== undefined

  return (
    <aside className="w-56 shrink-0 md:border-r bg-background">
      <div className="flex flex-col gap-4 p-4">
        {/* Folders Section (only for slides) */}
        {showFolders && (
          <>
            <div className="flex flex-col gap-1">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t(`${ns}.folders`)}
                </h3>
                {onCreateFolder && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={onCreateFolder}
                    title={t(`${ns}.createFolder`)}
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {/* All Slides (no folder) option */}
              <button
                onClick={() => onFolderSelect(null)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  selectedFolderId === null
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Sparkles className="h-4 w-4" />
                <span>{t(`${ns}.allSlides`)}</span>
              </button>
              {/* Folder list */}
              {folders.map((folder) => {
                const isActive = selectedFolderId === folder.id
                return (
                  <div
                    key={folder.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <button
                      onClick={() => onFolderSelect(folder.id)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <Folder className="h-4 w-4" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                    {(onEditFolder || onDeleteFolder) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-6 w-6 opacity-0 group-hover:opacity-100',
                              isActive && 'text-primary-foreground hover:text-primary-foreground'
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onEditFolder && (
                            <DropdownMenuItem onClick={() => onEditFolder(folder)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                          )}
                          {onDeleteFolder && (
                            <DropdownMenuItem
                              onClick={() => onDeleteFolder(folder)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('common.delete')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )
              })}
            </div>
            <Separator />
          </>
        )}

        {/* Smart Collections */}
        <div className="flex flex-col gap-1">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {t(`${ns}.filters`)}
          </h3>
          {collections.map((collection) => {
            const Icon = collection.icon
            const isActive = activeCollection === collection.key && (!showFolders || selectedFolderId === null)
            return (
              <button
                key={collection.key}
                onClick={() => {
                  onCollectionChange(collection.key)
                  // Clear folder selection when selecting a smart collection
                  if (showFolders) onFolderSelect(null)
                }}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{t(`${ns}.${collection.labelKey}`)}</span>
              </button>
            )
          })}
        </div>

        <Separator />

        {/* Tags Section */}
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Tag className="h-4 w-4" />
            {t(`${ns}.tags`)}
          </h3>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = selectedTags.includes(tag)
                return (
                  <Badge
                    key={tag}
                    variant={isSelected ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => onTagToggle(tag)}
                  >
                    {tag}
                  </Badge>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(`${ns}.noResults`)}
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
