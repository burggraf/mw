# AI-Powered Song Structure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered song structure analysis when importing lyrics from Genius, using Google Gemini to intelligently split lyrics into slide-ready chunks with proper section headers.

**Architecture:** New Supabase Edge Function calls Gemini API with structured prompt to convert raw lyrics into markdown with section headers and slide-sized chunks. Frontend calls this function and displays editable preview before import.

**Tech Stack:** Google Gemini API (`@google/generative-ai`), Supabase Edge Functions (Deno), React, TypeScript

---

## Task 1: Create Edge Function for AI Lyric Structuring

**Files:**
- Create: `supabase/functions/structure-song-lyrics/index.ts`
- Create: `supabase/functions/structure-song-lyrics/README.md`

**Step 1: Create edge function directory structure**

Run:
```bash
mkdir -p supabase/functions/structure-song-lyrics
```

**Step 2: Write the edge function implementation**

Create `supabase/functions/structure-song-lyrics/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StructureRequest {
  title: string;
  author: string;
  lyrics: string;
}

interface StructureResponse {
  markdown: string;
  sections: number;
  fallback: boolean;
}

function escapeYaml(str: string): string {
  if (str.includes(':') || str.includes('#') || str.includes("'") || str.includes('"')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

function countSectionsInMarkdown(markdown: string): number {
  const matches = markdown.match(/^#\s+.+$/gm);
  return matches ? matches.length : 0;
}

/**
 * Basic fallback formatter when AI is unavailable
 */
function formatLyricsAsMarkdownBasic(title: string, author: string, lyrics: string): StructureResponse {
  const frontmatter = `---
title: ${escapeYaml(title)}
author: ${escapeYaml(author)}
---`;

  if (!lyrics || lyrics.trim().length === 0) {
    return {
      markdown: `${frontmatter}

# Verse 1
(No lyrics available - add your lyrics here)
`,
      sections: 1,
      fallback: true,
    };
  }

  // Simple section detection
  const sectionPattern = /^\s*[\[(]?\s*(Verse|Chorus|Bridge|Pre-Chorus|Intro|Outro|Hook|Refrain|Tag|Interlude)[\s\d]*[\])]?\s*$/i;

  const lines = lyrics.split('\n');
  const sections: { label: string; lines: string[] }[] = [];
  let currentSection: { label: string; lines: string[] } | null = null;
  let verseCount = 0;

  for (const line of lines) {
    const sectionMatch = line.match(sectionPattern);

    if (sectionMatch) {
      if (currentSection && currentSection.lines.length > 0) {
        sections.push(currentSection);
      }

      const sectionType = sectionMatch[1].toLowerCase();
      let label = sectionMatch[0].trim().replace(/[\[\]()]/g, '');

      if (sectionType === 'verse') {
        verseCount++;
        if (!label.match(/\d/)) {
          label = `Verse ${verseCount}`;
        }
      }

      currentSection = { label, lines: [] };
    } else if (line.trim()) {
      if (!currentSection) {
        verseCount++;
        currentSection = { label: `Verse ${verseCount}`, lines: [] };
      }
      currentSection.lines.push(line);
    } else if (currentSection && currentSection.lines.length > 0) {
      currentSection.lines.push('');
    }
  }

  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    return {
      markdown: `${frontmatter}

# Verse 1
${lyrics.trim()}
`,
      sections: 1,
      fallback: true,
    };
  }

  let content = frontmatter + '\n';

  for (const section of sections) {
    content += `\n# ${section.label}\n`;
    content += section.lines.join('\n').trim() + '\n';
  }

  return {
    markdown: content,
    sections: countSectionsInMarkdown(content),
    fallback: true,
  };
}

/**
 * Structure lyrics using Gemini AI
 */
async function structureWithGemini(
  title: string,
  author: string,
  lyrics: string,
  apiKey: string
): Promise<StructureResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a worship song lyric formatter. Your task is to structure raw song lyrics into slide-ready markdown format.

