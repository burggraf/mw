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

// Pre-cache media item for displays
export interface PrecacheMediaItem {
  mediaId: string
  url: string // Signed Supabase URL
  type: 'image' | 'video'
  expiresAt: number // Unix timestamp when URL expires
}

// Pre-cache song data for displays (includes backgrounds)
export interface PrecacheSongItem {
  songId: string
  title: string
  lyrics: string
  backgrounds: Record<string, string> // key -> mediaId
  updatedAt: string
}

// Pre-cache message sent to displays before event starts
export interface PrecacheMessage {
  churchId: string
  eventId: string
  media: PrecacheMediaItem[]
  songs: PrecacheSongItem[]
}

// Pre-cache status from display
export interface PrecacheStatus {
  mediaId: string
  status: 'downloading' | 'ready' | 'error'
  progress?: number // 0-100
  error?: string
}

// Pre-cache complete acknowledgment
export interface PrecacheAck {
  eventId: string
  ready: boolean
  statuses: PrecacheStatus[]
}

// Broadcast message types
export type BroadcastMessage =
  | { type: 'slide'; eventId: string; itemId: string; slideIndex: number }
  | { type: 'black'; eventId: string; isBlack: boolean }
  | { type: 'precache'; eventId: string; data: PrecacheMessage }
  | { type: 'precache_ack'; eventId: string; data: PrecacheAck }

// Display class for future use
export type DisplayClass = 'audience' | 'stage' | 'lobby'

// Display component props
export interface DisplayProps {
  eventId: string
  displayClass?: DisplayClass
}

// Peer type for WebRTC
export type PeerType = 'controller' | 'display'

// WebRTC Peer information
export interface PeerInfo {
  id: string
  peer_type: PeerType
  display_name: string
  is_connected: boolean
  is_leader: boolean
}

// Leader election status
export interface LeaderStatus {
  leaderId: string | null
  amILeader: boolean
  peerCount: number
}
