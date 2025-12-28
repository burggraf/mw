import type { Song } from './song'
import type { Media } from './media'

// Event type
export interface Event {
  id: string
  churchId: string
  name: string
  description: string | null
  scheduledAt: string
  createdAt: string
  updatedAt: string
}

// For creating/updating events
export interface EventInput {
  name: string
  description?: string
  scheduledAt: string
}

// Event item types (extensible for future content types)
export type EventItemType = 'song' | 'media' | 'scripture' | 'deck'

// Customizations for a song within an event
export interface EventItemCustomizations {
  arrangement?: string[]           // section IDs, overrides song default
  audienceBackgroundId?: string    // override song's audience background
  stageBackgroundId?: string       // override song's stage background
  lobbyBackgroundId?: string       // override song's lobby background
}

// Event item (base)
export interface EventItem {
  id: string
  eventId: string
  position: number
  itemType: EventItemType
  itemId: string
  customizations: EventItemCustomizations
  createdAt: string
  updatedAt: string
}

// Event item with resolved data (for UI)
export interface EventItemWithData extends EventItem {
  song?: Song
  media?: Media
}

// Event with items (for detail view)
export interface EventWithItems extends Event {
  items: EventItemWithData[]
}

// Filter options for event list
export type EventFilter = 'upcoming' | 'past'
