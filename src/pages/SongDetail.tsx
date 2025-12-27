import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { getSong, deleteSong } from '@/services/songs'
import { parseSong } from '@/lib/song-parser'
import { chunkSections, getShortLabel } from '@/services/chunking'
import { getMediaWithStyle } from '@/services/media'
import { styleToBoundingBoxCSS, styleToTextCSS, styleToOverlayCSS } from '@/services/styles'
import type { Song } from '@/types/song'
import type { Slide, DisplayClass } from '@/types/style'
import type { Media } from '@/types/media'
import type { Style } from '@/types/style'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Monitor,
  DoorOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { duplicateSong } from '@/services/songs'

export function SongDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()

  const [song, setSong] = useState<Song | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [backgrounds, setBackgrounds] = useState<{
    audience: (Media & { style: Style | null }) | null
    stage: (Media & { style: Style | null }) | null
    lobby: (Media & { style: Style | null }) | null
  }>({ audience: null, stage: null, lobby: null })
  const [loading, setLoading] = useState(true)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [displayClass, setDisplayClass] = useState<DisplayClass>('audience')

  useEffect(() => {
    if (id) {
      loadSong(id)
    }
  }, [id])

  async function loadSong(songId: string) {
    try {
      setLoading(true)
      const data = await getSong(songId)
      if (!data) {
        toast.error(t('common.error'))
        navigate('/songs')
        return
      }
      setSong(data)
      const parsed = parseSong(data.content)

      // Load backgrounds with their styles
      const [audienceBg, stageBg, lobbyBg] = await Promise.all([
        data.audienceBackgroundId ? getMediaWithStyle(data.audienceBackgroundId) : null,
        data.stageBackgroundId ? getMediaWithStyle(data.stageBackgroundId) : null,
        data.lobbyBackgroundId ? getMediaWithStyle(data.lobbyBackgroundId) : null,
      ])

      setBackgrounds({ audience: audienceBg, stage: stageBg, lobby: lobbyBg })

      // Chunk sections based on backgrounds
      const activeBackgrounds = [audienceBg, stageBg, lobbyBg].filter(Boolean) as (Media & { style: Style | null })[]
      const chunkedSlides = chunkSections(parsed.sections, activeBackgrounds)
      setSlides(chunkedSlides)
    } catch (error) {
      console.error('Failed to load song:', error)
      toast.error(t('common.error'))
      navigate('/songs')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!song) return

    try {
      await deleteSong(song.id)
      toast.success(t('songs.songDeleted'))
      navigate('/songs')
    } catch (error) {
      console.error('Failed to delete song:', error)
      toast.error(t('common.error'))
    }
  }

  async function handleDuplicate() {
    if (!song) return

    try {
      const newSong = await duplicateSong(song.id)
      toast.success(t('songs.songDuplicated'))
      navigate(`/songs/${newSong.id}/edit`)
    } catch (error) {
      console.error('Failed to duplicate song:', error)
      toast.error(t('common.error'))
    }
  }

  function goToPreviousSlide() {
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1))
  }

  function goToNextSlide() {
    setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1))
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    )
  }

  if (!song) {
    return null
  }

  const currentSlide = slides[currentSlideIndex]
  const currentBackground = backgrounds[displayClass]
  const currentStyle = currentBackground?.style

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/songs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{song.title}</h1>
            {song.author && (
              <p className="text-muted-foreground">{song.author}</p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/songs/${song.id}/edit`)}>
              <Pencil className="h-4 w-4 mr-2" />
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              {t('songs.duplicateSong')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Song metadata */}
      {(song.copyrightInfo || song.ccliNumber) && (
        <div className="flex gap-6 text-sm text-muted-foreground mb-8">
          {song.copyrightInfo && <span>{song.copyrightInfo}</span>}
          {song.ccliNumber && <span>CCLI: {song.ccliNumber}</span>}
        </div>
      )}

      {/* Display class toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-wrap gap-2">
          {slides.map((slide, index) => (
            <Button
              key={`${slide.sectionId}-${slide.subIndex}`}
              variant={index === currentSlideIndex ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentSlideIndex(index)}
            >
              {getShortLabel(slide)}
            </Button>
          ))}
        </div>

        <ToggleGroup
          type="single"
          value={displayClass}
          onValueChange={(value: string) => value && setDisplayClass(value as DisplayClass)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="audience" aria-label={t('styles.displayClass.audience')}>
                <Users className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{t('styles.displayClass.audience')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="stage" aria-label={t('styles.displayClass.stage')}>
                <Monitor className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{t('styles.displayClass.stage')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="lobby" aria-label={t('styles.displayClass.lobby')}>
                <DoorOpen className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{t('styles.displayClass.lobby')}</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>

      {/* Current slide display with style */}
      {currentSlide && currentStyle && (
        <div
          className="relative rounded-lg overflow-hidden min-h-[300px]"
          style={{
            backgroundColor: currentBackground?.backgroundColor || '#1a1a1a',
            backgroundImage: currentBackground?.storagePath
              ? `url(${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/media/${currentBackground.storagePath})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Background overlay */}
          <div className="absolute inset-0" style={styleToOverlayCSS(currentStyle)} />

          {/* Content in bounding box */}
          <div style={styleToBoundingBoxCSS(currentStyle)}>
            {/* Section label */}
            {currentStyle.showSectionLabel && (
              <p
                className="mb-4 uppercase tracking-wider opacity-70 text-sm"
                style={styleToTextCSS(currentStyle)}
              >
                {currentSlide.displayLabel}
              </p>
            )}

            {/* Lyrics */}
            <div className="whitespace-pre-line" style={styleToTextCSS(currentStyle)}>
              {currentSlide.lines.join('\n')}
            </div>

            {/* Copyright */}
            {currentStyle.showCopyright && song.copyrightInfo && (
              <p
                className="mt-6 opacity-50 text-xs"
                style={styleToTextCSS(currentStyle)}
              >
                {song.copyrightInfo}
              </p>
            )}
          </div>

          {/* Navigation arrows */}
          <div className="absolute inset-y-0 left-0 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none rounded-l-lg text-white/70 hover:text-white hover:bg-white/10"
              onClick={goToPreviousSlide}
              disabled={currentSlideIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none rounded-r-lg text-white/70 hover:text-white hover:bg-white/10"
              onClick={goToNextSlide}
              disabled={currentSlideIndex === slides.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}

      {/* Fallback for no style */}
      {currentSlide && !currentStyle && (
        <div className="relative rounded-lg overflow-hidden min-h-[300px] bg-slate-800 flex items-center justify-center">
          <div className="text-white text-center whitespace-pre-line p-8">
            {currentSlide.lines.join('\n')}
          </div>

          {/* Navigation arrows */}
          <div className="absolute inset-y-0 left-0 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none rounded-l-lg text-white/70 hover:text-white hover:bg-white/10"
              onClick={goToPreviousSlide}
              disabled={currentSlideIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none rounded-r-lg text-white/70 hover:text-white hover:bg-white/10"
              onClick={goToNextSlide}
              disabled={currentSlideIndex === slides.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}

      {/* Slide count */}
      <p className="text-center text-sm text-muted-foreground mt-4">
        {currentSlideIndex + 1} / {slides.length}
      </p>

      {/* Delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('songs.deleteSong')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('songs.confirmDelete')}
              <br />
              <span className="font-medium">{song.title}</span>
              <br />
              <br />
              {t('songs.deleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
