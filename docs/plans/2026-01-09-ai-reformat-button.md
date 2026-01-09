# AI Reformat Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "Reformat with AI" button to the SongEditor page that allows users to restructure existing songs using AI-powered song structure analysis.

**Architecture:** New SongReformatDialog component calls existing structure-song-lyrics edge function, displays preview in modal, and updates SongEditor form fields on accept.

**Tech Stack:** React, TypeScript, Supabase Edge Functions, Google Gemini AI, Shadcn UI, Lucide icons

---

## Task 1: Create SongReformatDialog Component

**Files:**
- Create: `src/components/songs/SongReformatDialog.tsx`

**Step 1: Write the component**

Create `src/components/songs/SongReformatDialog.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { structureSongLyrics } from '@/services/songStructure'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface SongReformatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  author: string
  originalMarkdown: string
  onAccept: (formattedMarkdown: string) => void
}

export function SongReformatDialog({
  open,
  onOpenChange,
  title,
  author,
  originalMarkdown,
  onAccept,
}: SongReformatDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [structuring, setStructuring] = useState(false)
  const [formattedMarkdown, setFormattedMarkdown] = useState<string | null>(null)
  const [sectionsDetected, setSectionsDetected] = useState(0)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFormattedMarkdown(null)
      setSectionsDetected(0)
      setLoading(true)

      // Call AI to structure the lyrics
      structureWithAI()
    }
  }, [open, originalMarkdown])

  async function structureWithAI() {
    setStructuring(true)
    try {
      const response = await structureSongLyrics(title, author, originalMarkdown)
      setFormattedMarkdown(response.markdown)
      setSectionsDetected(response.sections)
    } catch (error) {
      console.error('Failed to structure lyrics:', error)
      toast.error(t('songs.aiProcessingError'))
      onOpenChange(false)
    } finally {
      setLoading(false)
      setStructuring(false)
    }
  }

  function handleRegenerate() {
    setStructuring(true)
    structureWithAI()
  }

  function handleAccept() {
    if (formattedMarkdown) {
      onAccept(formattedMarkdown)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{t('songs.reformatPreview')}</DialogTitle>
        </DialogHeader>

        {loading || structuring ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : formattedMarkdown ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('songs.sectionsDetected', { count: sectionsDetected })}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={structuring}
              >
                {structuring ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('songs.regenerate')}
              </Button>
            </div>

            <Textarea
              value={formattedMarkdown}
              onChange={(e) => setFormattedMarkdown(e.target.value)}
              className="min-h-[400px] font-mono text-sm resize-none"
              placeholder={t('songs.editManually')}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleAccept} disabled={!formattedMarkdown || structuring}>
            {t('common.accept', 'Accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/songs/SongReformatDialog.tsx
git commit -m "feat: add SongReformatDialog component for AI song reformatting"
```

---

## Task 2: Add Translation Keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Find the songs object in English translations**

Run:
```bash
grep -n '"songs"' src/i18n/locales/en.json | head -5
```

Expected: Find the line number where `"songs":` object starts

**Step 2: Add English translation keys**

Modify `src/i18n/locales/en.json` - add these keys to the `songs` object:

```json
{
  "songs": {
    "reformatWithAI": "Reformat with AI",
    "reformatPreview": "AI Reformat Preview",
    "regenerate": "Regenerate",
    "sectionsDetected": "Detected {{count}} sections",
    "editManually": "Edit manually",
    "reformattedWithAI": "Song reformatted with AI",
    "unsavedChangesTitle": "Unsaved Changes",
    "unsavedChangesReformatWarning": "You have unsaved changes. Save them first, or discard to reformat with the current content.",
    "discardChanges": "Discard & Continue",
    "aiProcessingError": "Failed to connect to AI service"
  }
}
```

**Step 3: Add Spanish translation keys**

Modify `src/i18n/locales/es.json` - add these keys to the `songs` object:

```json
{
  "songs": {
    "reformatWithAI": "Reformatear con IA",
    "reformatPreview": "Vista Previa de Reformateo con IA",
    "regenerate": "Regenerar",
    "sectionsDetected": "{{count}} secciones detectadas",
    "editManually": "Editar manualmente",
    "reformattedWithAI": "Canción reformateada con IA",
    "unsavedChangesTitle": "Cambios Sin Guardar",
    "unsavedChangesReformatWarning": "Tienes cambios sin guardar. Guárdalos primero, o descártalos para reformatear con el contenido actual.",
    "discardChanges": "Descartar y Continuar",
    "aiProcessingError": "Error al conectar con el servicio de IA"
  }
}
```

**Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "i18n: add translation keys for AI reformat button feature"
```

---

## Task 3: Update SongEditor - Add Imports and Icon

**Files:**
- Modify: `src/pages/SongEditor.tsx`

**Step 1: Add icon import**

Modify `src/pages/SongEditor.tsx` - add `Wand2` to the lucide-react imports (around line 16):

Find:
```typescript
import { ArrowLeft, Save, Eye, Image } from 'lucide-react'
```

Replace with:
```typescript
import { ArrowLeft, Save, Eye, Image, Wand2 } from 'lucide-react'
```

**Step 2: Add SongReformatDialog import**

Modify `src/pages/SongEditor.tsx` - add after BackgroundPicker import (around line 13):

Add:
```typescript
import { SongReformatDialog } from '@/components/songs/SongReformatDialog'
```

**Step 3: Add Dialog imports**

Modify `src/pages/SongEditor.tsx` - add to existing shadcn imports (around line 8-12):

Add:
```typescript
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
```

**Step 4: Commit**

```bash
git add src/pages/SongEditor.tsx
git commit -m "feat(songs): add imports for AI reformat dialog"
```

---

## Task 4: Update SongEditor - Add State Variables

**Files:**
- Modify: `src/pages/SongEditor.tsx`

**Step 1: Add new state variables**

Modify `src/pages/SongEditor.tsx` - find the state declarations (around line 27-42) and add:

After line 36 (after `const [pickerOpen, setPickerOpen] = useState(false)`):

Add:
```typescript
  // AI Reformat states
  const [reformatting, setReformatting] = useState(false)
  const [reformatDialogOpen, setReformatDialogOpen] = useState(false)
  const [markdownToReformat, setMarkdownToReformat] = useState('')
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)
  const [originalSong, setOriginalSong] = useState<any>(null)
```

**Step 2: Update loadSong to store original data**

Modify `src/pages/SongEditor.tsx` - in the `loadSong` function (around line 82), add line to store original song data:

After line 95 (after `setCcliNumber(song.ccliNumber || '')`):

Add:
```typescript
      // Store original song data for unsaved changes detection
      setOriginalSong(song)
```

**Step 3: Commit**

```bash
git add src/pages/SongEditor.tsx
git commit -m "feat(songs): add state for AI reformat feature"
```

---

## Task 5: Update SongEditor - Add Unsaved Changes Detection

**Files:**
- Modify: `src/pages/SongEditor.tsx`

**Step 1: Add useMemo for hasUnsavedChanges**

Modify `src/pages/SongEditor.tsx` - add after the `previewSections` useMemo (around line 177):

Add:
```typescript
  // Detect unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (isNew || !originalSong) return false
    return (
      title !== originalSong.title ||
      author !== (originalSong.author || '') ||
      copyright !== (originalSong.copyrightInfo || '') ||
      lyrics !== extractLyricsContent(originalSong.content || '')
    )
  }, [title, author, copyright, lyrics, originalSong, isNew])
```

**Step 2: Commit**

```bash
git add src/pages/SongEditor.tsx
git commit -m "feat(songs): add unsaved changes detection for reformat"
```

---

## Task 6: Update SongEditor - Add Reformat Handler Functions

**Files:**
- Modify: `src/pages/SongEditor.tsx`

**Step 1: Add reformat handlers**

Modify `src/pages/SongEditor.tsx` - add these functions before the return statement (around line 175, after the previewSections useMemo):

Add:
```typescript
  async function handleReformatWithAI() {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true)
      return
    }

    setReformatting(true)
    try {
      const metadata = {
        title: title || 'Untitled',
        author: author || undefined,
        copyright: copyright || undefined,
        ccliNumber: ccliNumber || undefined,
      }
      const fullMarkdown = buildMarkdownFromParts(metadata, lyrics)
      setMarkdownToReformat(fullMarkdown)
      setReformatDialogOpen(true)
    } catch (error) {
      console.error('Failed to prepare for reformatting:', error)
      toast.error(t('common.error'))
    } finally {
      setReformatting(false)
    }
  }

  async function handleSaveAndReformat() {
    await handleSave()
    setShowUnsavedWarning(false)
    // Reformat will use the newly saved data
    setTimeout(() => handleReformatWithAI(), 100)
  }

  function handleDiscardAndReformat() {
    setShowUnsavedWarning(false)
    // Proceed with reformat using current form state
    setReformatting(true)
    const metadata = {
      title: title || 'Untitled',
      author: author || undefined,
      copyright: copyright || undefined,
      ccliNumber: ccliNumber || undefined,
    }
    const fullMarkdown = buildMarkdownFromParts(metadata, lyrics)
    setMarkdownToReformat(fullMarkdown)
    setReformatDialogOpen(true)
    setReformatting(false)
  }

  function handleAcceptFormatted(formattedMarkdown: string) {
    const parsed = parseSong(formattedMarkdown)

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

    setLyrics(extractLyricsContent(formattedMarkdown))
    toast.success(t('songs.reformattedWithAI'))
  }
