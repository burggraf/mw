import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { getSong, deleteSong } from '@/services/songs'
import { parseSong } from '@/lib/song-parser'
import type { Song } from '@/types/song'
import type { SongSection } from '@/lib/song-parser'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { duplicateSong } from '@/services/songs'

export function SongDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()

  const [song, setSong] = useState<Song | null>(null)
  const [sections, setSections] = useState<SongSection[]>([])
  const [loading, setLoading] = useState(true)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)

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
      setSections(parsed.sections)
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

  function goToPreviousSection() {
    setCurrentSectionIndex((prev) => Math.max(0, prev - 1))
  }

  function goToNextSection() {
    setCurrentSectionIndex((prev) => Math.min(sections.length - 1, prev + 1))
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

  const currentSection = sections[currentSectionIndex]

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

      {/* Section navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        {sections.map((section, index) => (
          <Button
            key={section.id}
            variant={index === currentSectionIndex ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCurrentSectionIndex(index)}
          >
            {section.label}
          </Button>
        ))}
      </div>

      {/* Current section display */}
      {currentSection && (
        <Card className="relative">
          <CardContent className="py-12 px-8">
            <p className="text-xs text-muted-foreground mb-6 uppercase tracking-wide text-center">
              {currentSection.label}
            </p>
            <div className="text-2xl text-center whitespace-pre-line leading-relaxed max-w-2xl mx-auto">
              {currentSection.content}
            </div>
          </CardContent>

          {/* Navigation arrows */}
          <div className="absolute inset-y-0 left-0 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none rounded-l-lg"
              onClick={goToPreviousSection}
              disabled={currentSectionIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-none rounded-r-lg"
              onClick={goToNextSection}
              disabled={currentSectionIndex === sections.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </Card>
      )}

      {/* Section count */}
      <p className="text-center text-sm text-muted-foreground mt-4">
        {currentSectionIndex + 1} / {sections.length}
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
