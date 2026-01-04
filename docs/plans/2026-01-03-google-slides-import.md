# Google Slides Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to import Google Slides presentations into the app by pasting a URL and authenticating with Google OAuth.

**Architecture:** React context-based Google OAuth provider wraps the app. A dialog component handles URL input, OAuth flow, presentation preview, and batch slide import. Each slide is exported as a 1600px PNG via Google's getThumbnail API, then uploaded to Supabase storage using the existing media pipeline.

**Tech Stack:** @react-oauth/google, Google Slides REST API, existing Supabase storage, React context

---

## Task 1: Install @react-oauth/google dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `pnpm add @react-oauth/google`

**Step 2: Verify installation**

Run: `pnpm list @react-oauth/google`
Expected: Shows @react-oauth/google with version number

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @react-oauth/google for Google Slides import"
```

---

## Task 2: Create Google OAuth types

**Files:**
- Create: `src/types/google.ts`

**Step 1: Create the types file**

```typescript
// Google Slides API types

export interface GooglePresentation {
  presentationId: string
  title: string
  slides: GoogleSlide[]
  pageSize: {
    width: { magnitude: number; unit: string }
    height: { magnitude: number; unit: string }
  }
}

export interface GoogleSlide {
  objectId: string
  slideProperties?: {
    layoutObjectId?: string
    masterObjectId?: string
  }
}

export interface GoogleThumbnail {
  contentUrl: string
  width: number
  height: number
}

export interface GoogleSlidesImportState {
  step: 'url' | 'authenticating' | 'loading' | 'preview' | 'importing' | 'complete' | 'error'
  url: string
  presentationId: string | null
  presentation: GooglePresentation | null
  folderName: string
  currentSlide: number
  totalSlides: number
  error: string | null
}
```

**Step 2: Commit**

```bash
git add src/types/google.ts
git commit -m "feat: add Google Slides API types"
```

---

## Task 3: Create Google Slides API utilities

**Files:**
- Create: `src/lib/google-slides.ts`

**Step 1: Create utility functions**

```typescript
/**
 * Extracts presentation ID from various Google Slides URL formats
 */
