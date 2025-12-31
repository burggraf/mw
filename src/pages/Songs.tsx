import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useChurch } from '@/contexts/ChurchContext'
import { getSongs, deleteSong, duplicateSong, searchSongs } from '@/services/songs'
import type { Song } from '@/types/song'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Search, MoreHorizontal, Pencil, Copy, Trash2, Music } from 'lucide-react'
import { toast } from 'sonner'

export function SongsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentChurch } = useChurch()

  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [songToDelete, setSongToDelete] = useState<Song | null>(null)

  useEffect(() => {
    if (currentChurch) {
      loadSongs()
    }
  }, [currentChurch])

  useEffect(() => {
    if (!currentChurch) return

    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchSongs(currentChurch.id, searchQuery)
          .then(setSongs)
          .catch(console.error)
      } else {
        loadSongs()
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, currentChurch])

  async function loadSongs() {
    if (!currentChurch) return

    try {
      setLoading(true)
      const data = await getSongs(currentChurch.id)
      setSongs(data)
    } catch (error) {
      console.error('Failed to load songs:', error)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!songToDelete) return

    try {
      await deleteSong(songToDelete.id)
      setSongs(songs.filter((s) => s.id !== songToDelete.id))
      toast.success(t('songs.songDeleted'))
    } catch (error) {
      console.error('Failed to delete song:', error)
      toast.error(t('common.error'))
    } finally {
      setSongToDelete(null)
    }
  }

  async function handleDuplicate(song: Song) {
    try {
      const newSong = await duplicateSong(song.id)
      setSongs([...songs, newSong].sort((a, b) => a.title.localeCompare(b.title)))
      toast.success(t('songs.songDuplicated'))
    } catch (error) {
      console.error('Failed to duplicate song:', error)
      toast.error(t('common.error'))
    }
  }

  if (!currentChurch) {
    return null
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('songs.title')}</h1>
        <Button onClick={() => navigate('/songs/new')} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          {t('songs.newSong')}
        </Button>
      </div>

      <div className="relative mb-4 md:mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('songs.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </CardContent>
        </Card>
      ) : songs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Music className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('songs.noSongs')}</h3>
            <p className="text-muted-foreground mb-4">{t('songs.noSongsDescription')}</p>
            <Button onClick={() => navigate('/songs/new')}>
              <Plus className="h-4 w-4 mr-2" />
              {t('songs.newSong')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">{t('songs.form.title')}</TableHead>
                <TableHead className="min-w-[120px] hidden sm:table-cell">{t('songs.form.author')}</TableHead>
                <TableHead className="min-w-[100px] hidden md:table-cell">{t('songs.form.ccliNumber')}</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {songs.map((song) => (
                <TableRow
                  key={song.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/songs/${song.id}`)}
                >
                  <TableCell className="font-medium">
                    <div>{song.title}</div>
                    <div className="text-sm text-muted-foreground sm:hidden">
                      {song.author || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {song.author || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {song.ccliNumber || '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/songs/${song.id}/edit`)
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicate(song)
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {t('songs.duplicateSong')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSongToDelete(song)
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!songToDelete} onOpenChange={() => setSongToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('songs.deleteSong')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('songs.confirmDelete')}
              <br />
              <span className="font-medium">{songToDelete?.title}</span>
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