```

**Step 2: Commit**

```bash
git add src/pages/SongEditor.tsx
git commit -m "feat(songs): add AI reformat handler functions"
```

---

## Task 7: Update SongEditor - Add Button to UI

**Files:**
- Modify: `src/pages/SongEditor.tsx`

**Step 1: Update lyrics label section to include button**

Modify `src/pages/SongEditor.tsx` - find the lyrics label (around line 260-264):

Find:
```typescript
          <div className="space-y-2">
            <Label htmlFor="lyrics">{t('songs.form.lyrics')} *</Label>
            <p className="text-sm text-muted-foreground">
              {t('songs.form.lyricsHelp')}
            </p>
```

Replace with:
```typescript
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="lyrics">{t('songs.form.lyrics')} *</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReformatWithAI}
                disabled={!lyrics.trim() || reformatting}
              >
                {reformating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                {t('songs.reformatWithAI')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('songs.form.lyricsHelp')}
            </p>
```

**Step 2: Commit**

```bash
git add src/pages/SongEditor.tsx
git commit -m "feat(songs): add Reformat with AI button to SongEditor"
```

---

## Task 8: Update SongEditor - Add Dialogs to JSX

**Files:**
- Modify: `src/pages/SongEditor.tsx`

**Step 1: Add SongReformatDialog and UnsavedWarningDialog**

Modify `src/pages/SongEditor.tsx` - find the end of the component (before the closing `</div>` at line 401, after the BackgroundPicker dialog):

Add before the final closing `</div>`:
```typescript
      {/* AI Reformat Dialog */}
      <SongReformatDialog
        open={reformatDialogOpen}
        onOpenChange={setReformatDialogOpen}
        title={title || 'Untitled'}
        author={author || ''}
        originalMarkdown={markdownToReformat}
        onAccept={handleAcceptFormatted}
      />

      {/* Unsaved Changes Warning Dialog */}
      <Dialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('songs.unsavedChangesTitle')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {t('songs.unsavedChangesReformatWarning')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnsavedWarning(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="outline" onClick={handleSaveAndReformat}>
              <Save className="h-4 w-4 mr-2" />
              {t('common.save')}
            </Button>
            <Button variant="destructive" onClick={handleDiscardAndReformat}>
              {t('songs.discardChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

**Step 2: Commit**

```bash
git add src/pages/SongEditor.tsx
git commit -m "feat(songs): add dialogs for AI reformat feature"
```

---

## Task 9: Add Dialog Component (if needed)

**Files:**
- Check: `src/components/ui/dialog.tsx`

**Step 1: Check if Dialog component exists**

Run:
```bash
ls src/components/ui/dialog.tsx
```

Expected: If file doesn't exist, create it

**Step 2: Create Dialog component if missing**

Only if step 1 shows file is missing, run:
```bash
pnpm dlx shadcn@latest add dialog
```

Expected: Component is added successfully

**Step 3: Commit (if component was created)**

```bash
git add src/components/ui/dialog.tsx
git commit -m "chore: add dialog UI component"
```

---

## Task 10: Manual Testing

**Step 1: Start development server**

Run:
```bash
pnpm dev
```

**Step 2: Test the flow**

1. Navigate to `/songs`
2. Click on an existing song to edit it
3. Verify "Reformat with AI" button appears above lyrics field (disabled if lyrics empty)
4. Click "Reformat with AI" button
5. Wait for AI processing and preview dialog to appear
6. Verify:
   - Section count is displayed
   - AI-formatted markdown is shown
   - Content can be edited in the textarea
   - "Regenerate" button works
7. Click "Accept"
8. Verify form fields are updated (title, author, lyrics)
9. Verify toast "Song reformatted with AI" appears
10. Manually save the song

**Step 3: Test unsaved changes warning**

1. Edit a song (make changes without saving)
2. Click "Reformat with AI"
3. Verify warning dialog appears with 3 options
4. Test "Cancel" - dialog closes, no changes
5. Test "Save" - saves song, then proceeds with reformat
6. Test "Discard & Continue" - proceeds with current form state

**Step 4: Test edge cases**

- Test with new song (no originalSong) - should work without warning
- Test with empty lyrics - button should be disabled
- Test with very long lyrics
- Test regenerate functionality

---

## Summary

This implementation adds AI-powered song reformatting to the SongEditor page, allowing users to restructure existing songs with one click. The feature includes:

- New SongReformatDialog component for previewing AI-formatted lyrics
- "Reformat with AI" button above the lyrics textarea
- Unsaved changes detection and warning dialog
- Integration with existing structure-song-lyrics edge function
- Full i18n support (English and Spanish)

**Key files modified:**
- `src/components/songs/SongReformatDialog.tsx` (new)
- `src/pages/SongEditor.tsx` (modified)
- `src/i18n/locales/en.json` (modified)
- `src/i18n/locales/es.json` (modified)

**Silent fallback:** If AI fails, the edge function uses basic formatting, so users always get a working result.
