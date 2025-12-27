import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Download, Loader2 } from 'lucide-react'
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

  const [provider, setProvider] = useState<'pexels' | 'unsplash'>('pexels')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockMediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    setResults([])

    try {
      const response = await searchStockMedia(provider, query.trim())
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
    setProvider(value as 'pexels' | 'unsplash')
    setResults([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('media.stockMedia')}</DialogTitle>
          <DialogDescription>
            {t('media.stockMediaDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={provider} onValueChange={handleProviderChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pexels">Pexels</TabsTrigger>
            <TabsTrigger value="unsplash">Unsplash</TabsTrigger>
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
              <Button onClick={handleSearch} disabled={loading || !query.trim()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('common.search')
                )}
              </Button>
            </div>

            {/* Results grid */}
            <div className="flex-1 overflow-y-auto min-h-[300px]">
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

                      {/* Hover overlay with import button */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
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
      </DialogContent>
    </Dialog>
  )
}
