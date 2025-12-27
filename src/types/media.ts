export interface Media {
  id: string
  churchId: string
  name: string
  type: 'image' | 'video'
  mimeType: string
  storagePath: string
  thumbnailPath: string | null
  fileSize: number
  width: number | null
  height: number | null
  duration: number | null
  source: 'upload' | 'pexels' | 'unsplash'
  sourceId: string | null
  sourceUrl: string | null
  tags: string[]
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
  source?: 'upload' | 'pexels' | 'unsplash'
  sourceId?: string
  sourceUrl?: string
  tags?: string[]
}

export interface MediaFilters {
  type?: 'image' | 'video'
  source?: 'upload' | 'pexels' | 'unsplash'
  tags?: string[]
}

export interface StockMediaItem {
  id: string
  provider: 'pexels' | 'unsplash'
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