export function extractPresentationId(url: string): string | null {
  // Handle various URL formats:
  // https://docs.google.com/presentation/d/PRESENTATION_ID/edit
  // https://docs.google.com/presentation/d/PRESENTATION_ID/
  // https://docs.google.com/presentation/d/PRESENTATION_ID
  const patterns = [
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

/**
 * Fetches presentation metadata from Google Slides API
 */
export async function getPresentation(
  accessToken: string,
  presentationId: string
): Promise<{
  presentationId: string
  title: string
  slides: Array<{ objectId: string }>
}> {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Presentation not found. Check the URL and your access permissions.')
    }
    if (response.status === 403) {
      throw new Error('You do not have access to this presentation.')
    }
    throw new Error(`Failed to fetch presentation: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Fetches a slide thumbnail URL from Google Slides API
 */
export async function getSlideThumbnail(
  accessToken: string,
  presentationId: string,
  pageObjectId: string
): Promise<{ contentUrl: string; width: number; height: number }> {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}/pages/${pageObjectId}/thumbnail?thumbnailProperties.thumbnailSize=LARGE&thumbnailProperties.mimeType=PNG`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch slide thumbnail: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Downloads an image from a URL and returns it as a Blob
 */
export async function downloadImage(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`)
  }
  return response.blob()
}
```

**Step 2: Commit**

```bash
git add src/lib/google-slides.ts
git commit -m "feat: add Google Slides API utility functions"
```

---

## Task 4: Create Google OAuth context and provider

**Files:**
- Create: `src/contexts/GoogleAuthContext.tsx`

**Step 1: Create the context**

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useGoogleLogin, type TokenResponse } from '@react-oauth/google'

interface GoogleAuthContextType {
  accessToken: string | null
  isAuthenticated: boolean
  login: () => void
  logout: () => void
  error: string | null
}

const GoogleAuthContext = createContext<GoogleAuthContextType | null>(null)

export function useGoogleAuth() {
  const context = useContext(GoogleAuthContext)
  if (!context) {
    throw new Error('useGoogleAuth must be used within a GoogleAuthProvider')
  }
  return context
}

interface GoogleAuthProviderProps {
  children: ReactNode
}

export function GoogleAuthProvider({ children }: GoogleAuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const login = useGoogleLogin({
    onSuccess: (tokenResponse: TokenResponse) => {
      setAccessToken(tokenResponse.access_token)
      setError(null)
    },
    onError: (errorResponse) => {
      console.error('Google login failed:', errorResponse)
      setError('Failed to connect to Google. Please try again.')
      setAccessToken(null)
    },
    scope: 'https://www.googleapis.com/auth/presentations.readonly https://www.googleapis.com/auth/drive.readonly',
  })

  const logout = useCallback(() => {
    setAccessToken(null)
    setError(null)
  }, [])

  return (
    <GoogleAuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        login,
        logout,
        error,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  )
}
```

**Step 2: Commit**

```bash
git add src/contexts/GoogleAuthContext.tsx
git commit -m "feat: add Google OAuth context for Slides API access"
```

---

## Task 5: Add GoogleOAuthProvider to app entry point

**Files:**
- Modify: `src/main.tsx`

**Step 1: Add imports and provider**

In `src/main.tsx`, add the GoogleOAuthProvider from @react-oauth/google. Wrap it around the existing providers, but inside StrictMode.

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ConfigProvider } from './contexts/ConfigContext'
import { AuthProvider } from './contexts/AuthContext'
import { ChurchProvider } from './contexts/ChurchContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { GoogleAuthProvider } from './contexts/GoogleAuthContext'
import { AppRoutes } from './routes'
import './i18n'
import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <AuthProvider>
          <ChurchProvider>
            <GoogleOAuthProvider clientId={googleClientId}>
              <GoogleAuthProvider>
                <AppRoutes />
              </GoogleAuthProvider>
            </GoogleOAuthProvider>
          </ChurchProvider>
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  </StrictMode>
)
```

**Step 2: Commit**

```bash
git add src/main.tsx
git commit -m "feat: integrate Google OAuth provider into app"
```

---

## Task 6: Add i18n translations for Google Slides import

**Files:**
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add English translations**

Add a new `googleSlides` section to `en.json` inside the `slides` object:

```json
"googleSlides": {
  "import": "Import from Google Slides",
  "importDescription": "Paste a Google Slides URL to import all slides as images",
  "urlLabel": "Presentation URL",
  "urlPlaceholder": "https://docs.google.com/presentation/d/...",
  "connectGoogle": "Connect to Google",
  "reconnectGoogle": "Reconnect to Google",
  "disconnect": "Disconnect",
  "connectedAs": "Connected",
  "loadingPresentation": "Loading presentation...",
  "presentationTitle": "Presentation",
  "slideCount": "{{count}} slide",
  "slideCount_plural": "{{count}} slides",
  "folderNameLabel": "Folder Name",
  "importButton": "Import Slides",
  "importing": "Importing slide {{current}} of {{total}}...",
  "importComplete": "Import Complete",
  "importCompleteDescription": "Successfully imported {{count}} slides",
  "viewFolder": "View Folder",
  "errors": {
    "invalidUrl": "Please enter a valid Google Slides URL",
    "noAccess": "You don't have access to this presentation",
    "notFound": "Presentation not found. Check the URL.",
    "authFailed": "Failed to connect to Google. Please try again.",
    "importFailed": "Failed to import slide {{number}}",
    "quotaExceeded": "Google API limit reached. Try again in a few minutes.",
    "networkError": "Connection failed. Check your internet."
  }
}
```

**Step 2: Add Spanish translations**

Add the same structure to `es.json`:

```json
"googleSlides": {
  "import": "Importar de Google Slides",
  "importDescription": "Pega una URL de Google Slides para importar todas las diapositivas como imágenes",
  "urlLabel": "URL de la presentación",
  "urlPlaceholder": "https://docs.google.com/presentation/d/...",
  "connectGoogle": "Conectar con Google",
  "reconnectGoogle": "Reconectar con Google",
  "disconnect": "Desconectar",
  "connectedAs": "Conectado",
  "loadingPresentation": "Cargando presentación...",
  "presentationTitle": "Presentación",
  "slideCount": "{{count}} diapositiva",
  "slideCount_plural": "{{count}} diapositivas",
  "folderNameLabel": "Nombre de la carpeta",
  "importButton": "Importar diapositivas",
  "importing": "Importando diapositiva {{current}} de {{total}}...",
  "importComplete": "Importación completa",
  "importCompleteDescription": "Se importaron {{count}} diapositivas exitosamente",
  "viewFolder": "Ver carpeta",
  "errors": {
    "invalidUrl": "Por favor ingresa una URL válida de Google Slides",
    "noAccess": "No tienes acceso a esta presentación",
    "notFound": "Presentación no encontrada. Verifica la URL.",
    "authFailed": "Error al conectar con Google. Intenta de nuevo.",
    "importFailed": "Error al importar diapositiva {{number}}",
    "quotaExceeded": "Límite de API de Google alcanzado. Intenta en unos minutos.",
    "networkError": "Error de conexión. Verifica tu internet."
  }
}
```

**Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/es.json
git commit -m "feat: add i18n translations for Google Slides import"
```

---

## Task 7: Create GoogleSlidesImportDialog component

**Files:**
- Create: `src/components/media/GoogleSlidesImportDialog.tsx`

**Step 1: Create the dialog component**

```typescript
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle2, AlertCircle, Link2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useChurch } from '@/contexts/ChurchContext'
import { useGoogleAuth } from '@/contexts/GoogleAuthContext'
import { getSupabase } from '@/lib/supabase'
import { createMedia, createSlideFolder } from '@/services/media'
import {
  extractPresentationId,
  getPresentation,
  getSlideThumbnail,
  downloadImage,
} from '@/lib/google-slides'
import { generateStoragePath, generateImageThumbnail } from '@/lib/media-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'

interface GoogleSlidesImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (folderId: string) => void
}

type ImportStep = 'url' | 'preview' | 'importing' | 'complete'

interface PresentationInfo {
  id: string
  title: string
  slideCount: number
  slides: Array<{ objectId: string }>
}

export function GoogleSlidesImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: GoogleSlidesImportDialogProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const { accessToken, isAuthenticated, login } = useGoogleAuth()

  const [step, setStep] = useState<ImportStep>('url')
  const [url, setUrl] = useState('')
  const [presentation, setPresentation] = useState<PresentationInfo | null>(null)
  const [folderName, setFolderName] = useState('')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [totalSlides, setTotalSlides] = useState(0)
  const [createdFolderId, setCreatedFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const resetState = useCallback(() => {
    setStep('url')
    setUrl('')
    setPresentation(null)
    setFolderName('')
    setCurrentSlide(0)
    setTotalSlides(0)
    setCreatedFolderId(null)
    setError(null)
    setIsLoading(false)
  }, [])

  const handleClose = useCallback(() => {
    if (step !== 'importing') {
      resetState()
      onOpenChange(false)
    }
  }, [step, resetState, onOpenChange])

  const handleLoadPresentation = useCallback(async () => {
    if (!accessToken) {
      setError(t('slides.googleSlides.errors.authFailed'))
      return
    }

    const presentationId = extractPresentationId(url)
    if (!presentationId) {
      setError(t('slides.googleSlides.errors.invalidUrl'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await getPresentation(accessToken, presentationId)
      setPresentation({
        id: data.presentationId,
        title: data.title,
        slideCount: data.slides.length,
        slides: data.slides,
      })
      setFolderName(data.title)
      setStep('preview')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('slides.googleSlides.errors.networkError')
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, url, t])

  const handleImport = useCallback(async () => {
    if (!accessToken || !presentation || !currentChurch) return

    setStep('importing')
    setTotalSlides(presentation.slideCount)
    setCurrentSlide(0)
    setError(null)

    const supabase = getSupabase()

    try {
      // Create folder for the slides
      const folder = await createSlideFolder(currentChurch.id, {
        name: folderName || presentation.title,
      })
      setCreatedFolderId(folder.id)

      // Import each slide
      for (let i = 0; i < presentation.slides.length; i++) {
        setCurrentSlide(i + 1)
        const slide = presentation.slides[i]

        try {
          // Get thumbnail URL from Google
          const thumbnail = await getSlideThumbnail(
            accessToken,
            presentation.id,
            slide.objectId
          )

          // Download the image
          const imageBlob = await downloadImage(thumbnail.contentUrl)

          // Generate thumbnail for our app
          const file = new File([imageBlob], `slide-${i + 1}.png`, { type: 'image/png' })
          const thumbBlob = await generateImageThumbnail(file)

          // Upload original to Supabase
          const storagePath = generateStoragePath(currentChurch.id, file.name, false, 'image/png')
          const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(storagePath, imageBlob)

          if (uploadError) throw uploadError

          // Upload thumbnail
          const thumbnailPath = generateStoragePath(currentChurch.id, file.name, true)
          await supabase.storage.from('media').upload(thumbnailPath, thumbBlob)

          // Create media record
          await createMedia(currentChurch.id, {
            name: `Slide ${i + 1}`,
            type: 'image',
            mimeType: 'image/png',
            storagePath,
            thumbnailPath,
            fileSize: imageBlob.size,
            width: thumbnail.width,
            height: thumbnail.height,
            source: 'upload',
            category: 'slide',
            folderId: folder.id,
            tags: ['google-slides', presentation.title],
          })

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (slideError) {
          console.error(`Failed to import slide ${i + 1}:`, slideError)
          // Continue with remaining slides
        }
      }

      setStep('complete')
      toast.success(t('slides.googleSlides.importComplete'))
    } catch (err) {
      console.error('Import failed:', err)
      setError(err instanceof Error ? err.message : t('slides.googleSlides.errors.networkError'))
      setStep('preview')
    }
  }, [accessToken, presentation, currentChurch, folderName, t])

  const handleViewFolder = useCallback(() => {
    if (createdFolderId) {
      onSuccess?.(createdFolderId)
    }
    handleClose()
  }, [createdFolderId, onSuccess, handleClose])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('slides.googleSlides.import')}</DialogTitle>
          <DialogDescription>
            {t('slides.googleSlides.importDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: URL Input */}
        {step === 'url' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slides-url">{t('slides.googleSlides.urlLabel')}</Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="slides-url"
                  placeholder={t('slides.googleSlides.urlPlaceholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {!isAuthenticated ? (
              <Button onClick={() => login()} className="w-full">
                <LogIn className="h-4 w-4 mr-2" />
                {t('slides.googleSlides.connectGoogle')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handleLoadPresentation}
                  disabled={!url || isLoading}
                  className="flex-1"
                >
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isLoading ? t('slides.googleSlides.loadingPresentation') : t('common.next')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && presentation && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">{t('slides.googleSlides.presentationTitle')}</p>
              <p className="text-lg font-semibold">{presentation.title}</p>
              <p className="text-sm text-muted-foreground">
                {t('slides.googleSlides.slideCount', { count: presentation.slideCount })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-name">{t('slides.googleSlides.folderNameLabel')}</Label>
              <Input
                id="folder-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('url')}>
                {t('common.back')}
              </Button>
              <Button onClick={handleImport} className="flex-1">
                {t('slides.googleSlides.importButton')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                {t('slides.googleSlides.importing', {
                  current: currentSlide,
                  total: totalSlides,
                })}
              </p>
            </div>
            <Progress value={(currentSlide / totalSlides) * 100} />
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <p className="font-semibold">{t('slides.googleSlides.importComplete')}</p>
              <p className="text-sm text-muted-foreground">
                {t('slides.googleSlides.importCompleteDescription', { count: totalSlides })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleViewFolder} className="flex-1">
                {t('slides.googleSlides.viewFolder')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/media/GoogleSlidesImportDialog.tsx
git commit -m "feat: add Google Slides import dialog component"
```

---

## Task 8: Add Google Slides import button to Slides page

**Files:**
- Modify: `src/pages/Slides.tsx`

**Step 1: Import the dialog and add state**

Add to imports at top of file:
```typescript
import { GoogleSlidesImportDialog } from '@/components/media/GoogleSlidesImportDialog'
```

Add new icon import (add `FileDown` to existing lucide-react imports):
```typescript
import { Upload, Search, Sparkles, Filter, Folder, FileDown } from 'lucide-react'
```

Add state for the dialog:
```typescript
const [googleSlidesOpen, setGoogleSlidesOpen] = useState(false)
```

**Step 2: Add import button to header**

In the header buttons section (around line 239), add a new button before the Stock Media button:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setGoogleSlidesOpen(true)}
  className="flex-1 sm:flex-none"
>
  <FileDown className="h-4 w-4 sm:mr-2" />
  <span className="hidden sm:inline">{t('slides.googleSlides.import')}</span>
</Button>
```

**Step 3: Add the dialog component**

Add after the existing dialogs (around line 410):

```tsx
<GoogleSlidesImportDialog
  open={googleSlidesOpen}
  onOpenChange={setGoogleSlidesOpen}
  onSuccess={(folderId) => {
    setSelectedFolderId(folderId)
    loadMedia()
    loadFolders()
  }}
/>
```

**Step 4: Commit**

```bash
git add src/pages/Slides.tsx
git commit -m "feat: add Google Slides import button to Slides page"
```

---

## Task 9: Add environment variable placeholder

**Files:**
- Modify: `.env.example` (if exists) or create documentation

**Step 1: Document the required environment variable**

If `.env.example` exists, add:
```
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

If not, update the CLAUDE.md or README with setup instructions.

**Step 2: Commit**

```bash
git add .env.example 2>/dev/null || true
git commit -m "docs: add Google OAuth client ID environment variable" --allow-empty
```

---

## Task 10: Test the integration manually

**Files:** None (manual testing)

**Step 1: Ensure Google Cloud Console is configured**

Verify:
1. Google Cloud project exists
2. Google Slides API is enabled
3. Google Drive API is enabled
4. OAuth consent screen is configured
5. OAuth 2.0 Client ID exists with correct JavaScript origins

**Step 2: Add environment variable locally**

Create or update `.env.local`:
```
VITE_GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
```

**Step 3: Run the app and test**

Run: `pnpm dev`

Test flow:
1. Navigate to Slides page
2. Click "Import from Google Slides"
3. Paste a Google Slides URL
4. Click "Connect to Google"
5. Authorize the app
6. Verify presentation loads
7. Click Import
8. Verify slides appear in new folder

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Google Slides import feature"
```

---

## Summary

This implementation adds Google Slides import in 10 tasks:

1. **Dependency** - Install @react-oauth/google
2. **Types** - Create TypeScript interfaces
3. **API Utils** - URL parsing and API calls
4. **Context** - Google OAuth state management
5. **App Entry** - Wire up providers
6. **i18n** - English and Spanish translations
7. **Dialog** - Main import UI component
8. **Integration** - Add to Slides page
9. **Config** - Environment variable documentation
10. **Testing** - Manual verification

Each task is a small, committable unit that can be implemented and tested independently.
