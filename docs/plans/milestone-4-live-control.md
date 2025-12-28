# Milestone 4: Live Control

**Status:** Planning
**Prerequisites:** Milestone 0 (WebRTC Foundation), Milestone 1 (Songs)
**Depends On:** Milestone 0, Milestone 1, Milestone 3 (Events)

## Overview

Build the live presentation control system that allows operators to control what's displayed on audience, stage, and lobby screens in real-time. Operators use mobile devices (phones, tablets) as controllers while display hosts render the presentation.

## Goals

- [ ] Controller UI for selecting slides and controlling displays
- [ ] Display rendering for slides with backgrounds
- [ ] Real-time sync via WebRTC data channels
- [ ] Support for multiple display classes (audience, stage, lobby)
- [ ] Black screen functionality
- [ ] State recovery and resync

## Architecture

```
┌─────────────┐     WebRTC      ┌─────────────┐
│  Controller │ ◄──────────────► │   Display   │
│  (iOS/Mac)  │   Data Channel   │  (FireTV)   │
└─────────────┘                  └─────────────┘
       │                                 │
       │         ┌─────────────┐         │
       └─────────►   Leader    ◄─────────┘
                  (Signaling)
```

## Implementation Tasks

### Phase 1: Types & State Management

- [ ] Define `LiveState` interface (already in `src/types/live.ts`)
- [ ] Define `LiveControlMessage` types
- [ ] Define `Slide` interface
- [ ] Create `useLiveControl` hook for state management
- [ ] Integrate with existing WebRTC layer from Milestone 0

### Phase 2: Controller UI

- [ ] Create controller page component
  - [ ] Event selector (if multiple events active)
  - [ ] Current slide display
  - [ ] Slide navigation (next/previous)
  - [ ] Section selector (verse, chorus, bridge)
  - [ ] Black screen toggle
  - [ ] Connected displays indicator
  - [ ] Re-sync button

- [ ] Create slide preview component
  - [ ] Show current slide text
  - [ ] Show background thumbnail
  - [ ] Highlight active section

- [ ] Create displays status panel
  - [ ] List all connected displays
  - [ ] Show display class (audience/stage/lobby)
  - [ ] Show connection status
  - [ ] Show last sync time

### Phase 3: Display Rendering

- [ ] Create display page component
  - [ ] Full-screen slide rendering
  - [ ] Background image/video support
  - [ ] Text overlay with proper styling
  - [ ] Transitions between slides
  - [ ] Black screen state
  - [ ] Connection status indicator (debug)

- [ ] Implement slide generator
  - [ ] Parse song markdown
  - [ ] Extract slides by section
  - [ ] Apply formatting (lyrics styling)
  - [ ] Handle different text sizes

- [ ] Background management
  - [ ] Load background from media library
  - [ ] Apply to slide rendering
  - [ ] Support solid colors
  - [ ] Support gradients

### Phase 4: WebRTC Integration

- [ ] Extend WebRTC layer with live control messages
- [ ] Send slide changes from controller
- [ ] Send black screen toggle from controller
- [ ] Receive state changes on display
- [ ] Acknowledge message receipt
- [ ] Handle message retries
- [ ] Implement state resync on connection

### Phase 5: Display Class Support

- [ ] Audience display (full slides, backgrounds)
- [ ] Stage display (slides + notes, larger text)
- [ ] Lobby display (slides only, no sensitive content)
- [ ] Allow controller to toggle displays by class
- [ ] Support different backgrounds per display class

### Phase 6: Error Handling & Recovery

- [ ] Handle disconnection gracefully
- [ ] Auto-reconnect on network restore
- [ ] State resync on reconnection
- [ ] Show user-friendly error messages
- [ ] Offline mode indicator

### Phase 7: Polish & UX

- [ ] Smooth slide transitions
- [ ] Responsive controller UI
- [ ] Touch-friendly controls
- [ ] Keyboard shortcuts (desktop controller)
- [ ] Loading states
- [ ] Empty states

## Component Structure

```
src/
├── components/
│   ├── live/
│   │   ├── Controller.tsx          # Main controller UI
│   │   ├── Display.tsx             # Main display renderer
│   │   ├── SlidePreview.tsx        # Current slide preview
│   │   ├── SlideNavigator.tsx      # Next/prev controls
│   │   ├── SectionSelector.tsx     # Verse/chorus/bridge
│   │   ├── DisplayStatusPanel.tsx  # Connected displays list
│   │   └── BlackScreenToggle.tsx   # Black screen button
│   └── display/
│       ├── SlideRenderer.tsx       # Slide rendering component
│       └── BackgroundLayer.tsx     # Background handling
├── hooks/
│   ├── useLiveControl.ts           # Live state management
│   └── useLiveChannel.ts           # WebRTC live channel
├── lib/
│   └── slide-generator.ts          # Slide generation from markdown
└── routes/
    ├── live-controller.tsx         # Controller route
    └── live-display.tsx            # Display route
```

## Data Flow

```
Controller                          Display
     │                                  │
     │  1. User selects slide          │
     ▼                                  │
 LiveState updated                     │
     │                                  │
     │  2. Send via WebRTC             │
     ├─────────────────────────────────►│
     │     {type: "slide", ...}        │
     │                                  │
     │                        3. Render new slide
     │                                  │
     │  4. Acknowledge                  │
     │◀─────────────────────────────────┤
     │     {type: "ack"}                │
     ▼                                  │
 Show as synced                        ▼
                              Show new slide
```

## Testing Scenarios

- [ ] Single controller, single display
- [ ] Single controller, multiple displays (audience + stage)
- [ ] Multiple controllers (handoff test)
- [ ] Disconnect/reconnect controller
- [ ] Disconnect/reconnect display
- [ ] Leader change during live event
- [ ] Black screen toggle
- [ ] Rapid slide changes
- [ ] State resync after disconnect

## Success Criteria

1. Controller can select slides, changes appear on displays instantly (<100ms)
2. Multiple displays can be controlled independently
3. Black screen toggle works on all displays
4. Controller disconnection doesn't crash displays
5. Reconnection triggers state resync
6. Leader election doesn't interrupt active event

## Platform Targets

- [ ] macOS (controller and display)
- [ ] iOS (controller - pending build setup)
- [ ] FireTV (display - primary target)
- [ ] Android (controller - stretch)

## Related Documents

- [WebRTC Design](./2025-12-28-webrtc-design.md)
- [Milestone 0: WebRTC Foundation](./milestone-0-webrtc-foundation.md)
- [Milestone 1: Songs](./milestone-1-songs.md)

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Milestone 0 (WebRTC) | Required | Must complete first |
| Milestone 1 (Songs) | Required | Song content to display |
| Milestone 3 (Events) | Required | Event management |

## Estimated Work

- Core implementation: 1-2 weeks
- Testing and polish: 1 week
- Total: 2-3 weeks (after WebRTC foundation is complete)

## Future Enhancements (Out of Scope)

- Remote control via cloud signaling
- Recording and playback of live events
- Multi-song medley support
- Custom layouts and templates
- Stage display with notes/chords
- Countdown timers
- Alert overlays
