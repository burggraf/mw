// Live state managed by operator
export interface LiveState {
  eventId: string
  currentItemId: string | null
  currentSlideIndex: number
  isBlack: boolean
}

// Individual slide for rendering
export interface Slide {
  text: string
  sectionLabel?: string
  backgroundId?: string
}

// Broadcast message types
export type BroadcastMessage =
  | { type: 'slide'; eventId: string; itemId: string; slideIndex: number }
  | { type: 'black'; eventId: string; isBlack: boolean }

// Display class for future use
export type DisplayClass = 'audience' | 'stage' | 'lobby'

// Display component props
export interface DisplayProps {
  eventId: string
  displayClass?: DisplayClass
}

// Peer type for WebRTC
export type PeerType = 'controller' | 'display'
