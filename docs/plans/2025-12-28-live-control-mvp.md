# Live Control MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a minimal live presentation control system where a controller operator can select songs from an event's setlist and navigate slides, with changes appearing instantly on a display device.

**Architecture:** Two-page app with `/live/controller` (operator interface) and `/live/display` (fullscreen rendering). Controller sends slide changes via existing TCP P2P/WebSocket layer; display receives and renders. State flows one-way from controller to display.

**Tech Stack:** React 18, TypeScript, Tauri 2.0, Supabase, Tailwind CSS, Shadcn UI, existing WebRTC/TCP P2P layer

---

## Task 1: Create slide-generator.ts

**Files:**
- Create: `src/lib/slide-generator.ts`
- Test: Manual test in browser console

**Step 1: Create slide generator function**

```typescript
// src/lib/slide-generator.ts
import type { Song, SongSection } from '@/types/song'
import type { Slide } from '@/types/live'

/**
 * Parse song markdown content into slides
 * Each section (verse, chorus, etc.) becomes one slide
 */
export function generateSlides(song: Song): Slide[] {
  if (!song.content) return []

  const sections = parseMarkdownSections(song.content)
  const arrangement = song.arrangements?.default || getDefaultArrangement(sections)

  return arrangement.map(sectionLabel => {
    const section = sections.find(s => s.label === sectionLabel)
    return {
      text: section?.lyrics || '',
      sectionLabel: section?.label,
      backgroundId: song.audienceBackgroundId || undefined
    }
  })
}

/**
 * Parse markdown content into sections
 * Format: ## Verse 1\nlyrics here\n\n## Chorus\nmore lyrics
 */
function parseMarkdownSections(content: string): SongSection[] {
  const sections: SongSection[] = []
  const lines = content.split('\n')
  let currentLabel = 'Unknown'
  let currentLyrics: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/)
    if (headingMatch) {
      // Save previous section
      if (currentLyrics.length > 0) {
        sections.push({
          label: currentLabel,
          lyrics: currentLyrics.join('\n').trim()
        })
      }
      currentLabel = headingMatch[1].trim()
      currentLyrics = []
    } else if (line.trim()) {
      currentLyrics.push(line.trim())
    }
  }

  // Save last section
  if (currentLyrics.length > 0) {
    sections.push({
      label: currentLabel,
      lyrics: currentLyrics.join('\n').trim()
    })
  }

  return sections
}

/**
 * Get default arrangement (all sections in order)
 */
function getDefaultArrangement(sections: SongSection[]): string[] {
  return sections.map(s => s.label)
}

/**
 * Get section labels for navigation
 */
export function getSectionLabels(song: Song): string[] {
  return song.arrangements?.default || []
}
```

**Step 2: Commit**

```bash
git add src/lib/slide-generator.ts
git commit -m "feat: add slide generator for live control

Parse song markdown into slides, one per section."
```

---

## Task 2: Create Display page

**Files:**
- Create: `src/pages/live/Display.tsx`

**Step 1: Create Display component**

