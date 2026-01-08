import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, FolderInput, FolderMinus, Trash2, ChevronDown, Loader2 } from 'lucide-react'
import type { SongFolder } from '@/types/folder'
import { Button } from '@/components/ui/button'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SongBulkActionBarProps {
  selectedCount: number
  onClear: () => void
  onMoveToFolder: (folderId: string | null) => Promise<void>
  onCreateNewFolder: () => void
  onRemoveFromFolder: () => Promise<void>
  onDelete: () => void
  folders: SongFolder[]
  currentFolderId: string | null
  isProcessing?: boolean
}

export function SongBulkActionBar({
  selectedCount,
  onClear,
  onMoveToFolder,
  onCreateNewFolder,
  onRemoveFromFolder,
  onDelete,
  folders,
  currentFolderId,
  isProcessing = false,
}: SongBulkActionBarProps) {
  const { t } = useTranslation()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
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

  const handleDelete = () => {
    setDeleteDialogOpen(false)
    onDelete()
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-2 bg-background border rounded-lg shadow-lg px-4 py-3">
          {/* Clear button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={isProcessing}
            className="h-8 px-2"
            aria-label={t('songs.clearSelection')}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Selected count */}
          <span className="text-sm font-medium px-2 border-r">
            {selectedCount} {t('songs.selected')}
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
                {t('songs.moveToFolder')}
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => handleMoveToFolder(null)}>
                {t('songs.allSongs')}
              </DropdownMenuItem>
              {folders.length > 0 && <DropdownMenuSeparator />}
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
              {t('songs.removeFromFolder')}
            </Button>
          )}

          {/* Delete */}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={isProcessing}
            className="h-8"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('common.delete')}
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('songs.deleteConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('songs.deleteConfirm.message', { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
