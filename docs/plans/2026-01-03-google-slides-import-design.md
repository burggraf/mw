# Google Slides Import - Design Document

**Date:** 2026-01-03
**Status:** Draft - Awaiting Approval

## Overview

Enable users to import Google Slides presentations into Mobile Worship by pasting a presentation URL. Each slide becomes an image in a new folder under `/slides`.

## User Experience

### Flow

1. User navigates to Slides page
2. Clicks "Import from Google Slides" button
3. Dialog opens with URL input field
4. User pastes Google Slides URL (e.g., `https://docs.google.com/presentation/d/1ABC123...`)
5. User clicks "Connect to Google" (first time only)
6. Google OAuth popup opens, user grants read-only access
7. App fetches presentation metadata (title, slide count)
8. User confirms import with optional folder name override
9. Progress bar shows import status
10. Slides appear in new folder

### UI Components

```
┌─────────────────────────────────────────────────────────────┐
│  Import from Google Slides                              [X] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Presentation URL:                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ https://docs.google.com/presentation/d/1ABC...      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────────────────────────────────┐                 │
│  │  🔗 Connect to Google                  │                 │
│  └───────────────────────────────────────┘                 │
│                                                             │
│  ─────────────────────────────────────────                  │
│  After connecting:                                          │
│                                                             │
│  Presentation: "Sunday Service - January 5"                 │
│  Slides: 12                                                 │
│                                                             │
│  Folder Name:                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Sunday Service - January 5                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │     Cancel       │  │     Import       │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Technical Architecture

### Authentication

**Library:** `@react-oauth/google` (Google Identity Services SDK for React)

**OAuth Scopes Required:**
- `https://www.googleapis.com/auth/presentations.readonly` - Read presentation data
- `https://www.googleapis.com/auth/drive.readonly` - Access file metadata

**Flow:**
1. Implicit OAuth flow (no backend needed)
2. Access token stored in memory only (not persisted)
3. Token expires in ~1 hour - user re-authenticates if needed
4. Tokens are per-session, not stored in database

### Google Cloud Console Setup

**Requirements:**
1. Create Google Cloud project
2. Enable Google Slides API
3. Enable Google Drive API
4. Configure OAuth consent screen (External, limited users during testing)
5. Create OAuth 2.0 Client ID (Web application type)
6. Add authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - Production domain(s)

**Environment Variables:**
```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### API Integration

**Step 1: Parse URL**
```typescript
// Extract presentation ID from various URL formats
function extractPresentationId(url: string): string | null {
  const patterns = [
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
```

**Step 2: Fetch Presentation Metadata**
```typescript
async function getPresentation(accessToken: string, presentationId: string) {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  return response.json();
  // Returns: { title, slides: [{ objectId, ... }], pageSize, ... }
}
```

**Step 3: Get Slide Thumbnails**
```typescript
async function getSlideThumbnail(
  accessToken: string,
  presentationId: string,
  pageObjectId: string
): Promise<{ contentUrl: string; width: number; height: number }> {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}/pages/${pageObjectId}/thumbnail?thumbnailProperties.thumbnailSize=LARGE`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  return response.json();
  // Returns: { contentUrl: "https://...", width: 1600, height: 900 }
}
```

**Step 4: Download and Upload to Supabase**
```typescript
async function importSlide(
  thumbnailUrl: string,
  slideIndex: number,
  folderId: string,
  churchId: string
): Promise<Media> {
  // 1. Fetch image from Google's temporary URL
  const imageResponse = await fetch(thumbnailUrl);
  const blob = await imageResponse.blob();

  // 2. Generate thumbnail
  const thumbnail = await generateThumbnail(blob);

  // 3. Upload to Supabase storage
  const storagePath = generateStoragePath(churchId, 'slide', 'png');
  await supabase.storage.from('media').upload(storagePath, blob);

  // 4. Create media record
  return createMedia({
    churchId,
    name: `Slide ${slideIndex + 1}`,
    type: 'image',
    category: 'slide',
    folderId,
    storagePath,
    // ... other fields
  });
}
```

### Limitations

| Aspect | Limitation | Mitigation |
|--------|-----------|------------|
| Resolution | Max 1600px width (LARGE) | Acceptable for most displays |
| Quota | Thumbnails are "expensive reads" | Rate limit requests, show progress |
| URL lifetime | 30 minutes | Download immediately, don't cache URLs |
| Animation | Lost - static snapshot only | Document in UI, suggest alternatives |
| Speaker notes | Not imported | Could add as tags in future |
| Embedded videos | Not imported | Document in UI |

### Rate Limiting

Google Slides API has quota limits. To avoid hitting them:
- Process slides sequentially with 100ms delay between requests
- Show clear progress indicator
- Allow retry on failure

### Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| Invalid URL | "Please enter a valid Google Slides URL" | Keep dialog open |
| No access | "You don't have access to this presentation" | Suggest sharing settings |
| Token expired | "Your Google session expired" | Show re-authenticate button |
| Quota exceeded | "Google API limit reached. Try again in a few minutes" | Retry with backoff |
| Network error | "Connection failed. Check your internet and try again" | Retry button |

## File Structure

```
src/
├── components/
│   └── media/
│       └── GoogleSlidesImportDialog.tsx   # Main import dialog
├── hooks/
│   └── useGoogleAuth.ts                   # Google OAuth hook
├── lib/
│   └── google-slides.ts                   # API wrapper functions
└── types/
    └── google.ts                          # Google API types
```

## New Dependencies

```bash
pnpm add @react-oauth/google
```

No additional Google API client library needed - we'll use fetch() directly with the REST API.

## Implementation Tasks

1. **Google Cloud Setup** (manual)
   - Create project in Google Cloud Console
   - Enable Slides API and Drive API
   - Configure OAuth consent screen
   - Create OAuth client ID
   - Add environment variable

2. **Authentication Layer**
   - Add GoogleOAuthProvider to App.tsx
   - Create useGoogleAuth hook
   - Handle token management

3. **Import Dialog**
   - URL input and parsing
   - Connect to Google button
   - Presentation preview
   - Folder name input
   - Progress indicator

4. **API Integration**
   - Fetch presentation metadata
   - Get slide thumbnails
   - Download images
   - Upload to Supabase

5. **Slides Page Integration**
   - Add import button to Slides.tsx
   - Wire up dialog

## Security Considerations

- Access tokens are never persisted to storage
- Tokens are only used for the current import session
- Users must explicitly grant permission via Google's OAuth UI
- Only read-only scopes requested
- No refresh tokens stored (pure client-side flow)

## Future Enhancements (Not in Scope)

- Import speaker notes as slide descriptions
- Re-sync with source presentation
- Support for public presentations without auth
- Batch import multiple presentations
- Import from PowerPoint files

## Questions for Review

1. Should we persist Google auth for convenience, or re-authenticate each time for security?
2. Max slides per import? (suggest 100 as limit)
3. Should we detect and warn about slides with animations/videos?
