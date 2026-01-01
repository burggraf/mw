import { useState, useRef, useCallback } from 'react'
import { Upload, X, CheckCircle2, AlertCircle, File } from 'lucide-react'
import { toast } from 'sonner'
import { useChurch } from '@/contexts/ChurchContext'
import { getSupabase } from '@/lib/supabase'
import { createMedia } from '@/services/media'
import type { MediaCategory } from '@/types/media'
import {
  validateFile,
  generateImageThumbnail,
  generateVideoThumbnail,
  getImageDimensions,
  getVideoDimensions,
  generateStoragePath,
} from '@/lib/media-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface MediaUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  category?: MediaCategory
  folderId?: string  // Optional folder to upload slides to
}

interface UploadingFile {
  id: string
  file: File
  name: string
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
}

export function MediaUploadDialog({
  open,
  onOpenChange,
  onSuccess,
  category = 'background',
  folderId,
}: MediaUploadDialogProps) {
  const { currentChurch } = useChurch()
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateFileProgress = useCallback(
    (id: string, updates: Partial<UploadingFile>) => {
      setUploadingFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
      )
    },
    []
  )

  const uploadFile = useCallback(
    async (uploadingFile: UploadingFile) => {
      if (!currentChurch) return

      const { id, file } = uploadingFile
      const supabase = getSupabase()

      try {
        // Step 1: Validate file (10%)
        updateFileProgress(id, { status: 'uploading', progress: 10 })
        const validation = validateFile(file)
        if (!validation.valid) {
          throw new Error(validation.error)
        }

        const fileType = validation.fileType!

        // Step 2: Get dimensions (20%)
        updateFileProgress(id, { progress: 20 })
        let dimensions: { width: number; height: number; duration?: number }

        if (fileType === 'image') {
          dimensions = await getImageDimensions(file)
        } else {
          dimensions = await getVideoDimensions(file)
        }

        // Step 3: Generate thumbnail (40%)
        updateFileProgress(id, { progress: 40 })
        let thumbnailBlob: Blob

        if (fileType === 'image') {
          thumbnailBlob = await generateImageThumbnail(file)
        } else {
          thumbnailBlob = await generateVideoThumbnail(file)
        }

        // Step 4: Upload original (60%)
        updateFileProgress(id, { progress: 60 })
        const storagePath = generateStoragePath(
          currentChurch.id,
          file.name,
          false,
          file.type
        )

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(storagePath, file)

        if (uploadError) {
          throw new Error(`Failed to upload file: ${uploadError.message}`)
        }

        // Step 5: Upload thumbnail (80%)
        updateFileProgress(id, { progress: 80 })
        const thumbnailPath = generateStoragePath(
          currentChurch.id,
          file.name,
          true
        )

        const { error: thumbError } = await supabase.storage
          .from('media')
          .upload(thumbnailPath, thumbnailBlob)

        if (thumbError) {
          console.error('Thumbnail upload failed:', thumbError)
          // Continue even if thumbnail fails
        }

        // Step 6: Create DB record (90%)
        updateFileProgress(id, { progress: 90 })

        await createMedia(currentChurch.id, {
          name: file.name,
          type: fileType,
          mimeType: file.type,
          storagePath,
          thumbnailPath: thumbError ? undefined : thumbnailPath,
          fileSize: file.size,
          width: dimensions.width,
          height: dimensions.height,
          duration: 'duration' in dimensions ? dimensions.duration : undefined,
          source: 'upload',
          category,
          folderId,
        })

        // Step 7: Complete (100%)
        updateFileProgress(id, { progress: 100, status: 'complete' })
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Upload failed'
        updateFileProgress(id, { status: 'error', error: errorMessage })
      }
    },
    [currentChurch, updateFileProgress]
  )

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!currentChurch) {
        toast.error('No church selected')
        return
      }

      const fileArray = Array.from(files)
      if (fileArray.length === 0) return

      // Create upload entries
      const newUploadingFiles: UploadingFile[] = fileArray.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        progress: 0,
        status: 'pending' as const,
      }))

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles])
      setIsUploading(true)

      // Upload files sequentially to avoid overwhelming the browser
      for (const uploadingFile of newUploadingFiles) {
        await uploadFile(uploadingFile)
      }

      setIsUploading(false)

      // Get final state after uploads complete
      setUploadingFiles((currentFiles) => {
        const successCount = currentFiles.filter(
          (f) => f.status === 'complete'
        ).length
        const errorCount = currentFiles.filter(
          (f) => f.status === 'error'
        ).length

        if (successCount > 0) {
          toast.success(
            `Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}`
          )
          onSuccess?.()
        }

        if (errorCount > 0) {
          toast.error(`${errorCount} file${errorCount > 1 ? 's' : ''} failed to upload`)
        }

        return currentFiles
      })
    },
    [currentChurch, uploadFile, onSuccess]
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const { files } = e.dataTransfer
      if (files && files.length > 0) {
        processFiles(files)
      }
    },
    [processFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target
      if (files && files.length > 0) {
        processFiles(files)
      }
      // Reset input so same file can be selected again
      e.target.value = ''
    },
    [processFiles]
  )

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleRemoveFile = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleClose = useCallback(() => {
    if (!isUploading) {
      setUploadingFiles([])
      onOpenChange(false)
    }
  }, [isUploading, onOpenChange])

  const handleClearCompleted = useCallback(() => {
    setUploadingFiles((prev) =>
      prev.filter((f) => f.status !== 'complete' && f.status !== 'error')
    )
  }, [])

  const hasCompleted = uploadingFiles.some(
    (f) => f.status === 'complete' || f.status === 'error'
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Media</DialogTitle>
          <DialogDescription>
            Drag and drop files or click to browse. Supports images (JPG, PNG,
            GIF, WebP) and videos (MP4, WebM, MOV).
          </DialogDescription>
        </DialogHeader>

        {/* Drop Zone */}
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div
              className={cn(
                'rounded-full p-4 transition-colors',
                isDragging ? 'bg-primary/10' : 'bg-muted'
              )}
            >
              <Upload
                className={cn(
                  'h-8 w-8 transition-colors',
                  isDragging ? 'text-primary' : 'text-muted-foreground'
                )}
              />
            </div>
            <div>
              <p className="text-sm font-medium">
                {isDragging ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to browse
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBrowseClick}
              disabled={isUploading}
            >
              Browse Files
            </Button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Upload Progress List */}
        {uploadingFiles.length > 0 && (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {uploadingFiles.length} file{uploadingFiles.length > 1 ? 's' : ''}
              </p>
              {hasCompleted && !isUploading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCompleted}
                  className="h-auto py-1 px-2 text-xs"
                >
                  Clear completed
                </Button>
              )}
            </div>

            {uploadingFiles.map((uploadingFile) => (
              <div
                key={uploadingFile.id}
                className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {uploadingFile.status === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : uploadingFile.status === 'error' ? (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <File className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* File Info & Progress */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {uploadingFile.name}
                  </p>
                  {uploadingFile.status === 'uploading' && (
                    <Progress
                      value={uploadingFile.progress}
                      className="h-1 mt-1"
                    />
                  )}
                  {uploadingFile.status === 'error' && (
                    <p className="text-xs text-destructive mt-0.5 truncate">
                      {uploadingFile.error}
                    </p>
                  )}
                </div>

                {/* Progress Text / Remove Button */}
                <div className="flex-shrink-0">
                  {uploadingFile.status === 'uploading' ? (
                    <span className="text-xs text-muted-foreground">
                      {uploadingFile.progress}%
                    </span>
                  ) : uploadingFile.status !== 'pending' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleRemoveFile(uploadingFile.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            {isUploading ? 'Uploading...' : 'Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