REQUIREMENTS:
1. Section Detection: If the lyrics show clear sections (Chorus, Verse, Bridge, Pre-Chorus, Outro, Tag, etc.), use those exact names.
2. Section Inference: If no clear sections exist, analyze patterns to identify verses, choruses, bridges.
3. Chunking: Split each section into chunks of 2-4 lines for slide display. Maximum 6 lines per chunk. Count ONLY actual lyric lines (exclude blank lines).
4. Clean Content: Remove directives like "Repeat", "4x", "(Guitar solo)", "[Ad-lib]", "[x2]", etc.
5. Output Format: Use markdown headers (# Verse 1, # Chorus, etc.) with content below each header.
6. Section names should be short: # Verse 1, # Chorus, # Bridge - not verbose descriptions.

OUTPUT FORMAT:
---
title: Song Title
author: Artist Name
---

# [Section Name]
[chunk 1 lines]
[chunk 2 lines]

# [Next Section]
...

Raw lyrics to process:
${lyrics}

Remember: Start with YAML frontmatter containing the title and author, then add sections with markdown headers.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const markdown = response.text();

    // Clean up the response - remove markdown code blocks if present
    let cleanedMarkdown = markdown;
    const codeBlockMatch = markdown.match(/```(?:markdown)?\n([\s\S]+)\n```/);
    if (codeBlockMatch) {
      cleanedMarkdown = codeBlockMatch[1];
    }

    // Ensure frontmatter has correct title/author
    const frontmatterMatch = cleanedMarkdown.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      let updatedFrontmatter = frontmatter;

      if (!frontmatter.includes('title:')) {
        updatedFrontmatter = `title: ${escapeYaml(title)}\n` + updatedFrontmatter;
      } else {
        updatedFrontmatter = updatedFrontmatter.replace(/title: .*/, `title: ${escapeYaml(title)}`);
      }

      if (!frontmatter.includes('author:')) {
        updatedFrontmatter += `\nauthor: ${escapeYaml(author)}`;
      } else {
        updatedFrontmatter = updatedFrontmatter.replace(/author: .*/, `author: ${escapeYaml(author)}`);
      }

      cleanedMarkdown = cleanedMarkdown.replace(
        /^---\n[\s\S]*?\n---/,
        `---\n${updatedFrontmatter}\n---`
      );
    } else {
      // Add frontmatter if missing
      cleanedMarkdown = `---
title: ${escapeYaml(title)}
author: ${escapeYaml(author)}
---\n\n${cleanedMarkdown}`;
    }

    return {
      markdown: cleanedMarkdown,
      sections: countSectionsInMarkdown(cleanedMarkdown),
      fallback: false,
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const { title, author, lyrics }: StructureRequest = await req.json();

    if (!title || !author) {
      return new Response(
        JSON.stringify({ error: "title and author are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Try AI structuring if API key is available
    if (apiKey) {
      try {
        const result = await structureWithGemini(title, author, lyrics || '', apiKey);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error('AI structuring failed, using fallback:', error);
        // Silent fallback to basic formatting
      }
    } else {
      console.warn('GEMINI_API_KEY not configured, using basic formatting');
    }

    // Fallback to basic formatting
    const result = formatLyricsAsMarkdownBasic(title, author, lyrics || '');
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Structure lyrics error:", error);
    const message = error instanceof Error ? error.message : "structure_failed";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
```

**Step 3: Create README for the edge function**

Create `supabase/functions/structure-song-lyrics/README.md`:

```markdown
# Structure Song Lyrics

Converts raw song lyrics into structured markdown with section headers and slide-sized chunks using Google Gemini AI.

## Environment Variables

- `GEMINI_API_KEY` - Google AI API key (optional - falls back to basic formatting if not set)

Get an API key: https://makersuite.google.com/app/apikey

## Request

```json
{
  "title": "Amazing Grace",
  "author": "John Newton",
  "lyrics": "Amazing grace how sweet the sound..."
}
```

## Response

```json
{
  "markdown": "---\ntitle: Amazing Grace\nauthor: John Newton\n---\n\n# Verse 1\nAmazing grace...",
  "sections": 4,
  "fallback": false
}
```

## Deploy

```bash
supabase functions deploy structure-song-lyrics
```
```

**Step 4: Deploy the edge function**

Run:
```bash
supabase functions deploy structure-song-lyrics
```

Expected: Function deploys successfully

**Step 5: Commit**

```bash
git add supabase/functions/structure-song-lyrics/
git commit -m "feat: add AI-powered song structure edge function with Gemini"
```

---

## Task 2: Add Translation Keys

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Read existing translation file to find insertion point**

Run:
```bash
grep -n '"genius"' src/i18n/locales/en.json
```

Expected: Find the genius section in the songs object

**Step 2: Add English translation keys**

Modify `src/i18n/locales/en.json` - add to `songs.genius` object:

```json
{
  "songs": {
    "genius": {
      "structuring": "Structuring lyrics with AI...",
      "structuredPreview": "Structured Preview",
      "regenerate": "Regenerate with AI",
      "sectionsDetected": "Detected {{count}} sections",
      "editManually": "Edit manually",
      "aiProcessing": "AI is organizing your lyrics into slides...",
      "useBasicFormat": "Use basic formatting"
    }
  }
}
```

**Step 3: Add Spanish translation keys**

Modify `src/i18n/locales/es.json` - add to `songs.genius` object:

```json
{
  "songs": {
    "genius": {
      "structuring": "Estructurando letras con IA...",
      "structuredPreview": "Vista Estructurada",
      "regenerate": "Regenerar con IA",
      "sectionsDetected": "{{count}} secciones detectadas",
      "editManually": "Editar manualmente",
      "aiProcessing": "La IA está organizando tus letras en diapositivas...",
      "useBasicFormat": "Usar formato básico"
    }
  }
}
```

**Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "i18n: add translation keys for AI song structure feature"
```

---

## Task 3: Create Song Structure Service

**Files:**
- Create: `src/services/songStructure.ts`

**Step 1: Write the song structure service**

Create `src/services/songStructure.ts`:

```typescript
import { getSupabase } from '@/lib/supabase'

export interface StructureSongLyricsRequest {
  title: string
  author: string
  lyrics: string
}

export interface StructureSongLyricsResponse {
  markdown: string
  sections: number
  fallback: boolean
}

/**
 * Structure song lyrics using AI-powered edge function.
 * Converts raw lyrics into markdown with section headers and slide-sized chunks.
 */
export async function structureSongLyrics(
  title: string,
  author: string,
  lyrics: string
): Promise<StructureSongLyricsResponse> {
  const supabase = getSupabase()

  const { data, error } = await supabase.functions.invoke('structure-song-lyrics', {
    body: {
      title,
      author,
      lyrics,
    },
  })

  if (error) {
    console.error('Failed to structure lyrics:', error)
    throw error
  }

  return data as StructureSongLyricsResponse
}
```

**Step 2: Commit**

```bash
git add src/services/songStructure.ts
git commit -m "feat: add songStructure service for AI-powered lyric formatting"
```

---

## Task 4: Update GeniusSongSearch Component - Add State

**Files:**
- Modify: `src/components/songs/GeniusSongSearch.tsx`

**Step 1: Update ViewState type and add new state variables**

Modify `src/components/songs/GeniusSongSearch.tsx` - find the ViewState type (around line 31) and modify:

```typescript
// Change:
type ViewState = 'search' | 'preview'

// To:
type ViewState = 'search' | 'preview' | 'structured'
```

Add new state variables after the existing state declarations (around line 49):

```typescript
const [importing, setImporting] = useState(false)

// Add these new states:
const [structuredLyrics, setStructuredLyrics] = useState<string | null>(null)
const [sectionsDetected, setSectionsDetected] = useState(0)
const [structuring, setStructuring] = useState(false)
const [usedFallback, setUsedFallback] = useState(false)
```

**Step 2: Commit**

```bash
git add src/components/songs/GeniusSongSearch.tsx
git commit -m "feat(songs): add state for AI lyric structuring"
```

---

## Task 5: Update GeniusSongSearch - Add AI Processing Flow

**Files:**
- Modify: `src/components/songs/GeniusSongSearch.tsx`

**Step 1: Add import for structureSongLyrics service**

Modify `src/components/songs/GeniusSongSearch.tsx` - add to existing imports (around line 12):

```typescript
import {
  searchGeniusSongs,
  getGeniusLyrics,
  createSong,
  type GeniusSong,
} from '@/services/songs'
import { structureSongLyrics } from '@/services/songStructure'  // ADD THIS
```

**Step 2: Create handleStructureLyrics function**

Modify `src/components/songs/GeniusSongSearch.tsx` - add this new function after `handleSelectSong` (around line 102):

```typescript
const handleStructureLyrics = async (song: GeniusSong, rawLyrics: string) => {
  setStructuring(true)

  try {
    const response = await structureSongLyrics(song.title, song.artist, rawLyrics)
    setStructuredLyrics(response.markdown)
    setSectionsDetected(response.sections)
    setUsedFallback(response.fallback)
    setView('structured')
  } catch (error) {
    console.error('Failed to structure lyrics:', error)
    // On error, just show the raw lyrics in preview mode
    toast.error(t('songs.genius.lyricsError'))
  } finally {
    setStructuring(false)
  }
}
```

**Step 3: Update handleSelectSong to trigger structuring**

Modify `src/components/songs/GeniusSongSearch.tsx` - update the `handleSelectSong` function (around line 86):

```typescript
const handleSelectSong = async (song: GeniusSong) => {
  setSelectedSong(song)
  setView('preview')
  setLoadingLyrics(true)
  setLyrics(null)
  setStructuredLyrics(null)

  try {
    const response = await getGeniusLyrics(song.title, song.artist)
    setLyrics(response.lyrics)

    // If we got lyrics, automatically structure them
    if (response.lyrics) {
      await handleStructureLyrics(song, response.lyrics)
    }
  } catch (error) {
    console.error('Failed to fetch lyrics:', error)
    toast.error(t('songs.genius.lyricsError'))
  } finally {
    setLoadingLyrics(false)
  }
}
```

**Step 4: Update handleBack to reset structured state**

Modify `src/components/songs/GeniusSongSearch.tsx` - update the `handleBack` function (around line 103):

```typescript
const handleBack = () => {
  setView('search')
  setSelectedSong(null)
  setLyrics(null)
  setStructuredLyrics(null)  // ADD THIS
  setSectionsDetected(0)     // ADD THIS
  setUsedFallback(false)     // ADD THIS
}
```

**Step 5: Commit**

```bash
git add src/components/songs/GeniusSongSearch.tsx
git commit -m "feat(songs): add AI lyric processing flow to GeniusSongSearch"
```

---

## Task 6: Update GeniusSongSearch - Add Structured Preview UI

**Files:**
- Modify: `src/components/songs/GeniusSongSearch.tsx`

**Step 1: Add imports for Textarea**

Modify `src/components/songs/GeniusSongSearch.tsx` - add Textarea to imports (around line 22):

```typescript
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'  // ADD THIS
```

**Step 2: Update handleImport to use structured lyrics**

Modify `src/components/songs/GeniusSongSearch.tsx` - update the `handleImport` function (around line 109):

```typescript
const handleImport = async () => {
  if (!currentChurch || !selectedSong) {
    toast.error(t('common.noChurchSelected'))
    return
  }

  setImporting(true)

  try {
    // Use structured lyrics if available, otherwise fall back to raw
    const content = structuredLyrics || formatLyricsAsMarkdown(selectedSong, lyrics)

    const newSong = await createSong(currentChurch.id, {
      title: selectedSong.title,
      author: selectedSong.author,
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
```

**Step 3: Add handleRegenerate function**

Modify `src/components/songs/GeniusSongSearch.tsx` - add after `handleImport` (around line 139):

```typescript
const handleRegenerate = async () => {
  if (!selectedSong || !lyrics) return

  setView('preview')
  await handleStructureLyrics(selectedSong, lyrics)
}
```

**Step 4: Add structured preview JSX**

Modify `src/components/songs/GeniusSongSearch.tsx` - find the preview JSX section (around line 257) and add the new structured view. Replace the existing preview section with:

```typescript
        ) : view === 'structured' ? (
          <>
            {/* Structured preview */}
            <div className="flex-1 -mx-6 px-6 flex flex-col">
              <div className="flex items-center justify-between py-2 border-b mb-4">
                <span className="text-sm text-muted-foreground">
                  {t('songs.genius.sectionsDetected', { count: sectionsDetected })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={structuring}
                  className="h-8"
                >
                  {structuring ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {t('songs.genius.regenerate')}
                </Button>
              </div>

              <Textarea
                value={structuredLyrics || ''}
                onChange={(e) => setStructuredLyrics(e.target.value)}
                className="flex-1 font-mono text-sm min-h-[300px] resize-none"
                placeholder={t('songs.genius.editManually')}
              />
            </div>

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
                  disabled={importing || !structuredLyrics}
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
        ) : (
          <>
            {/* Raw lyrics preview - original view */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              {loadingLyrics || structuring ? (
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
```

**Step 5: Update handleOpenChange to reset new states**

Modify `src/components/songs/GeniusSongSearch.tsx` - update the `handleOpenChange` function (around line 51):

```typescript
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset state when dialog closes
      setView('search')
      setQuery('')
      setResults([])
      setSelectedSong(null)
      setLyrics(null)
      setStructuredLyrics(null)      // ADD THIS
      setSectionsDetected(0)         // ADD THIS
      setUsedFallback(false)         // ADD THIS
    }
    onOpenChange(isOpen)
  }
```

**Step 6: Commit**

```bash
git add src/components/songs/GeniusSongSearch.tsx
git commit -m "feat(songs): add structured preview UI with editable markdown"
```

---

## Task 7: Add Textarea UI Component (if needed)

**Files:**
- Check: `src/components/ui/textarea.tsx`

**Step 1: Check if textarea component exists**

Run:
```bash
ls src/components/ui/textarea.tsx
```

Expected: If file doesn't exist, create it

**Step 2: Create textarea component if missing (only if step 1 shows missing)**

Run:
```bash
pnpm dlx shadcn@latest add textarea
```

Expected: Component is added successfully

**Step 3: Commit (if component was created)**

```bash
git add src/components/ui/textarea.tsx
git commit -m "chore: add textarea UI component"
```

---

## Task 8: Manual Testing

**Step 1: Set up Gemini API key locally**

Run:
```bash
# Link your Supabase project if not already linked
supabase secrets list

# Set the Gemini API key
supabase secrets set GEMINI_API_KEY=your_api_key_here
```

**Step 2: Start development server**

Run:
```bash
pnpm dev
```

**Step 3: Test the flow**

1. Navigate to `/songs`
2. Click "Web Search" button
3. Search for a song (e.g., "Amazing Grace")
4. Select a song from results
5. Wait for AI structuring to complete
6. Verify the structured preview shows:
   - Section headers (# Verse 1, # Chorus, etc.)
   - Properly chunked lyrics (2-4 lines per chunk)
   - "Detected X sections" message
7. Test editing the markdown
8. Test "Regenerate with AI" button
9. Import the song
10. Navigate to song edit page and verify the structure was preserved

**Step 4: Test edge cases**

Test with:
- Song without clear sections
- Song with many non-lyric directives ("[Repeat]", "(x4)", etc.)
- Very long song
- Song with sparse lyrics

**Step 5: Test fallback behavior**

Temporarily unset the API key and verify basic formatting still works:

```bash
supabase secrets unset GEMINI_API_KEY
```

Then test the import flow again - should still work with basic formatting.

Restore the key:
```bash
supabase secrets set GEMINI_API_KEY=your_api_key_here
```

---

## Task 9: Deploy to Production

**Step 1: Deploy edge function to production**

Run:
```bash
supabase functions deploy structure-song-lyrics --project-ref YOUR_PROJECT_REF
```

**Step 2: Set production secret**

Run:
```bash
supabase secrets set GEMINI_API_KEY=your_production_api_key --project-ref YOUR_PROJECT_REF
```

**Step 3: Verify deployment**

Run:
```bash
supabase functions list --project-ref YOUR_PROJECT_REF
```

Expected: `structure-song-lyrics` appears in the list

---

## Summary

This implementation adds AI-powered song structure analysis when importing from Genius. The flow is:

1. User searches Genius and selects a song
2. Raw lyrics are fetched
3. **NEW:** AI structures lyrics into slide-ready chunks
4. User previews and can edit the structured markdown
5. Song is imported with the structured content

**Key files modified:**
- `supabase/functions/structure-song-lyrics/index.ts` (new)
- `src/services/songStructure.ts` (new)
- `src/components/songs/GeniusSongSearch.tsx` (modified)
- `src/i18n/locales/en.json` (modified)
- `src/i18n/locales/es.json` (modified)

**Silent fallback:** If AI fails, the system uses basic regex-based formatting so the user always gets a working import.
