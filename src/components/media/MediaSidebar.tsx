import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sparkles,
  Clock,
  ImageIcon,
  Video,
  Camera,
  Tag,
} from 'lucide-react'

export type SmartCollection = 'all' | 'recent' | 'images' | 'videos' | 'pexels' | 'unsplash' | 'pixabay'

export interface MediaSidebarProps {
  activeCollection: SmartCollection
  onCollectionChange: (collection: SmartCollection) => void
  tags: string[]
  selectedTags: string[]
  onTagToggle: (tag: string) => void
}

const collections = [
  { key: 'all' as const, icon: Sparkles, labelKey: 'media.allMedia' },
  { key: 'recent' as const, icon: Clock, labelKey: 'media.recentlyAdded' },
  { key: 'images' as const, icon: ImageIcon, labelKey: 'media.images' },
  { key: 'videos' as const, icon: Video, labelKey: 'media.videos' },
  { key: 'pexels' as const, icon: Camera, labelKey: 'media.fromPexels' },
  { key: 'unsplash' as const, icon: Camera, labelKey: 'media.fromUnsplash' },
  { key: 'pixabay' as const, icon: Camera, labelKey: 'media.fromPixabay' },
]

export function MediaSidebar({
  activeCollection,
  onCollectionChange,
  tags,
  selectedTags,
  onTagToggle,
}: MediaSidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="w-56 shrink-0 md:border-r bg-background">
      <div className="flex flex-col gap-4 p-4">
        {/* Smart Collections */}
        <div className="flex flex-col gap-1">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {t('media.filters')}
          </h3>
          {collections.map((collection) => {
            const Icon = collection.icon
            const isActive = activeCollection === collection.key
            return (
              <button
                key={collection.key}
                onClick={() => onCollectionChange(collection.key)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{t(collection.labelKey)}</span>
              </button>
            )
          })}
        </div>

        <Separator />

        {/* Tags Section */}
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Tag className="h-4 w-4" />
            {t('media.tags')}
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
              {t('media.noResults')}
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
