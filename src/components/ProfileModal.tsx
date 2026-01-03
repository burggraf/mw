import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Camera } from 'lucide-react'

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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

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
  const { user, userProfile, updateProfile } = useAuth()

  const [displayName, setDisplayName] = useState(userProfile?.display_name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Crop state
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [isCropping, setIsCropping] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Reset state when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setDisplayName(userProfile?.display_name || '')
      setError(null)
      setIsCropping(false)
      setImageSrc(null)
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
