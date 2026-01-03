export type MediaCategory = 'background' | 'slide'

export interface SlideFolder {
  id: string
  churchId: string
  name: string
  description: string | null
  defaultLoopTime: number  // seconds to display each slide when looping, 0 = no loop
  createdAt: string
  updatedAt: string
}

export interface SlideFolderInput {
  name: string
  description?: string
  defaultLoopTime?: number  // defaults to 0 (no looping)
}

export interface Media {
  id: string
  churchId: string | null  // null for built-in media shared across all churches
  name: string
  type: 'image' | 'video'
  mimeType: string
  storagePath: string
  thumbnailPath: string | null
  fileSize: number
  width: number | null
  height: number | null
  duration: number | null
  source: 'upload' | 'pexels' | 'unsplash' | 'pixabay'
  sourceId: string | null
  sourceUrl: string | null
  tags: string[]
  styleId: string | null
  backgroundColor: string | null  // hex for solid colors, null for images/videos
  category: MediaCategory  // 'background' (behind lyrics) or 'slide' (standalone content)
  folderId: string | null  // optional folder for organizing slides
  loopTime: number | null  // per-slide loop time: null=use folder default, 0=stop, >0=override
  createdAt: string
  updatedAt: string
}

export interface MediaInput {
  name: string
  type: 'image' | 'video'
  mimeType: string
  storagePath: string
  thumbnailPath?: string
  fileSize: number
  width?: number
  height?: number
  duration?: number
  source?: 'upload' | 'pexels' | 'unsplash' | 'pixabay'
  sourceId?: string
  sourceUrl?: string
  tags?: string[]
  styleId?: string
  backgroundColor?: string
  category?: MediaCategory  // defaults to 'background'
  folderId?: string  // optional folder for slides
  loopTime?: number | null  // per-slide loop time: null=use folder default, 0=stop, >0=override
}

export interface MediaFilters {
  type?: 'image' | 'video'
  source?: 'upload' | 'pexels' | 'unsplash' | 'pixabay'
  tags?: string[]
  category?: MediaCategory
  folderId?: string | null  // null to filter for slides not in any folder
}

export interface StockMediaItem {
  id: string
  provider: 'pexels' | 'unsplash' | 'pixabay'
  thumbnailUrl: string
  previewUrl: string
  downloadUrl: string
  width: number
  height: number
  attribution: string
}

export interface StockSearchResult {
  results: StockMediaItem[]
  total: number
  page: number
}

// Check if media is a solid color background
export function isSolidColor(media: Media): boolean {
  return media.backgroundColor !== null
}

// Check if media is built-in (shared across all churches, not editable)
export function isBuiltInMedia(media: Media): boolean {
  return media.churchId === null
}
