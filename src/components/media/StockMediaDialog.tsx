import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Download, Loader2, Image, Video, Eye, X } from 'lucide-react'
import { toast } from 'sonner'
import { useChurch } from '@/contexts/ChurchContext'
import { searchStockMedia, importStockMedia } from '@/services/media'
import type { StockMediaItem } from '@/types/media'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface StockMediaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function StockMediaDialog({
  open,
  onOpenChange,
  onSuccess,
}: StockMediaDialogProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()

  const [provider, setProvider] = useState<'pexels' | 'unsplash' | 'pixabay'>('pexels')
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockMediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<StockMediaItem | null>(null)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset state when dialog closes
      setQuery('')
      setResults([])
      setPreviewItem(null)
    }
    onOpenChange(isOpen)
  }

  const handleSearch = async () => {
    if (!query.trim()) return

    // Unsplash doesn't support video
    const searchType = provider === 'unsplash' ? 'image' : mediaType

    setLoading(true)
    setResults([])

    try {
      const response = await searchStockMedia(provider, query.trim(), { type: searchType })
      setResults(response.results)
    } catch (error) {
      console.error('Stock media search failed:', error)
      toast.error(t('media.stockSearchError'))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleImport = async (item: StockMediaItem) => {
    if (!currentChurch) {
      toast.error(t('common.noChurchSelected'))
      return
    }

    setImporting(item.id)

    try {
      await importStockMedia(currentChurch.id, item)
      toast.success(t('media.importSuccess'))
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error('Stock media import failed:', error)
      toast.error(t('media.importError'))
    } finally {
      setImporting(null)
    }
  }

  const handleProviderChange = (value: string) => {
    const newProvider = value as 'pexels' | 'unsplash' | 'pixabay'
    setProvider(newProvider)
    setResults([])
    // Reset to image when switching to Unsplash (no video support)
    if (newProvider === 'unsplash' && mediaType === 'video') {
      setMediaType('image')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('media.stockMedia')}</DialogTitle>
          <DialogDescription>
            {t('media.stockMediaDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={provider} onValueChange={handleProviderChange}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pexels">Pexels</TabsTrigger>
            <TabsTrigger value="unsplash">Unsplash</TabsTrigger>
            <TabsTrigger value="pixabay">Pixabay</TabsTrigger>
          </TabsList>

          <TabsContent value={provider} className="mt-4 flex flex-col gap-4">
            {/* Search input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('media.searchStockPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
              </div>
              <ToggleGroup
                type="single"
                value={mediaType}
                onValueChange={(value) => value && setMediaType(value as 'image' | 'video')}
                disabled={provider === 'unsplash'}
              >
                <ToggleGroupItem value="image" aria-label="Search images" title={t('media.images')}>
                  <Image className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="video" aria-label="Search videos" title={t('media.videos')}>
                  <Video className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <Button onClick={handleSearch} disabled={loading || !query.trim()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('common.search')
                )}
              </Button>
            </div>

            {/* Results grid */}
            <div className="overflow-y-auto max-h-[50vh]">
              {loading ? (
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-video rounded-lg" />
                  ))}
                </div>
              ) : results.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {results.map((item) => (
                    <div
                      key={item.id}
                      className="group relative aspect-video rounded-lg overflow-hidden bg-muted"
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt={item.attribution}
                        className="absolute inset-0 w-full h-full object-cover"
                      />

                      {/* Hover overlay with preview and import buttons */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setPreviewItem(item)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          {t('media.preview')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleImport(item)}
                          disabled={importing === item.id}
                        >
                          {importing === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          {t('common.import')}
                        </Button>
                      </div>

                      {/* Attribution text */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                        <p className="text-white text-xs truncate">
                          {item.attribution}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : query && !loading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('media.noResults')}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {t('media.searchStockPrompt')}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Preview Modal */}
        {previewItem && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPreviewItem(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh] w-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-12 right-0 text-white hover:bg-white/20"
                onClick={() => setPreviewItem(null)}
              >
                <X className="h-6 w-6" />
              </Button>

              {mediaType === 'video' ? (
                <video
                  src={previewItem.previewUrl}
                  controls
                  autoPlay
                  className="w-full max-h-[80vh] rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <img
                  src={previewItem.previewUrl}
                  alt={previewItem.attribution}
                  className="w-full max-h-[80vh] object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              )}

              <div className="mt-4 flex items-center justify-between">
                <p className="text-white text-sm">{previewItem.attribution}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPreviewItem(null)
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleImport(previewItem)
                    }}
                    disabled={importing === previewItem.id}
                  >
                    {importing === previewItem.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    {t('common.import')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
