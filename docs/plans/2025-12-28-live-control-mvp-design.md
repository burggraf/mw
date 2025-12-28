# Live Control MVP Design

**Date:** 2025-12-28
**Status:** Ready for Implementation

## Overview

Build a minimal live presentation control system where a controller operator can select songs from an event's setlist and navigate slides, with changes appearing instantly on a display device.

## Scope (MVP)

- Single controller → single display
- Song selection from event's setlist
- One slide per section (verse/chorus)
- Use song's defined background image
- Mode selection from home screen
- Support Tauri ↔ Tauri (TCP) and Web ↔ Tauri (WebSocket relay)

## Architecture

### Pages

| Route | Purpose |
|-------|---------|
| `/live/controller` | Operator control surface |
| `/live/display` | Fullscreen rendering |

### Transport Matrix

| Path | Controller | Display | Transport |
|------|------------|---------|-----------|
| A | Tauri | Tauri | Direct TCP (3011) |
| B | Web | Tauri | Via signaling WebSocket (3010) |
| C | Tauri | Web | Via signaling WebSocket (3010) |
| D | Web | Web | Via signaling WebSocket (3010) |

## Controller UI

**Layout:**
- Top bar: Event dropdown (left), Peers status (right)
- Main area split 60/40:
  - **Left**: Large slide preview
  - **Right**: Setlist and controls

**Setlist panel:**
- Song list from current event (click to select)
- Active song indicator
- Slide navigator: section buttons (Verse 1, Chorus, Verse 2...)
- Jump to section buttons

**Controls:**
- Previous/Next buttons (keyboard: ←/→)
- Slide counter: "Slide 3 of 8"

**Connection status:**
- Green dot = connected
- Yellow = searching
- Red = disconnected (with retry)

## Display UI

- Full viewport (`100vh`, `100vw`)
- Background image with `object-fit: cover`
- Centered text with shadow
- Small connection indicator (bottom-right, fades after 5s)
- Crossfade transition (300ms)
- "Waiting for controller..." loading state

## Data Flow

**Controller sends slide change:**
```
User clicks "Next"
  → updateLiveState({ slideIndex: current + 1 })
  → send_control_message(displayId, { type: 'slide', eventId, itemId, slideIndex })
  → [TCP P2P or WebSocket relay]
  → Display receives → renders new slide
```

**Display receives message:**
```
webrtc:data_received event
  → parse BroadcastMessage
  → if type === 'slide': fetchSong(itemId), parseSlides(), render
```

## New Components

```
src/pages/live/
  ├── Controller.tsx
  └── Display.tsx

src/components/live/
  ├── SlidePreview.tsx
  ├── SetlistPicker.tsx
  ├── SlideNavigator.tsx
  └── ControlButtons.tsx

src/lib/
  └── slide-generator.ts    # Parse markdown → Slide[]
```

## Existing Dependencies

- `useWebRTC` hook - peer connection, events
- `send_control_message` - TCP P2P + signaling relay
- `webrtc:data_received` event - message delivery
- Song/Event/Media types and services

## Implementation Order

1. Create slide-generator.ts (parse markdown → slides)
2. Create Display page (render slides + backgrounds)
3. Create Controller page (event/setlist selection + navigation)
4. Add routes and home screen buttons
5. Test end-to-end with TCP P2P
