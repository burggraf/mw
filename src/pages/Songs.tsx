import { useState, useEffect, useCallback } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Search, MoreHorizontal, Pencil, Copy, Trash2, Music, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { GeniusSongSearch } from '@/components/songs/GeniusSongSearch'
import type { SongFolder, SongFolderInput } from '@/types/folder'
import {
  getSongFolders,
  createSongFolder,
  updateSongFolder,
  deleteSongFolder,
  bulkMoveToFolder,
  bulkDeleteSongs,
} from '@/services/songFolders'
import { SongFolderDialog } from '@/components/songs/SongFolderDialog'
import { SongBulkActionBar } from '@/components/songs/SongBulkActionBar'

export function SongsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentChurch } = useChurch()

  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [songToDelete, setSongToDelete] = useState<Song | null>(null)
  const [showGeniusSearch, setShowGeniusSearch] = useState(false)
  const [folders, setFolders] = useState<SongFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set())
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<SongFolder | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [moveSongIdsOnCreate, setMoveSongIdsOnCreate] = useState<string[]>([])

  useEffect(() => {
    if (currentChurch) {
      loadSongs()
      loadFolders()
    }
  }, [currentChurch, loadSongs, loadFolders])

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
  }, [searchQuery, currentChurch, loadSongs])

  const loadSongs = useCallback(async () => {
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
  }, [currentChurch, t])

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

  const loadFolders = useCallback(async () => {
    if (!currentChurch) return

    try {
      const data = await getSongFolders(currentChurch.id)
      setFolders(data)
    } catch (error) {
      console.error('Failed to load folders:', error)
    }
  }, [currentChurch])

  const handleFolderSaved = useCallback(async (input: SongFolderInput) => {
    if (!currentChurch) return

    try {
      if (editingFolder) {
        await updateSongFolder(editingFolder.id, input)
        toast.success(t('songs.folderUpdated'))
      } else {
        const newFolder = await createSongFolder(currentChurch.id, input)
        toast.success(t('songs.folderCreated'))

        // Move selected songs to the newly created folder
        if (moveSongIdsOnCreate.length > 0) {
          await bulkMoveToFolder(moveSongIdsOnCreate, newFolder.id)
          setSelectedSongIds(new Set())
          setMoveSongIdsOnCreate([])
          toast.success(t('songs.bulkMoveSuccess', { count: moveSongIdsOnCreate.length }))
        }
      }
      await loadFolders()
      await loadSongs()
    } catch (error) {
      console.error('Failed to save folder:', error)
      toast.error(t('common.error'))
    }
  }, [currentChurch, editingFolder, loadFolders, loadSongs, t, moveSongIdsOnCreate])

  async function handleDeleteFolder(folder: SongFolder) {
    if (!currentChurch) return

    if (confirm(t('songs.deleteFolderWarning', { name: folder.name }))) {
      try {
        setIsProcessing(true)
        await deleteSongFolder(folder.id)
        if (selectedFolderId === folder.id) {
          setSelectedFolderId(null)
        }
        await loadFolders()
        await loadSongs()
        toast.success(t('songs.folderDeleted'))
      } catch (error) {
        console.error('Failed to delete folder:', error)
        toast.error(t('common.error'))
      } finally {
        setIsProcessing(false)
      }
    }
  }

  async function handleBulkMoveToFolder(folderId: string | null) {
    if (!currentChurch) return

    try {
      setIsProcessing(true)
      const count = selectedSongIds.size
      await bulkMoveToFolder(Array.from(selectedSongIds), folderId)
      setSelectedSongIds(new Set())
      await loadSongs()
      toast.success(t('songs.bulkMoveSuccess', { count }))
    } catch (error) {
      console.error('Failed to move songs:', error)
      toast.error(t('common.error'))
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleBulkRemoveFromFolder() {
    if (!currentChurch) return

    try {
      setIsProcessing(true)
      const count = selectedSongIds.size
      await bulkMoveToFolder(Array.from(selectedSongIds), null)
      setSelectedSongIds(new Set())
      await loadSongs()
      toast.success(t('songs.bulkRemoveSuccess', { count }))
    } catch (error) {
      console.error('Failed to remove songs from folder:', error)
      toast.error(t('common.error'))
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleBulkDelete() {
    try {
      setIsProcessing(true)
      const count = selectedSongIds.size
      await bulkDeleteSongs(Array.from(selectedSongIds))
      setSelectedSongIds(new Set())
      await loadSongs()
      toast.success(t('songs.bulkDeleteSuccess', { count }))
    } catch (error) {
      console.error('Failed to delete songs:', error)
      toast.error(t('common.error'))
    } finally {
      setIsProcessing(false)
    }
  }

  if (!currentChurch) {
    return null
  }

  // Filter songs by selected folder
  const filteredSongs = songs.filter((song) => {
    // Apply folder filter
    if (selectedFolderId === null) {
      // Show songs not in any folder
      return !song.folderId
    }
    return song.folderId === selectedFolderId
  })

  return (
    <div className="flex gap-6 p-4 md:p-8 min-h-screen">
      {/* Sidebar - Folder Navigation */}
      {folders.length > 0 && (
        <div className="w-64 flex-shrink-0">
          <div className="sticky top-8 border rounded-lg bg-muted/10 p-4">
            <h3 className="font-semibold mb-3">{t('songs.folders')}</h3>
            <div className="space-y-1">
              <Button
                variant={selectedFolderId === null ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setSelectedFolderId(null)}
              >
                {t('songs.allSongs')}
              </Button>
              {folders.map((folder) => (
                <div key={folder.id} className="group flex items-center gap-1">
                  <Button
                    variant={selectedFolderId === folder.id ? 'secondary' : 'ghost'}
                    className="flex-1 justify-start"
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    {folder.name}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingFolder(folder)
                          setFolderDialogOpen(true)
                        }}
                      >
                        {t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDeleteFolder(folder)}
                      >
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={() => {
                  setEditingFolder(null)
                  setFolderDialogOpen(true)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('songs.folder.createFolder')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">{t('songs.title')}</h1>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => setShowGeniusSearch(true)}
              className="flex-1 sm:flex-initial"
            >
              <Globe className="h-4 w-4 mr-2" />
              {t('songs.webSearch')}
            </Button>
            <Button onClick={() => navigate('/songs/new')} className="flex-1 sm:flex-initial">
              <Plus className="h-4 w-4 mr-2" />
              {t('songs.newSong')}
            </Button>
          </div>
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
        ) : filteredSongs.length === 0 ? (
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
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        selectedSongIds.size === filteredSongs.length && filteredSongs.length > 0
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSongIds(new Set(filteredSongs.map((s) => s.id)))
                        } else {
                          setSelectedSongIds(new Set())
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead className="min-w-[150px]">{t('songs.form.title')}</TableHead>
                  <TableHead className="min-w-[120px] hidden sm:table-cell">
                    {t('songs.form.author')}
                  </TableHead>
                  <TableHead className="min-w-[100px] hidden md:table-cell">
                    {t('songs.form.ccliNumber')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSongs.map((song) => (
                  <TableRow
                    key={song.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/songs/${song.id}`)}
                  >
                    <TableCell className="w-[50px]" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedSongIds.has(song.id)}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedSongIds)
                          if (checked) {
                            newSelected.add(song.id)
                          } else {
                            newSelected.delete(song.id)
                          }
                          setSelectedSongIds(newSelected)
                        }}
                      />
                    </TableCell>
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
      </div>

      {/* Bulk Action Bar */}
      {selectedSongIds.size > 0 && (
        <SongBulkActionBar
          selectedCount={selectedSongIds.size}
          onClear={() => setSelectedSongIds(new Set())}
          folders={folders}
          currentFolderId={selectedFolderId}
          onMoveToFolder={handleBulkMoveToFolder}
          onCreateNewFolder={() => {
            setMoveSongIdsOnCreate(Array.from(selectedSongIds))
            setEditingFolder(null)
            setFolderDialogOpen(true)
          }}
          onRemoveFromFolder={handleBulkRemoveFromFolder}
          onDelete={handleBulkDelete}
          isProcessing={isProcessing}
        />
      )}

      {/* Folder Dialog */}
      <SongFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onSave={handleFolderSaved}
        folder={editingFolder}
      />

      {/* Delete Song Dialog */}
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

      {/* Genius Search Dialog */}
      <GeniusSongSearch
        open={showGeniusSearch}
        onOpenChange={setShowGeniusSearch}
        onSuccess={loadSongs}
      />
    </div>
  )
}
