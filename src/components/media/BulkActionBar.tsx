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
  onDelete: () => void
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
  const [isMoving, setIsMoving] = useState(false)

  if (selectedCount === 0) return null

  const handleMoveToFolder = async (folderId: string | null) => {
    setIsMoving(true)
    try {
      await onMoveToFolder(folderId)
    } finally {
      setIsMoving(false)
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
          aria-label={t('slides.clearSelection')}
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
              {isMoving ? (
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
