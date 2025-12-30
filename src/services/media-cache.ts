import type { PrecacheMediaItem, PrecacheStatus, PrecacheSongItem } from '@/types/live'
import type { Song } from '@/types/song'

interface CachedMedia {
  mediaId: string
  blobUrl: string
  type: 'image' | 'video'
  expiresAt: number
}

interface CachedSong {
  song: Song
  updatedAt: string
}

// In-memory caches (shared across the app)
const mediaCache = new Map<string, CachedMedia>()
const songCache = new Map<string, CachedSong>()
const downloadProgress = new Map<string, PrecacheStatus>()

export function getMediaCache(): Map<string, CachedMedia> {
  return mediaCache
}

export function getSongCache(): Map<string, CachedSong> {
  return songCache
}

export function getCachedMediaUrl(mediaId: string): string | null {
  const cached = mediaCache.get(mediaId)
  if (!cached) return null

  // Check if expired
  if (Date.now() > cached.expiresAt) {
    URL.revokeObjectURL(cached.blobUrl)
    mediaCache.delete(mediaId)
    return null
  }

  return cached.blobUrl
}

export function getCachedSong(songId: string): Song | null {
  const cached = songCache.get(songId)
  return cached?.song || null
}

export function setCachedSong(song: Song, updatedAt: string): void {
  const existing = songCache.get(song.id)
  if (!existing || existing.updatedAt < updatedAt) {
    songCache.set(song.id, { song, updatedAt })
  }
}

export function getDownloadProgress(): Map<string, PrecacheStatus> {
  return downloadProgress
}

export function getAllStatuses(): PrecacheStatus[] {
  return Array.from(downloadProgress.values())
}

export function isAllMediaReady(mediaIds: string[]): boolean {
  return mediaIds.every(id => {
    const status = downloadProgress.get(id)
    return status?.status === 'ready'
  })
}

async function downloadMedia(item: PrecacheMediaItem): Promise<void> {
  const { mediaId, url, type, expiresAt } = item

  // Skip if already cached and not expired
  const existing = mediaCache.get(mediaId)
  if (existing && Date.now() < existing.expiresAt) {
    downloadProgress.set(mediaId, { mediaId, status: 'ready', progress: 100 })
    return
  }

  downloadProgress.set(mediaId, { mediaId, status: 'downloading', progress: 0 })

  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0

    if (total > 0 && response.body) {
      // Stream with progress
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        loaded += value.length

        const progress = Math.round((loaded / total) * 100)
        downloadProgress.set(mediaId, { mediaId, status: 'downloading', progress })
      }

      const blob = new Blob(chunks as BlobPart[], { type: type === 'video' ? 'video/mp4' : 'image/jpeg' })
      const blobUrl = URL.createObjectURL(blob)

      // Revoke old URL if exists
      if (existing) {
        URL.revokeObjectURL(existing.blobUrl)
      }

      mediaCache.set(mediaId, { mediaId, blobUrl, type, expiresAt })
      downloadProgress.set(mediaId, { mediaId, status: 'ready', progress: 100 })
    } else {
      // No content-length, just download
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      if (existing) {
        URL.revokeObjectURL(existing.blobUrl)
      }

      mediaCache.set(mediaId, { mediaId, blobUrl, type, expiresAt })
      downloadProgress.set(mediaId, { mediaId, status: 'ready', progress: 100 })
    }
  } catch (error) {
    console.error(`[MediaCache] Failed to download media ${mediaId}:`, error)
    downloadProgress.set(mediaId, {
      mediaId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Download failed',
    })
  }
}

export async function precacheMedia(
  items: PrecacheMediaItem[],
  onProgress?: (statuses: PrecacheStatus[]) => void
): Promise<PrecacheStatus[]> {
  console.log(`[MediaCache] Pre-caching ${items.length} media items`)

  // Download all in parallel with progress updates
  const promises = items.map(item => downloadMedia(item))

  // Periodic progress updates
  if (onProgress) {
    const interval = setInterval(() => {
      onProgress(getAllStatuses())
    }, 500)

    await Promise.all(promises)
    clearInterval(interval)
  } else {
    await Promise.all(promises)
  }

  const statuses = getAllStatuses()
  console.log(`[MediaCache] Pre-cache complete:`, statuses)
  return statuses
}

export function precacheSongs(songs: PrecacheSongItem[]): void {
  console.log(`[MediaCache] Caching ${songs.length} songs`)

  for (const item of songs) {
    const song: Song = {
      id: item.songId,
      churchId: '', // Will be set properly when used
      title: item.title,
      content: item.lyrics,
      author: null,
      copyrightInfo: null,
      ccliNumber: null,
      arrangements: { default: [] },
      backgrounds: item.backgrounds,
      audienceBackgroundId: null,
      stageBackgroundId: null,
      lobbyBackgroundId: null,
      createdAt: item.updatedAt,
      updatedAt: item.updatedAt,
    }

    setCachedSong(song, item.updatedAt)
  }
}

export function clearCache(): void {
  // Revoke all blob URLs
  for (const cached of mediaCache.values()) {
    URL.revokeObjectURL(cached.blobUrl)
  }

  mediaCache.clear()
  songCache.clear()
  downloadProgress.clear()
  console.log('[MediaCache] Cache cleared')
}

export function clearExpiredCache(): void {
  const now = Date.now()
  let cleared = 0

  for (const [mediaId, cached] of mediaCache.entries()) {
    if (now > cached.expiresAt) {
      URL.revokeObjectURL(cached.blobUrl)
      mediaCache.delete(mediaId)
      downloadProgress.delete(mediaId)
      cleared++
    }
  }

  if (cleared > 0) {
    console.log(`[MediaCache] Cleared ${cleared} expired items`)
  }
}
