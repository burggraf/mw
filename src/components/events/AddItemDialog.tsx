import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getSongs } from '@/services/songs'
import { getMedia } from '@/services/media'
import type { Song } from '@/types/song'
import type { Media } from '@/types/media'
import type { EventItemType } from '@/types/event'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Plus, Music, Image } from 'lucide-react'
import { toast } from 'sonner'

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (itemType: EventItemType, itemId: string) => Promise<void>
}

export function AddItemDialog({ open, onOpenChange, onAdd }: AddItemDialogProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [tab, setTab] = useState<'songs' | 'media'>('songs')
  const [songs, setSongs] = useState<Song[]>([])
  const [media, setMedia] = useState<Media[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    if (open && currentChurch) {
      loadContent()
    }
  }, [open, currentChurch])

  async function loadContent() {
    if (!currentChurch) return
    setLoading(true)
    try {
      const [songsData, mediaData] = await Promise.all([
        getSongs(currentChurch.id),
        getMedia(currentChurch.id, { type: 'image' }),
      ])
      setSongs(songsData)
      // Filter out solid color backgrounds
      setMedia(mediaData.filter(m => !m.backgroundColor))
    } catch (error) {
      console.error('Failed to load content:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(itemType: EventItemType, itemId: string) {
    setAdding(itemId)
    try {
      await onAdd(itemType, itemId)
      toast.success(t('events.itemAdded'))
    } catch (error) {
      console.error('Failed to add item:', error)
      toast.error(t('common.error'))
    } finally {
      setAdding(null)
    }
  }

  const filteredSongs = songs.filter(song =>
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (song.author?.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const filteredMedia = media.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('events.addItem')}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'songs' | 'media')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="songs" className="gap-2">
              <Music className="h-4 w-4" />
              {t('events.songs')}
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-2">
              <Image className="h-4 w-4" />
              {t('events.media')}
            </TabsTrigger>
          </TabsList>

          <div className="relative my-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tab === 'songs' ? t('events.searchSongs') : t('events.searchMedia')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="h-[300px]">
            <TabsContent value="songs" className="mt-0">
              {loading ? (
                <div className="text-center text-muted-foreground py-8">Loading...</div>
              ) : filteredSongs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {t('media.noResults')}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredSongs.map((song) => (
                    <div
                      key={song.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{song.title}</div>
                        {song.author && (
                          <div className="text-sm text-muted-foreground truncate">
                            {song.author}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAdd('song', song.id)}
                        disabled={adding === song.id}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="media" className="mt-0">
              {loading ? (
                <div className="text-center text-muted-foreground py-8">Loading...</div>
              ) : filteredMedia.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {t('media.noResults')}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {filteredMedia.map((m) => (
                    <button
                      key={m.id}
                      className="relative aspect-video rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary"
                      onClick={() => handleAdd('media', m.id)}
                      disabled={adding === m.id}
                    >
                      <img
                        src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/media/${m.thumbnailPath || m.storagePath}`}
                        alt={m.name}
                        className="w-full h-full object-cover"
                      />
                      {adding === m.id && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
