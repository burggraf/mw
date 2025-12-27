import { useTranslation } from 'react-i18next'
import { ImageIcon } from 'lucide-react'
import type { Media } from '@/types/media'
import { MediaCard } from './MediaCard'
import { Skeleton } from '@/components/ui/skeleton'

interface MediaGridProps {
  media: Media[]
  loading?: boolean
  onEdit?: (media: Media) => void
  onDelete?: (media: Media) => void
  onClick?: (media: Media) => void
  selectedId?: string
  selectable?: boolean
  emptyMessage?: string
}

export function MediaGrid({
  media,
  loading = false,
  onEdit,
  onDelete,
  onClick,
  selectedId,
  selectable = false,
  emptyMessage,
}: MediaGridProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={index} className="aspect-video rounded-lg" />
        ))}
      </div>
    )
  }

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ImageIcon className="h-12 w-12 mb-4" />
        <p>{emptyMessage || t('media.noMedia')}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {media.map((item) => (
        <MediaCard
          key={item.id}
          media={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onClick={onClick}
          selected={selectedId === item.id}
          selectable={selectable}
        />
      ))}
    </div>
  )
}
