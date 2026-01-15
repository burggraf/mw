import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { toast } from 'sonner'
import { useChurch } from '@/contexts/ChurchContext'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { getSongs } from '@/services/songs'
import { getEvents } from '@/services/events'
import { getDisplaysForChurch } from '@/services/displays'
import { deleteChurch, type DeletionProgress } from '@/services/memberships'
import { deleteUserAccount, type AccountDeletionProgress } from '@/services/account'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Database, CreditCard, Image, Presentation, FileImage, FolderOpen, Music, Calendar, Monitor, BarChart3, Camera, AlertTriangle, Trash2, Loader2, LogOut, UserX, PlusCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChurchAvatar } from '@/components/ChurchAvatar'

const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

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

interface StorageCategory {
  name: string
  size: number
  count: number
  icon: React.ComponentType<{ className?: string }>
}

interface StorageStats {
  total: number
  categories: StorageCategory[]
}

interface ChurchStats {
  songs: number
  totalEvents: number
  upcomingEvents: number
  backgrounds: number
  slides: number
  displays: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function ChurchProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentChurch, churches, setCurrentChurch, refreshChurches, isAdmin, updateChurchAvatar } = useChurch()
  const { signOut } = useAuth()

  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [churchStats, setChurchStats] = useState<ChurchStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Avatar state
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [isCropping, setIsCropping] = useState(false)
  const [isSavingAvatar, setIsSavingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete church state
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deletionState, setDeletionState] = useState<'idle' | 'deleting' | 'error'>('idle')
  const [deletionProgress, setDeletionProgress] = useState<DeletionProgress | null>(null)

  // "What's next" dialog state (shown after deleting last church)
  const [showWhatsNextDialog, setShowWhatsNextDialog] = useState(false)
  const [whatsNextStep, setWhatsNextStep] = useState<'choose' | 'confirm-delete' | 'deleting-account'>('choose')
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('')
  const [accountDeletionProgress, setAccountDeletionProgress] = useState<AccountDeletionProgress | null>(null)
  const [accountDeletionError, setAccountDeletionError] = useState<string | null>(null)

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin && currentChurch) {
      navigate('/dashboard')
    }
  }, [isAdmin, currentChurch, navigate])

  useEffect(() => {
    if (!currentChurch || !isAdmin) return

    const loadStats = async () => {
      setLoading(true)
      setError(null)

      try {
        const supabase = getSupabase()

        // Fetch all stats in parallel
        const [storageResult, songs, allEvents, upcomingEvents, displays] = await Promise.all([
          supabase.rpc('get_church_storage_stats', { p_church_id: currentChurch.id }),
          getSongs(currentChurch.id),
          getEvents(currentChurch.id, 'all'),
          getEvents(currentChurch.id, 'upcoming'),
          getDisplaysForChurch(currentChurch.id),
        ])

        if (storageResult.error) throw storageResult.error

        // Map categories to display info
        const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
          background: Image,
          slide: Presentation,
          thumbnails: FileImage,
          other: FolderOpen,
        }

        const categoryNames: Record<string, string> = {
          background: 'backgrounds',
          slide: 'slides',
          thumbnails: 'thumbnails',
          other: 'other',
        }

        const categories: StorageCategory[] = (storageResult.data || []).map((item: { category: string; file_count: number; total_bytes: number }) => ({
          name: categoryNames[item.category] || item.category,
          size: Number(item.total_bytes) || 0,
          count: Number(item.file_count) || 0,
          icon: categoryIcons[item.category] || FolderOpen,
        }))

        const total = categories.reduce((sum, cat) => sum + cat.size, 0)

        // Get background and slide counts from storage categories
        const backgroundCat = categories.find(c => c.name === 'backgrounds')
        const slideCat = categories.find(c => c.name === 'slides')

        setStorageStats({
          total,
          categories: categories.filter(cat => cat.count > 0),
        })

        setChurchStats({
          songs: songs.length,
          totalEvents: allEvents.length,
          upcomingEvents: upcomingEvents.length,
          backgrounds: backgroundCat?.count || 0,
          slides: slideCat?.count || 0,
          displays: displays.length,
        })
      } catch (err) {
        console.error('Failed to load stats:', err)
        setError(t('churchProfile.error'))
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [currentChurch, isAdmin, t])

  // Avatar handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAvatarError(null)

    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setAvatarError(t('profile.invalidFileType'))
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setAvatarError(t('profile.fileTooLarge'))
      return
    }

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
    if (!currentChurch) return

    setIsSavingAvatar(true)
    setAvatarError(null)

    try {
      const croppedBlob = await getCroppedImage()
      if (!croppedBlob) {
        throw new Error('Failed to crop image')
      }

      const supabase = getSupabase()
      const filePath = `church/${currentChurch.id}/avatar.png`

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

      // Add cache buster
      const avatarUrl = `${publicUrl}?t=${Date.now()}`

      // Update church with new avatar URL
      await updateChurchAvatar(avatarUrl)

      setIsCropping(false)
      setImageSrc(null)
    } catch (err) {
      console.error('Error uploading avatar:', err)
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload avatar')
    } finally {
      setIsSavingAvatar(false)
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

  const handleRemoveAvatar = async () => {
    if (!currentChurch?.avatar_url) return

    setIsSavingAvatar(true)
    setAvatarError(null)

    try {
      const supabase = getSupabase()
      const filePath = `church/${currentChurch.id}/avatar.png`

      await supabase.storage.from('avatars').remove([filePath])
      await updateChurchAvatar(null)
    } catch (err) {
      console.error('Error removing avatar:', err)
      setAvatarError(err instanceof Error ? err.message : 'Failed to remove avatar')
    } finally {
      setIsSavingAvatar(false)
    }
  }

  // Delete church handler
  const handleDeleteChurch = async () => {
    if (!currentChurch || confirmName !== currentChurch.name) return

    // Calculate remaining churches BEFORE deletion (closure would have stale value after refresh)
    const remainingChurches = churches.filter(c => c.id !== currentChurch.id)

    setShowDeleteConfirmDialog(false)
    setConfirmName('')
    setDeletionState('deleting')

    try {
      await deleteChurch(currentChurch.id, (progress) => {
        setDeletionProgress(progress)
      })

      toast.success(t('churchProfile.churchDeleted'))
      setDeletionState('idle')

      // Update context and navigate
      if (remainingChurches.length > 0) {
        setCurrentChurch(remainingChurches[0])
        await refreshChurches()
        navigate('/dashboard')
      } else {
        // No churches left - show options dialog
        await refreshChurches()
        setShowWhatsNextDialog(true)
      }
    } catch (err) {
      console.error('Failed to delete church:', err)
      setDeletionState('error')
      setDeletionProgress({
        step: 'complete',
        message: err instanceof Error ? err.message : t('common.error'),
      })
    }
  }

  // Handle account deletion from "what's next" dialog
  const handleDeleteAccountFromDialog = async () => {
    if (deleteAccountConfirmText !== 'DELETE') return

    setWhatsNextStep('deleting-account')
    setAccountDeletionError(null)

    try {
      await deleteUserAccount((progress) => {
        setAccountDeletionProgress(progress)
      })
      await signOut()
      window.location.href = '/'
    } catch (err) {
      console.error('Error deleting account:', err)
      setAccountDeletionError(err instanceof Error ? err.message : 'Failed to delete account')
      setWhatsNextStep('confirm-delete')
    }
  }

  // Handle sign out from "what's next" dialog
  const handleSignOutFromDialog = async () => {
    await signOut()
    navigate('/')
  }

  // Show "What's next" dialog if user just deleted their last church
  if (showWhatsNextDialog) {
    return (
      <Dialog open={showWhatsNextDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {whatsNextStep === 'choose' && t('churchProfile.whatsNext')}
              {whatsNextStep === 'confirm-delete' && t('profile.deleteAccountTitle')}
              {whatsNextStep === 'deleting-account' && t('profile.deletingAccount')}
            </DialogTitle>
            {whatsNextStep === 'choose' && (
              <DialogDescription>
                {t('churchProfile.noChurchesLeft')}
              </DialogDescription>
            )}
          </DialogHeader>

          {whatsNextStep === 'choose' && (
            <div className="space-y-3 py-4">
              <Button
                variant="default"
                className="w-full justify-start gap-3"
                onClick={() => navigate('/setup-church')}
              >
                <PlusCircle className="h-5 w-5" />
                {t('churchProfile.createNewChurch')}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={() => setWhatsNextStep('confirm-delete')}
              >
                <UserX className="h-5 w-5" />
                {t('profile.deleteAccount')}
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3"
                onClick={handleSignOutFromDialog}
              >
                <LogOut className="h-5 w-5" />
                {t('auth.signOut')}
              </Button>
            </div>
          )}

          {whatsNextStep === 'confirm-delete' && (
            <div className="space-y-4 py-4">
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-500">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <p className="font-medium">{t('profile.deleteAccountTitle')}</p>
                </div>
                <p className="text-sm text-muted-foreground">{t('profile.deleteAccountWarning')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deleteAccountConfirm" className="text-sm">
                  {t('profile.typeDeleteToConfirm')}
                </Label>
                <Input
                  id="deleteAccountConfirm"
                  value={deleteAccountConfirmText}
                  onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="font-mono"
                  autoComplete="off"
                />
              </div>

              {accountDeletionError && (
                <p className="text-sm text-destructive">{accountDeletionError}</p>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setWhatsNextStep('choose')
                    setDeleteAccountConfirmText('')
                    setAccountDeletionError(null)
                  }}
                >
                  {t('common.back')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccountFromDialog}
                  disabled={deleteAccountConfirmText !== 'DELETE'}
                >
                  {t('profile.deleteAccountButton')}
                </Button>
              </DialogFooter>
            </div>
          )}

          {whatsNextStep === 'deleting-account' && (
            <div className="py-8 flex flex-col items-center gap-4" aria-live="polite" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {accountDeletionProgress?.message || t('profile.deletingAccount')}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8 max-w-4xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('churchProfile.accessDenied')}</AlertTitle>
          <AlertDescription>{t('churchProfile.adminOnly')}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl ml-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('churchProfile.title')}</h1>
      </div>

      <div className="space-y-6">
        {/* Church Avatar Card */}
        <Card>
          <CardContent className="pt-6">
            {isCropping && imageSrc ? (
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
                {avatarError && <p className="text-sm text-destructive">{avatarError}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleCropCancel} disabled={isSavingAvatar}>
                    {t('profile.cancel')}
                  </Button>
                  <Button onClick={handleCropConfirm} disabled={isSavingAvatar}>
                    {isSavingAvatar ? t('profile.saving') : t('profile.cropConfirm')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <ChurchAvatar
                    name={currentChurch?.name || ''}
                    avatarUrl={currentChurch?.avatar_url}
                    className="h-20 w-20"
                    fallbackClassName="text-2xl"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={isSavingAvatar}
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
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">{currentChurch?.name}</h2>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSavingAvatar}
                    >
                      {currentChurch?.avatar_url ? t('profile.changeAvatar') : t('profile.uploadAvatar')}
                    </Button>
                    {currentChurch?.avatar_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveAvatar}
                        disabled={isSavingAvatar}
                      >
                        {t('profile.removeAvatar')}
                      </Button>
                    )}
                  </div>
                  {avatarError && <p className="text-sm text-destructive mt-2">{avatarError}</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analytics Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t('churchProfile.analytics')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : churchStats ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.songs}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.songs')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.totalEvents}</div>
                  <div className="text-xs text-muted-foreground">{t('churchProfile.totalEvents')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.upcomingEvents}</div>
                  <div className="text-xs text-muted-foreground">{t('dashboard.upcoming')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Image className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.backgrounds}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.backgrounds')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Presentation className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.slides}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.slides')}</div>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-1">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{churchStats.displays}</div>
                  <div className="text-xs text-muted-foreground">{t('nav.displays')}</div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Storage Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t('churchProfile.storage')}
            </CardTitle>
            <CardDescription>{t('churchProfile.storageBreakdown')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : storageStats ? (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="storage" className="border-none">
                  <AccordionTrigger className="hover:no-underline py-0">
                    <div className="flex-1 space-y-2 pr-4">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{t('churchProfile.totalStorage')}</span>
                        <span className="text-muted-foreground">
                          {formatBytes(storageStats.total)} / 1 GB ({Math.round((storageStats.total / (1024 * 1024 * 1024)) * 100)}%)
                        </span>
                      </div>
                      <Progress
                        value={Math.min((storageStats.total / (1024 * 1024 * 1024)) * 100, 100)}
                        className="h-2"
                      />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {storageStats.categories.length > 0 ? (
                      <div className="space-y-2 pt-4">
                        {storageStats.categories.map((category) => {
                          const Icon = category.icon

                          return (
                            <div key={category.name} className="flex items-center justify-between py-1">
                              <div className="flex items-center gap-3">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{t(`churchProfile.${category.name}`)}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{category.count} {category.count === 1 ? 'file' : 'files'}</span>
                                <span className="w-20 text-right">{formatBytes(category.size)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('churchProfile.noFiles')}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('churchProfile.subscription')}
            </CardTitle>
            <CardDescription>{t('churchProfile.plan')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">{t('churchProfile.freePlan')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('churchProfile.subscriptionComingSoon')}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone Card */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t('churchProfile.dangerZone')}
            </CardTitle>
            <CardDescription>
              {t('churchProfile.dangerZoneDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirmDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('churchProfile.deleteChurch')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t('churchProfile.deleteChurchTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>{t('churchProfile.deleteChurchWarning')}</p>
                <div className="bg-destructive/10 p-3 rounded-md text-sm">
                  <p className="font-medium mb-2">{t('churchProfile.deleteChurchWillDelete')}:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>{t('churchProfile.deleteItem.songs', { count: churchStats?.songs || 0 })}</li>
                    <li>{t('churchProfile.deleteItem.events', { count: churchStats?.totalEvents || 0 })}</li>
                    <li>{t('churchProfile.deleteItem.media')}</li>
                    <li>{t('churchProfile.deleteItem.members')}</li>
                    <li>{t('churchProfile.deleteItem.displays', { count: churchStats?.displays || 0 })}</li>
                    <li>{t('churchProfile.deleteItem.invitations')}</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-name">
                    {t('churchProfile.typeToConfirm', { name: currentChurch?.name })}
                  </Label>
                  <Input
                    id="confirm-name"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={currentChurch?.name}
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmName('')}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChurch}
              disabled={confirmName !== currentChurch?.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('churchProfile.deleteChurchConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deletion Progress Dialog */}
      <Dialog open={deletionState !== 'idle'}>
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {deletionState === 'deleting' && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t('churchProfile.deletingChurch')}
                </>
              )}
              {deletionState === 'error' && (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  {t('churchProfile.deleteError')}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {deletionProgress?.message}
            </DialogDescription>
          </DialogHeader>

          {deletionState === 'deleting' && deletionProgress?.totalFiles && (
            <div className="space-y-2">
              <Progress
                value={(deletionProgress.currentFile || 0) / deletionProgress.totalFiles * 100}
              />
              <p className="text-xs text-muted-foreground text-center">
                {deletionProgress.currentFile} / {deletionProgress.totalFiles} files
              </p>
            </div>
          )}

          {deletionState === 'error' && (
            <DialogFooter>
              <Button onClick={() => setDeletionState('idle')}>
                {t('common.ok')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
