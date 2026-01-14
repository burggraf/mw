import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { AlertTriangle, Camera, ExternalLink, Loader2 } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  checkCanDeleteAccount,
  deleteUserAccount,
  type BlockingChurch,
  type AccountDeletionProgress,
} from '@/services/account'

const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  )
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { t } = useTranslation()
  const { user, userProfile, updateProfile, signOut } = useAuth()

  const [displayName, setDisplayName] = useState(userProfile?.display_name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Crop state
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [isCropping, setIsCropping] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Account deletion state
  const [canDelete, setCanDelete] = useState<boolean | null>(null)
  const [blockingChurches, setBlockingChurches] = useState<BlockingChurch[]>([])
  const [isCheckingDelete, setIsCheckingDelete] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletionProgress, setDeletionProgress] = useState<AccountDeletionProgress | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Check if user can delete their account when modal opens
  useEffect(() => {
    if (open) {
      setIsCheckingDelete(true)
      checkCanDeleteAccount()
        .then((result) => {
          setCanDelete(result.canDelete)
          setBlockingChurches(result.blockingChurches)
        })
        .catch((err) => {
          console.error('Error checking delete status:', err)
          setCanDelete(false)
        })
        .finally(() => {
          setIsCheckingDelete(false)
        })
    }
  }, [open])

  // Generate initials from display name or email
  const getInitials = () => {
    if (userProfile?.display_name) {
      const parts = userProfile.display_name.trim().split(/\s+/)
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      }
      return userProfile.display_name.slice(0, 2).toUpperCase()
    }
    return user?.email?.slice(0, 2).toUpperCase() || '??'
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Validate file type
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setError(t('profile.invalidFileType'))
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(t('profile.fileTooLarge'))
      return
    }

    // Read file and show crop UI
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result as string)
      setIsCropping(true)
    }
    reader.readAsDataURL(file)
  }

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height, 1))
  }, [])

  const getCroppedImage = async (): Promise<Blob | null> => {
    const image = imgRef.current
    if (!image || !crop) return null

    const canvas = document.createElement('canvas')
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    const pixelCrop = {
      x: (crop.x / 100) * image.width * scaleX,
      y: (crop.y / 100) * image.height * scaleY,
      width: (crop.width / 100) * image.width * scaleX,
      height: (crop.height / 100) * image.height * scaleY,
    }

    // Set canvas size to desired output size (256x256 for avatars)
    const outputSize = 256
    canvas.width = outputSize
    canvas.height = outputSize

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outputSize,
      outputSize
    )

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1)
    })
  }

  const handleCropConfirm = async () => {
    if (!user) return

    setIsSaving(true)
    setError(null)

    try {
      const croppedBlob = await getCroppedImage()
      if (!croppedBlob) {
        throw new Error('Failed to crop image')
      }

      const supabase = getSupabase()
      const filePath = `${user.id}/avatar.png`

      // Delete existing avatar if any
      await supabase.storage.from('avatars').remove([filePath])

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, croppedBlob, {
          contentType: 'image/png',
          upsert: true,
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Add cache buster to force refresh
      const avatarUrl = `${publicUrl}?t=${Date.now()}`

      // Update profile with new avatar URL
      await updateProfile({ avatar_url: avatarUrl })

      setIsCropping(false)
      setImageSrc(null)
    } catch (err) {
      console.error('Error uploading avatar:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload avatar')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCropCancel = () => {
    setIsCropping(false)
    setImageSrc(null)
    setCrop(undefined)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      await updateProfile({
        display_name: displayName.trim() || null,
      })
      onOpenChange(false)
    } catch (err) {
      console.error('Error updating profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!user || !userProfile?.avatar_url) return

    setIsSaving(true)
    setError(null)

    try {
      const supabase = getSupabase()
      const filePath = `${user.id}/avatar.png`

      // Delete from storage
      await supabase.storage.from('avatars').remove([filePath])

      // Update profile
      await updateProfile({ avatar_url: null })
    } catch (err) {
      console.error('Error removing avatar:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove avatar')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deleteUserAccount((progress) => {
        setDeletionProgress(progress)
      })
      // Account deleted - sign out locally and redirect
      await signOut()
      window.location.href = '/'
    } catch (err) {
      console.error('Error deleting account:', err)
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account')
      setIsDeleting(false)
      setDeletionProgress(null)
    }
  }

  // Reset state when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setDisplayName(userProfile?.display_name || '')
      setError(null)
      setIsCropping(false)
      setImageSrc(null)
      // Reset delete state
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
      setDeleteError(null)
      setDeletionProgress(null)
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profile.title')}</DialogTitle>
        </DialogHeader>

        {isCropping && imageSrc ? (
          // Crop UI
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('profile.cropTitle')}</p>
            <div className="flex justify-center">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                aspect={1}
                circularCrop
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  className="max-h-64"
                />
              </ReactCrop>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={handleCropCancel} disabled={isSaving}>
                {t('profile.cancel')}
              </Button>
              <Button onClick={handleCropConfirm} disabled={isSaving}>
                {isSaving ? t('profile.saving') : t('profile.cropConfirm')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Profile edit UI
          <div className="space-y-6">
            {/* Avatar section */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <Avatar className="h-24 w-24">
                  {userProfile?.avatar_url && (
                    <AvatarImage src={userProfile.avatar_url} alt="Avatar" />
                  )}
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={isSaving}
                >
                  <Camera className="h-6 w-6 text-white" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES.join(',')}
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving}
                >
                  {userProfile?.avatar_url ? t('profile.changeAvatar') : t('profile.uploadAvatar')}
                </Button>
                {userProfile?.avatar_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={isSaving}
                  >
                    {t('profile.removeAvatar')}
                  </Button>
                )}
              </div>
            </div>

            {/* Display name input */}
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('profile.displayName')}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('profile.displayNamePlaceholder')}
                disabled={isSaving}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                {t('profile.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? t('profile.saving') : t('profile.save')}
              </Button>
            </DialogFooter>

            {/* Danger Zone */}
            <Separator className="my-6" />
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {t('churchProfile.dangerZone')}
              </h3>

              {isCheckingDelete ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : canDelete === false ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <p className="font-medium">{t('profile.cannotDeleteAccount')}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('profile.soleAdminWarning')}</p>
                  <ul className="space-y-2 mt-2">
                    {blockingChurches.map((church) => (
                      <li key={church.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium truncate">{church.name}</span>
                        <Link
                          to="/team"
                          onClick={() => onOpenChange(false)}
                          className="inline-flex items-center gap-1 text-primary hover:underline flex-shrink-0"
                        >
                          {t('profile.goToTeam')}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : !showDeleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t('profile.deleteAccountWarning')}
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSaving}
                  >
                    {t('profile.deleteAccount')}
                  </Button>
                </div>
              ) : isDeleting ? (
                <div className="space-y-2" aria-live="polite" role="status">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span className="text-sm">
                      {deletionProgress?.message || t('profile.deletingAccount')}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <p className="font-medium">{t('profile.deleteAccountTitle')}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('profile.deleteAccountWarning')}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deleteConfirm" className="text-sm">
                      {t('profile.typeDeleteToConfirm')}
                    </Label>
                    <Input
                      id="deleteConfirm"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="font-mono"
                      autoComplete="off"
                    />
                  </div>

                  {deleteError && (
                    <p className="text-sm text-destructive">{deleteError}</p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteConfirm(false)
                        setDeleteConfirmText('')
                        setDeleteError(null)
                      }}
                    >
                      {t('profile.cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                    >
                      {t('profile.deleteAccountButton')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
