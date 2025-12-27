import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useChurch } from '@/contexts/ChurchContext'
import { getSong, createSong, updateSong } from '@/services/songs'
import { parseSong, buildMarkdownFromParts, extractLyricsContent } from '@/lib/song-parser'
import type { SongMetadata } from '@/lib/song-parser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, Eye } from 'lucide-react'
import { toast } from 'sonner'

export function SongEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { currentChurch } = useChurch()

  const isNew = !id || id === 'new'

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)

  // Form fields
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [copyright, setCopyright] = useState('')
  const [ccliNumber, setCcliNumber] = useState('')
  const [lyrics, setLyrics] = useState('')

  useEffect(() => {
    if (!isNew && id) {
      loadSong(id)
    }
  }, [id, isNew])

  // Handle lyrics change - detect and extract frontmatter if present
  function handleLyricsChange(value: string) {
    // Check if input contains frontmatter (starts with ---)
    const frontmatterMatch = value.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)

    if (frontmatterMatch) {
      // Parse frontmatter and extract metadata
      const parsed = parseSong(value)

      // Update form fields if metadata exists
      if (parsed.metadata.title && parsed.metadata.title !== 'Untitled') {
        setTitle(parsed.metadata.title)
      }
      if (parsed.metadata.author) {
        setAuthor(parsed.metadata.author)
      }
      if (parsed.metadata.copyright) {
        setCopyright(parsed.metadata.copyright)
      }
      if (parsed.metadata.ccliNumber) {
        setCcliNumber(parsed.metadata.ccliNumber)
      }

      // Set lyrics to just the content (without frontmatter)
      setLyrics(extractLyricsContent(value))
    } else {
      // No frontmatter, just set lyrics as-is
      setLyrics(value)
    }
  }

  async function loadSong(songId: string) {
    try {
      setLoading(true)
      const song = await getSong(songId)
      if (!song) {
        toast.error(t('common.error'))
        navigate('/songs')
        return
      }

      setTitle(song.title)
      setAuthor(song.author || '')
      setCopyright(song.copyrightInfo || '')
      setCcliNumber(song.ccliNumber || '')
      setLyrics(extractLyricsContent(song.content))
    } catch (error) {
      console.error('Failed to load song:', error)
      toast.error(t('common.error'))
      navigate('/songs')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!currentChurch) return

    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    if (!lyrics.trim()) {
      toast.error('Lyrics are required')
      return
    }

    try {
      setSaving(true)

      const metadata: SongMetadata = {
        title: title.trim(),
        author: author.trim() || undefined,
        copyright: copyright.trim() || undefined,
        ccliNumber: ccliNumber.trim() || undefined,
      }

      const content = buildMarkdownFromParts(metadata, lyrics.trim())

      if (isNew) {
        await createSong(currentChurch.id, {
          title: metadata.title,
          author: metadata.author,
          copyrightInfo: metadata.copyright,
          ccliNumber: metadata.ccliNumber,
          content,
        })
        toast.success(t('songs.songCreated'))
      } else if (id) {
        await updateSong(id, {
          title: metadata.title,
          author: metadata.author,
          copyrightInfo: metadata.copyright,
          ccliNumber: metadata.ccliNumber,
          content,
        })
        toast.success(t('songs.songUpdated'))
      }

      navigate('/songs')
    } catch (error) {
      console.error('Failed to save song:', error)
      toast.error(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  // Parse lyrics for preview
  const previewSections = useMemo(() => {
    if (!lyrics) return []
    const markdown = buildMarkdownFromParts({ title: title || 'Untitled' }, lyrics)
    return parseSong(markdown).sections
  }, [lyrics, title])

  // Reset preview index when sections change
  useEffect(() => {
    if (previewIndex >= previewSections.length) {
      setPreviewIndex(0)
    }
  }, [previewSections.length, previewIndex])

  const currentPreviewSection = previewSections[previewIndex]

  if (!currentChurch) {
    return null
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/songs')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">
          {isNew ? t('songs.newSong') : t('songs.editSong')}
        </h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">{t('songs.form.title')} *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Amazing Grace"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">{t('songs.form.author')}</Label>
              <Input
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="John Newton"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="copyright">{t('songs.form.copyright')}</Label>
              <Input
                id="copyright"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
                placeholder="Public Domain"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ccli">{t('songs.form.ccliNumber')}</Label>
              <Input
                id="ccli"
                value={ccliNumber}
                onChange={(e) => setCcliNumber(e.target.value)}
                placeholder="1234567"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lyrics">{t('songs.form.lyrics')} *</Label>
            <p className="text-sm text-muted-foreground">
              {t('songs.form.lyricsHelp')}
            </p>
            <Textarea
              id="lyrics"
              value={lyrics}
              onChange={(e) => handleLyricsChange(e.target.value)}
              placeholder={`# Verse 1
Amazing grace how sweet the sound
That saved a wretch like me

# Chorus
Amazing grace, amazing grace
How sweet the sound`}
              className="min-h-[400px] font-mono text-sm"
            />
          </div>

          <div className="flex gap-4">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? t('common.loading') : t('common.save')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/songs')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>

        <div className="lg:sticky lg:top-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {t('songs.preview')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewSections.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Start typing lyrics to see preview
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1">
                    {previewSections.map((section, index) => (
                      <Button
                        key={section.id}
                        variant={index === previewIndex ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPreviewIndex(index)}
                      >
                        {section.label}
                      </Button>
                    ))}
                  </div>
                  {currentPreviewSection && (
                    <div className="bg-muted/50 rounded-lg p-6 text-center">
                      <p className="text-xs text-muted-foreground mb-4 uppercase tracking-wide">
                        {currentPreviewSection.label}
                      </p>
                      <div className="text-lg whitespace-pre-line">
                        {currentPreviewSection.content || '(no content)'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
