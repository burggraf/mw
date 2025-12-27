import type { SongSection, SongMetadata } from '@/lib/song-parser'

export interface Song {
  id: string
  churchId: string
  title: string
  author: string | null
  copyrightInfo: string | null
  ccliNumber: string | null
  content: string
  arrangements: SongArrangements
  backgrounds: SongBackgrounds
  audienceBackgroundId: string | null
  stageBackgroundId: string | null
  lobbyBackgroundId: string | null
  createdAt: string
  updatedAt: string
}

export interface SongArrangements {
  default: string[]
  [key: string]: string[]  // Additional named arrangements
}

export interface SongBackgrounds {
  default?: string  // UUID reference to media
  stage?: string
  lobby?: string
  [key: string]: string | undefined  // Seasonal or custom contexts
}

// For creating/updating songs
export interface SongInput {
  title: string
  author?: string
  copyrightInfo?: string
  ccliNumber?: string
  content: string
  arrangements?: SongArrangements
  backgrounds?: SongBackgrounds
  audienceBackgroundId?: string
  stageBackgroundId?: string
  lobbyBackgroundId?: string
}

// Re-export parser types
export type { SongSection, SongMetadata }
