import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, Music, ExternalLink, Download, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useChurch } from '@/contexts/ChurchContext'
import {
  searchGeniusSongs,
  getGeniusLyrics,
  createSong,
  type GeniusSong,
} from '@/services/songs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

interface GeniusSongSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

type ViewState = 'search' | 'preview'

export function GeniusSongSearch({
  open,
  onOpenChange,
  onSuccess,
}: GeniusSongSearchProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentChurch } = useChurch()

  const [view, setView] = useState<ViewState>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeniusSong[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSong, setSelectedSong] = useState<GeniusSong | null>(null)
  const [lyrics, setLyrics] = useState<string | null>(null)
  const [loadingLyrics, setLoadingLyrics] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset state when dialog closes
      setView('search')
      setQuery('')
      setResults([])
      setSelectedSong(null)
      setLyrics(null)
    }
    onOpenChange(isOpen)
  }

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    setResults([])

    try {
      const response = await searchGeniusSongs(query.trim())
      setResults(response.results)
    } catch (error) {
      console.error('Genius search failed:', error)
      toast.error(t('songs.genius.searchError'))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleSelectSong = async (song: GeniusSong) => {
    setSelectedSong(song)
    setView('preview')
    setLoadingLyrics(true)
    setLyrics(null)

    try {
      const response = await getGeniusLyrics(song.title, song.artist)
      setLyrics(response.lyrics)
    } catch (error) {
      console.error('Failed to fetch lyrics:', error)
      toast.error(t('songs.genius.lyricsError'))
    } finally {
      setLoadingLyrics(false)
    }
  }

  const handleBack = () => {
    setView('search')
    setSelectedSong(null)
    setLyrics(null)
  }

  const handleImport = async () => {
    if (!currentChurch || !selectedSong) {
      toast.error(t('common.noChurchSelected'))
      return
    }

    setImporting(true)

    try {
      // Convert lyrics to song markdown format
      const content = formatLyricsAsMarkdown(selectedSong, lyrics)

      const newSong = await createSong(currentChurch.id, {
        title: selectedSong.title,
        author: selectedSong.artist,
        content,
      })

      toast.success(t('songs.songCreated'))
      onSuccess?.()
      handleOpenChange(false)

      // Navigate to edit the new song so user can organize sections
      navigate(`/songs/${newSong.id}/edit`)
    } catch (error) {
      console.error('Failed to import song:', error)
      toast.error(t('songs.genius.importError'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === 'preview' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -ml-2"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {view === 'search' ? t('songs.genius.title') : selectedSong?.title}
          </DialogTitle>
          <DialogDescription>
            {view === 'search'
              ? t('songs.genius.description')
              : selectedSong?.artist}
          </DialogDescription>
        </DialogHeader>

        {view === 'search' ? (
          <>
            {/* Search input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('songs.genius.searchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                  autoFocus
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

            {/* Results list */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-1">
                  {results.map((song) => (
                    <button
                      key={song.id}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                      onClick={() => handleSelectSong(song)}
                    >
                      {song.albumArt ? (
                        <img
                          src={song.albumArt}
                          alt=""
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                          <Music className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{song.title}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {song.artist}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : query && !loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Music className="h-12 w-12 mb-4" />
                  <p>{t('songs.genius.noResults')}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Search className="h-12 w-12 mb-4" />
                  <p>{t('songs.genius.searchPrompt')}</p>
                </div>
              )}
            </ScrollArea>

            {/* Attribution */}
            <div className="pt-2 border-t text-xs text-muted-foreground text-center">
              {t('songs.genius.poweredBy')}{' '}
              <a
                href="https://genius.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Genius
              </a>
            </div>
          </>
        ) : (
          <>
            {/* Lyrics preview */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              {loadingLyrics ? (
                <div className="space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              ) : lyrics ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {lyrics}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Music className="h-12 w-12 mb-4" />
                  <p>{t('songs.genius.noLyrics')}</p>
                  <a
                    href={selectedSong?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-sm underline hover:text-foreground flex items-center gap-1"
                  >
                    {t('songs.genius.viewOnGenius')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </ScrollArea>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <a
                href={selectedSong?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground underline hover:text-foreground flex items-center gap-1"
              >
                {t('songs.genius.viewOnGenius')}
                <ExternalLink className="h-3 w-3" />
              </a>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBack}>
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || !lyrics}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {t('songs.genius.import')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Convert raw lyrics to song markdown format.
 * Attempts to detect sections or just wraps as a single verse.
 */
function formatLyricsAsMarkdown(song: GeniusSong, lyrics: string | null): string {
  const frontmatter = `---
title: ${escapeYaml(song.title)}
author: ${escapeYaml(song.artist)}
---`

  if (!lyrics) {
    return `${frontmatter}

# Verse 1
(No lyrics available - add your lyrics here)
`
  }

  // Try to detect sections in the lyrics
  // Common patterns: [Verse 1], [Chorus], (Verse 1), **Verse 1**, etc.
  const sectionPattern = /^\s*[\[(]?\s*(Verse|Chorus|Bridge|Pre-Chorus|Intro|Outro|Hook|Refrain|Tag|Interlude)[\s\d]*[\])]?\s*$/i

  const lines = lyrics.split('\n')
  const sections: { label: string; lines: string[] }[] = []
  let currentSection: { label: string; lines: string[] } | null = null
  let verseCount = 0

  for (const line of lines) {
    const sectionMatch = line.match(sectionPattern)

    if (sectionMatch) {
      // Save current section
      if (currentSection && currentSection.lines.length > 0) {
        sections.push(currentSection)
      }

      const sectionType = sectionMatch[1].toLowerCase()
      let label = sectionMatch[0].trim().replace(/[\[\]()]/g, '')

      // Normalize common section names
      if (sectionType === 'verse') {
        verseCount++
        if (!label.match(/\d/)) {
          label = `Verse ${verseCount}`
        }
      }

      currentSection = { label, lines: [] }
    } else if (line.trim()) {
      // Non-empty line
      if (!currentSection) {
        verseCount++
        currentSection = { label: `Verse ${verseCount}`, lines: [] }
      }
      currentSection.lines.push(line)
    } else if (currentSection && currentSection.lines.length > 0) {
      // Empty line - might indicate section break if we have content
      // Check if next non-empty line looks like a new section start
      currentSection.lines.push('')
    }
  }

  // Don't forget the last section
  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection)
  }

  // If no sections detected, create a single verse
  if (sections.length === 0) {
    return `${frontmatter}

# Verse 1
${lyrics.trim()}
`
  }

  // Build markdown with sections
  let content = frontmatter + '\n'

  for (const section of sections) {
    content += `\n# ${section.label}\n`
    content += section.lines.join('\n').trim() + '\n'
  }

  return content
}

function escapeYaml(str: string): string {
  // Escape special YAML characters
  if (str.includes(':') || str.includes('#') || str.includes("'") || str.includes('"')) {
    return `"${str.replace(/"/g, '\\"')}"`
  }
  return str
}
