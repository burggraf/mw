# AI Reformat Button Design

## Overview

Add an "Reformat with AI" button to the SongEditor page that allows users to restructure existing songs using the same AI-powered song structure analysis used during Genius import.

## Architecture

**High-Level Flow:**
1. User clicks "Reformat with AI" button (above lyrics textarea)
2. If form has unsaved changes, show warning dialog (Save/Discard/Cancel)
3. Build full markdown (frontmatter + lyrics) from current form state
4. Call `structure-song-lyrics` edge function
5. Show preview dialog with AI-formatted result (editable)
6. User accepts → update all form fields (title, author, lyrics, etc.)
7. User manually saves the song

**Key Principle:** AI reformat does NOT auto-save. User must explicitly click Save after reviewing, giving them control to accept/reject parts of the AI output.

## Components

### SongReformatDialog (New)

**Location:** `src/components/songs/SongReformatDialog.tsx`

**Props:**
```typescript
interface SongReformatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  author: string
  originalMarkdown: string
  onAccept: (formattedMarkdown: string) => void
}
```

**Features:**
- Shows loading spinner while AI processes
- Displays section count: "Detected X sections"
- Editable textarea with monospace font
- "Regenerate" button to retry AI formatting
- "Cancel" and "Accept" actions

**States:**
- `loading: boolean` - AI processing state
- `structuring: boolean` - During regeneration
- `formattedMarkdown: string` - AI result
- `sectionsDetected: number` - Number of sections found
- `error: string` - Error message if AI fails

### SongEditor Integration

**Modified File:** `src/pages/SongEditor.tsx`

**Button Placement:**
Above the lyrics label, add a secondary action button:
```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="lyrics">{t('songs.form.lyrics')} *</Label>
  <Button variant="outline" size="sm" onClick={handleReformatWithAI}>
    <Wand2 className="h-4 w-4 mr-2" />
    {t('songs.reformatWithAI')}
  </Button>
</div>
```

**New States:**
- `reformatting: boolean` - AI processing state
- `reformatDialogOpen: boolean` - Dialog visibility
- `markdownToReformat: string` - Full markdown to send to AI
- `hasUnsavedChanges: boolean` - Track unsaved changes
- `showUnsavedWarning: boolean` - Warning dialog visibility

**Unsaved Changes Detection:**
Compare current form state with original saved song data:
```typescript
const hasUnsavedChanges = useMemo(() => {
  if (isNew) return false
  return (
    title !== originalSong?.title ||
    author !== (originalSong?.author || '') ||
    copyright !== (originalSong?.copyrightInfo || '') ||
    lyrics !== extractLyricsContent(originalSong?.content || '')
  )
}, [title, author, copyright, lyrics, originalSong, isNew])
```

## Data Flow

```
User clicks "Reformat with AI"
        ↓
Check hasUnsavedChanges?
        ↓
    Yes → Show Warning Dialog
    ↓         ↓
  Cancel   Save/Discard?
    ↓         ↓
  Stop      Build full markdown
              ↓
        Open SongReformatDialog
              ↓
        Dialog calls structureSongLyrics(fullMarkdown)
              ↓
        AI processes and returns formatted markdown
              ↓
        Show editable preview in dialog
              ↓
        User edits if desired
              ↓
        User clicks Accept
              ↓
        Parse formatted markdown, update all form fields
              ↓
        Form now has unsaved changes
              ↓
        User must manually click Save
```

## Error Handling

**Silent Fallback:**
- If AI fails, use basic formatter (same as Genius import)
- Always show formatted result to user
- Toast: "AI unavailable, using basic formatting"

**Validation:**
- Button disabled if lyrics are empty
- Edge function validates: 1-100 sections
- Timeout handling with retry option

**User-Facing Errors:**
- "Failed to connect to AI service" with Retry button
- "Lyrics too large to format" (50K char limit)

## Translation Keys

Add to both `en.json` and `es.json`:

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

## File Structure

```
src/components/songs/
├── SongReformatDialog.tsx      (new)
└── SongEditor.tsx               (modify)

src/i18n/locales/
├── en.json                      (modify)
└── es.json                      (modify)
```

## Implementation Checklist

1. Create `SongReformatDialog.tsx` component
2. Add translation keys to `en.json` and `es.json`
3. Update `SongEditor.tsx`:
   - Add new state variables
   - Add `hasUnsavedChanges` detection
   - Add "Reformat with AI" button
   - Add unsaved changes warning dialog
   - Add reformat handler functions
   - Add accept handler
4. Test with various song formats
5. Test unsaved changes warning flow
6. Test AI failure fallback behavior

## Dependencies

- Existing `structureSongLyrics` service (already implemented)
- Existing `structure-song-lyrics` edge function (already deployed)
- Shadcn UI components: Dialog, Button, Textarea, Label
- Icons: Wand2 (lucide-react)