```typescript
// src/pages/live/Display.tsx
import { useEffect, useState } from 'react'
import { useWebRTC } from '@/hooks/useWebRTC'
import { generateSlides } from '@/lib/slide-generator'
import { getSong } from '@/services/songs'
import type { Slide, BroadcastMessage } from '@/types/live'
import type { Song } from '@/types/song'

export default function Display() {
  const { peers, startPeer } = useWebRTC()
  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [isWaiting, setIsWaiting] = useState(true)

  // Start as display
  useEffect(() => {
    startPeer('display')
  }, [])

  // Listen for slide changes from controller
  useEffect(() => {
    const handleMessage = (event: CustomEvent<{ message: string; from_peer_id: string }>) => {
      try {
        const msg: BroadcastMessage = JSON.parse(event.detail.message)
        if (msg.type === 'slide') {
          loadSlide(msg.itemId, msg.slideIndex)
          setIsWaiting(false)
        }
      } catch (e) {
        console.error('Failed to parse message:', e)
      }
    }

    window.addEventListener('webrtc:data_received', handleMessage as EventListener)
    return () => {
      window.removeEventListener('webrtc:data_received', handleMessage as EventListener)
    }
  }, [])

  const loadSlide = async (songId: string, slideIndex: number) => {
    const song = await getSong(songId)
    if (!song) return

    const slides = generateSlides(song)
    if (slideIndex >= 0 && slideIndex < slides.length) {
      setCurrentSlide(slides[slideIndex])

      // Load background
      if (song.audienceBackgroundId) {
        // TODO: Load from Supabase storage
        setBackgroundUrl(null)
      } else {
        setBackgroundUrl(null)
      }
    }
  }

  const connectedCount = peers.filter(p => p.is_connected && p.peer_type === 'controller').length

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      {/* Background */}
      {backgroundUrl ? (
        <img src={backgroundUrl} alt="" className="absolute inset-0 object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800" />
      )}

      {/* Slide content */}
      {currentSlide ? (
        <div className="relative z-10 max-w-5xl px-16 text-center">
          {currentSlide.sectionLabel && (
            <p className="text-white/70 text-lg mb-8 font-medium uppercase tracking-wider">
              {currentSlide.sectionLabel}
            </p>
          )}
          <p className="text-white text-5xl font-semibold leading-relaxed drop-shadow-lg whitespace-pre-line">
            {currentSlide.text}
          </p>
        </div>
      ) : (
        <div className="relative z-10 text-center">
          <div className="animate-pulse text-white/50 text-2xl">
            {isWaiting ? 'Waiting for controller...' : 'Loading...'}
          </div>
        </div>
      )}

      {/* Connection indicator */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full">
        <div className={`w-2 h-2 rounded-full ${connectedCount > 0 ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className="text-white/70 text-xs">
          {connectedCount > 0 ? 'Controller connected' : 'Connecting...'}
        </span>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/pages/live/Display.tsx
git commit -m "feat: add Display page for live control

Fullscreen rendering with slide preview, background support,
connection status indicator."
```

---

## Task 3: Create live components

**Files:**
- Create: `src/components/live/SlidePreview.tsx`
- Create: `src/components/live/SetlistPicker.tsx`
- Create: `src/components/live/SlideNavigator.tsx`
- Create: `src/components/live/ControlButtons.tsx`

**Step 1: Create SlidePreview component**

```typescript
// src/components/live/SlidePreview.tsx
import type { Slide } from '@/types/live'

interface SlidePreviewProps {
  slide: Slide | null
  backgroundUrl?: string | null
}

export function SlidePreview({ slide, backgroundUrl }: SlidePreviewProps) {
  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden relative flex items-center justify-center">
      {backgroundUrl ? (
        <img src={backgroundUrl} alt="" className="absolute inset-0 object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800" />
      )}
      {slide && (
        <div className="relative z-10 px-12 text-center max-w-2xl">
          {slide.sectionLabel && (
            <p className="text-white/70 text-sm mb-4 uppercase tracking-wider">
              {slide.sectionLabel}
            </p>
          )}
          <p className="text-white text-2xl font-semibold leading-relaxed whitespace-pre-line">
            {slide.text}
          </p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Create SetlistPicker component**

```typescript
// src/components/live/SetlistPicker.tsx
import type { Song } from '@/types/song'

interface SetlistPickerProps {
  songs: Song[]
  currentSongId: string | null
  onSelectSong: (songId: string) => void
}

export function SetlistPicker({ songs, currentSongId, onSelectSong }: SetlistPickerProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Setlist</h3>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {songs.map(song => (
          <button
            key={song.id}
            onClick={() => onSelectSong(song.id)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
              currentSongId === song.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            {song.title}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Create SlideNavigator component**

```typescript
// src/components/live/SlideNavigator.tsx
import { generateSlides, getSectionLabels } from '@/lib/slide-generator'
import type { Song } from '@/types/song'

interface SlideNavigatorProps {
  song: Song | null
  currentIndex: number
  onSelectSlide: (index: number) => void
}

export function SlideNavigator({ song, currentIndex, onSelectSlide }: SlideNavigatorProps) {
  if (!song) return null

  const labels = getSectionLabels(song)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Sections</h3>
      <div className="flex flex-wrap gap-2">
        {labels.map((label, index) => (
          <button
            key={label}
            onClick={() => onSelectSlide(index)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              index === currentIndex
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 4: Create ControlButtons component**

```typescript
// src/components/live/ControlButtons.tsx'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ControlButtonsProps {
  currentIndex: number
  totalSlides: number
  onPrevious: () => void
  onNext: () => void
}

export function ControlButtons({
  currentIndex,
  totalSlides,
  onPrevious,
  onNext
}: ControlButtonsProps) {
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="outline"
        size="lg"
        onClick={onPrevious}
        disabled={currentIndex <= 0}
      >
        <ChevronLeft className="h-5 w-5" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Slide {currentIndex + 1} of {totalSlides}
      </span>
      <Button
        variant="outline"
        size="lg"
        onClick={onNext}
        disabled={currentIndex >= totalSlides - 1}
      >
        Next
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add src/components/live/
git commit -m "feat: add live control components

Add SlidePreview, SetlistPicker, SlideNavigator, and ControlButtons
components for the controller interface."
```

---

## Task 4: Create Controller page

**Files:**
- Create: `src/pages/live/Controller.tsx`
- Modify: `src/hooks/useWebRTC.ts` - Add sendBroadcast helper if needed

**Step 1: Create Controller component**

```typescript
// src/pages/live/Controller.tsx
import { useState, useEffect, useCallback } from 'react'
import { useWebRTC } from '@/hooks/useWebRTC'
import { send_control_message } from '@/tauri'
import { getEventSongs } from '@/services/events'
import { getSong } from '@/services/songs'
import { generateSlides } from '@/lib/slide-generator'
import { SlidePreview } from '@/components/live/SlidePreview'
import { SetlistPicker } from '@/components/live/SetlistPicker'
import { SlideNavigator } from '@/components/live/SlideNavigator'
import { ControlButtons } from '@/components/live/ControlButtons'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import type { Song, Event } from '@/types'
import type { Slide } from '@/types/live'

export default function Controller() {
  const { user } = useAuth()
  const { peers, startPeer } = useWebRTC()
  const [events, setEvents] = useState<Event[]>([])
  const [currentEventId, setCurrentEventId] = useState<string | null>(null)
  const [setlist, setSetlist] = useState<Song[]>([])
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [slides, setSlides] = useState<Slide[]>([])

  // Start as controller
  useEffect(() => {
    startPeer('controller')
  }, [])

  // Load events on mount
  useEffect(() => {
    // TODO: Load user's events from Supabase
    // For now, mock data
    setEvents([
      { id: '1', name: 'Sunday Service', date: new Date().toISOString() } as Event
    ])
  }, [user])

  // Load setlist when event selected
  useEffect(() => {
    if (!currentEventId) return
    getEventSongs(currentEventId).then(setSetlist)
  }, [currentEventId])

  // Load song and generate slides
  useEffect(() => {
    if (!currentSong) return
    const generatedSlides = generateSlides(currentSong)
    setSlides(generatedSlides)
    setCurrentSlideIndex(0)
    sendSlideToDisplay(currentSong.id, 0)
  }, [currentSong])

  const sendSlideToDisplay = async (songId: string, slideIndex: number) => {
    const displayPeers = peers.filter(p => p.is_connected && p.peer_type === 'display')
    if (displayPeers.length === 0) return

    const message = JSON.stringify({
      type: 'slide',
      eventId: currentEventId,
      itemId: songId,
      slideIndex
    })

    for (const peer of displayPeers) {
      try {
        await send_control_message(peer.id, message, window as any)
      } catch (e) {
        console.error('Failed to send to display:', e)
      }
    }
  }

  const handleNext = useCallback(() => {
    if (currentSlideIndex < slides.length - 1) {
      const newIndex = currentSlideIndex + 1
      setCurrentSlideIndex(newIndex)
      if (currentSong) {
        sendSlideToDisplay(currentSong.id, newIndex)
      }
    }
  }, [currentSlideIndex, slides.length, currentSong])

  const handlePrevious = useCallback(() => {
    if (currentSlideIndex > 0) {
      const newIndex = currentSlideIndex - 1
      setCurrentSlideIndex(newIndex)
      if (currentSong) {
        sendSlideToDisplay(currentSong.id, newIndex)
      }
    }
  }, [currentSlideIndex, currentSong])

  const handleSelectSlide = useCallback((index: number) => {
    setCurrentSlideIndex(index)
    if (currentSong) {
      sendSlideToDisplay(currentSong.id, index)
    }
  }, [currentSong])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevious()
      if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrevious])

  const connectedDisplays = peers.filter(p => p.is_connected && p.peer_type === 'display').length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Live Control</h1>
            <Select value={currentEventId || ''} onValueChange={setCurrentEventId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {events.map(event => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectedDisplays > 0 ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-sm text-muted-foreground">
              {connectedDisplays} display{connectedDisplays !== 1 ? 's' : ''} connected
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Slide preview */}
          <div className="lg:col-span-2">
            <SlidePreview slide={slides[currentSlideIndex] || null} />
            <div className="mt-4">
              <ControlButtons
                currentIndex={currentSlideIndex}
                totalSlides={slides.length}
                onPrevious={handlePrevious}
                onNext={handleNext}
              />
            </div>
          </div>

          {/* Setlist and navigation */}
          <div className="space-y-6">
            <SetlistPicker
              songs={setlist}
              currentSongId={currentSong?.id || null}
              onSelectSong={async (songId) => {
                const song = await getSong(songId)
                setCurrentSong(song)
              }}
            />
            <SlideNavigator
              song={currentSong}
              currentIndex={currentSlideIndex}
              onSelectSlide={handleSelectSlide}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/pages/live/Controller.tsx
git commit -m "feat: add Controller page for live control

Event selection, setlist picker, slide navigation, keyboard shortcuts,
sends slide changes to displays via TCP P2P."
```

---

## Task 5: Add routes and home screen buttons

**Files:**
- Modify: `src/routes/index.tsx` (or wherever routes are defined)
- Modify: `src/pages/Home.tsx`

**Step 1: Add live routes**

Find the routes file and add:
```typescript
import Controller from '@/pages/live/Controller'
import Display from '@/pages/live/Display'

// Add to routes:
{ path: '/live/controller', element: <Controller /> },
{ path: '/live/display', element: <Display /> },
```

**Step 2: Add home screen buttons**

Update Home.tsx to add:
```typescript
import { Link } from 'react-router-dom'

// Add to home page, alongside existing cards:
<Link to="/live/controller">
  <Button size="lg" className="w-full">
    Controller
  </Button>
</Link>
<Link to="/live/display">
  <Button size="lg" variant="outline" className="w-full">
    Display
  </Button>
</Link>
```

**Step 3: Commit**

```bash
git add src/routes/ src/pages/Home.tsx
git commit -m "feat: add live control routes and home screen buttons

Add /live/controller and /live/display routes with entry points
from the home page."
```

---

## Task 6: Testing

**Step 1: Test Display page in browser**

```bash
pnpm dev
# Navigate to http://localhost:5173/live/display
# Verify: "Waiting for controller..." message shows
# Check: Connection indicator shows yellow (connecting)
```

**Step 2: Test Controller page in browser**

```bash
# Navigate to http://localhost:5173/live/controller
# Verify: Event selector shows
# Verify: "0 displays connected" initially
```

**Step 3: Test TCP P2P end-to-end**

```bash
# Terminal 1: Start display
MW_AUTO_MODE=display pnpm tauri:dev

# Terminal 2: Start controller
MW_AUTO_MODE=controller pnpm tauri:dev

# Verify:
# - Controller shows "1 display connected"
# - Display shows "Controller connected"
# - Controller navigation sends slides to display
# - Display renders slide text correctly
```

**Step 4: Document test results**

Update `docs/plans/webrtc-test-results.txt` with Live Control MVP test results.

**Step 5: Final commit**

```bash
git add docs/plans/webrtc-test-results.txt
git commit -m "test: document live control mvp test results"
```

---

## Notes

- Background loading from Supabase storage is stubbed (marked with TODO)
- Event loading uses mock data - connect to real Supabase when events schema is ready
- Keyboard shortcuts: Arrow Left/Right for Previous/Next
- Connection status updates in real-time via webrtc:peer_connected/disconnected events
- All slide changes are broadcast to all connected displays (future: target specific displays)
