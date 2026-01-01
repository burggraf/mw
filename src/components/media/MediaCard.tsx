import { useEffect, useState } from 'react'
import { Play, MoreHorizontal, Pencil, Trash2, Palette } from 'lucide-react'
import type { Media } from '@/types/media'
import { isBuiltInMedia } from '@/types/media'
import { getSignedMediaUrl } from '@/services/media'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface MediaCardProps {
  media: Media
  onEdit?: (media: Media) => void
  onDelete?: (media: Media) => void
  onConfigureStyle?: (media: Media) => void
  onClick?: (media: Media) => void
  selected?: boolean
  selectable?: boolean
}

export function MediaCard({
  media,
  onEdit,
  onDelete,
  onConfigureStyle,
  onClick,
  selected = false,
  selectable = false,
}: MediaCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!media.backgroundColor)
  const [error, setError] = useState(false)

  // Check if this is a solid color background
  const isSolidColor = !!media.backgroundColor

  useEffect(() => {
    // Skip loading for solid color backgrounds
    if (isSolidColor) {
      setIsLoading(false)
      return
    }

    let isMounted = true

    async function loadThumbnail() {
      try {
        const path = media.thumbnailPath || media.storagePath
        if (!path) {
          if (isMounted) {
            setError(true)
            setIsLoading(false)
          }
          return
        }
        const url = await getSignedMediaUrl(path)
        if (isMounted) {
          setThumbnailUrl(url)
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Failed to load thumbnail:', err)
        if (isMounted) {
          setError(true)
          setIsLoading(false)
        }
      }
    }

    loadThumbnail()

    return () => {
      isMounted = false
    }
  }, [media.thumbnailPath, media.storagePath, isSolidColor])

  const handleClick = () => {
    if (onClick) {
      onClick(media)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onEdit) {
      onEdit(media)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete) {
      onDelete(media)
    }
  }

  const handleConfigureStyle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onConfigureStyle) {
      onConfigureStyle(media)
    }
  }

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-lg overflow-hidden bg-muted border border-gray-400',
        selectable && 'ring-2 ring-transparent hover:ring-primary/50',
        selected && 'ring-2 ring-primary',
        onClick && 'cursor-pointer'
      )}
      onClick={handleClick}
    >
      {/* Thumbnail with aspect-video ratio */}
      <div className="aspect-video relative">
        {isLoading ? (
          <Skeleton className="absolute inset-0" />
        ) : isSolidColor ? (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: media.backgroundColor! }}
          />
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-sm">
            Failed to load
          </div>
        ) : (
          <img
            src={thumbnailUrl || ''}
            alt={media.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Video play icon overlay */}
        {media.type === 'video' && !isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/60 p-3">
              <Play className="h-6 w-6 text-white fill-white" />
            </div>
          </div>
        )}

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors">
          {/* Edit/Delete/Style dropdown menu - hidden for built-in media */}
          {(onEdit || onDelete || onConfigureStyle) && !isBuiltInMedia(media) && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={handleEdit}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onConfigureStyle && (
                    <DropdownMenuItem onClick={handleConfigureStyle}>
                      <Palette className="h-4 w-4 mr-2" />
                      Style
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Media name on hover */}
          <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-white text-sm font-medium truncate drop-shadow-md">
              {media.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
