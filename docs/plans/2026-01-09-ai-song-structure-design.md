# AI-Powered Song Structure Design

## Overview

Replace the basic `formatLyricsAsMarkdown` function with AI-powered song structure analysis when importing lyrics from Genius. The system will intelligently split lyrics into slide-ready chunks (2-4 lines, max 6) with proper section headers.

## Architecture

### High-Level Flow

1. User searches Genius and selects a song
2. Raw lyrics are fetched from Genius/lrclib
3. Lyrics are sent to a new Supabase Edge Function (`structure-song-lyrics`) powered by Google Gemini
4. The AI returns structured markdown with section headers and properly chunked slides
5. User previews and can edit the structured lyrics
6. On import, the formatted markdown is saved to the song

### New Edge Function

**Location:** `supabase/functions/structure-song-lyrics/index.ts`

**Responsibilities:**
- Receive raw lyrics text
- Call Google Gemini API with structured prompt
- Return structured markdown with `# Section` headers
- Fall back to basic formatting if AI fails

**Why Edge Function?**
- API key security
- Consistent with existing `genius-search` pattern
- Enables future caching/rate limiting
- Keeps frontend simple

## Gemini Integration

### Prompt Strategy

The Gemini prompt accomplishes:
1. Detect and respect existing section labels (Chorus, Verse, Bridge, etc.)
2. Intelligently infer structure when sections aren't clear
3. Split content into chunks of 2-4 lyric lines (max 6)
4. Remove non-lyric directives like "Repeat 4x", "(Guitar solo)", etc.
5. Add `# Section` headers in proper markdown format

### Model Selection

- Primary: `gemini-1.5-flash` for speed/cost efficiency
- Fallback: `gemini-1.5-pro` if needed for complex lyrics

### Prompt Template

```
You are a worship song lyric formatter. Your task is to structure raw song lyrics into slide-ready markdown format.

REQUIREMENTS:
1. Section Detection: If the lyrics show clear sections (Chorus, Verse, Bridge, Pre-Chorus, etc.), use those exact names.
2. Section Inference: If no clear sections exist, analyze patterns to identify verses, choruses, bridges.
3. Chunking: Split each section into chunks of 2-4 lines for slide display. Maximum 6 lines per chunk. Count ONLY actual lyric lines (exclude blank lines).
4. Clean Content: Remove directives like "Repeat", "4x", "(Guitar solo)", "[Ad-lib]", etc.
5. Output Format: Use markdown headers (# Verse 1, # Chorus, etc.) with content below each header.

OUTPUT FORMAT:
---
title: [from input]
author: [from input]
---

# [Section Name]
[chunk 1 lines]
[chunk 2 lines]

# [Next Section]
...

Raw lyrics to process:
[INSERT LYRICS HERE]
```

## API Contract

### Request

```typescript
interface StructureLyricsRequest {
  title: string
  author: string
  lyrics: string
}
```

### Response

```typescript
interface StructureLyricsResponse {
  markdown: string      // Full formatted markdown with frontmatter
  sections: number      // Number of sections detected (for UI feedback)
  fallback: boolean     // true if we used basic formatting instead of AI
}
```

### Environment Variables

- `GEMINI_API_KEY` - Google AI API key (stored in Supabase secrets)

## Frontend Changes

### New Service

**Location:** `src/services/songStructure.ts`

```typescript
export interface StructureLyricsRequest {
  title: string
  author: string
  lyrics: string
}

export interface StructureLyricsResponse {
  markdown: string
  sections: number
  fallback: boolean
}

export async function structureSongLyrics(
  title: string,
  author: string,
  lyrics: string
): Promise<StructureLyricsResponse>
```

### Updated GeniusSongSearch Component

**New States:**
```typescript
type ViewState = 'search' | 'preview' | 'structured'

const [structuredLyrics, setStructuredLyrics] = useState<string | null>(null)
const [structuring, setStructuring] = useState(false)
```

**Updated Flow:**
```
handleSelectSong → getGeniusLyrics → structureSongLyrics (NEW)
                                          ↓
                                    Show preview with editable markdown
                                          ↓
                                    User edits/corrects if needed
                                          ↓
                                    handleImport → createSong with markdown
```

### Preview UI

**Features:**
- Editable textarea showing AI-formatted markdown
- Section headers visually highlighted
- "Detected X sections" summary
- "Regenerate with AI" button
- "Edit manually" option

**User Flow:**
1. User selects song from Genius
2. Loading: "Structuring lyrics..."
3. Structured preview displays with editable markdown
4. User accepts, edits, regenerates, or goes back
5. Import with finalized markdown

## Error Handling

**Silent Fallback Strategy:**
- If edge function fails: log error, use existing `formatLyricsAsMarkdown`
- If Gemini times out: same fallback
- User never sees an error - they always get usable lyrics
- No indication when fallback is used (seamless experience)

**Validation:**
- Safety check to ensure no chunk exceeds 6 lines
- If AI returns invalid format, trigger fallback

## File Structure

```
supabase/functions/structure-song-lyrics/
├── index.ts              # Edge function entry point
└── README.md             # Documentation

src/services/
└── songStructure.ts      # Frontend service

src/components/songs/
└── GeniusSongSearch.tsx  # Modified for AI flow

src/i18n/locales/
├── en.json              # Added translation keys
└── es.json              # Added translation keys
```

## Translation Keys

```json
{
  "songs": {
    "genius": {
      "structuring": "Structuring lyrics with AI...",
      "structuredPreview": "Structured Preview",
      "regenerate": "Regenerate with AI",
      "sectionsDetected": "Detected {{count}} sections"
    }
  }
}
```

## Implementation Checklist

1. Create `supabase/functions/structure-song-lyrics/index.ts`
   - Set up Gemini SDK
   - Implement prompt
   - Add fallback logic
   - Deploy to Supabase

2. Create `src/services/songStructure.ts`
   - Implement `structureSongLyrics()`
   - Add TypeScript types

3. Update `src/components/songs/GeniusSongSearch.tsx`
   - Add 'structured' to ViewState
   - Add AI processing state
   - Implement structured preview UI
   - Wire up regenerate button

4. Update translation files (`en.json`, `es.json`)

5. Test with various song formats
   - Songs with clear sections
   - Songs without clear sections
   - Songs with many non-lyric directives
   - Edge cases (very long lines, sparse lyrics)

## Dependencies

```json
{
  "@google/generative-ai": "^0.21.0"
}
```

For Edge Function (Deno):
```typescript
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0'
```
