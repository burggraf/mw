import { getSupabase } from '@/lib/supabase'
import type { Media, MediaInput, MediaFilters, StockMediaItem, StockSearchResult, MediaCategory, SlideFolder, SlideFolderInput } from '@/types/media'
import { generateStoragePath, generateImageThumbnail } from '@/lib/media-utils'
import { rowToStyle } from './styles'
import type { Style } from '@/types/style'

// Convert database row to Media type
function rowToMedia(row: any): Media {
  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    type: row.type,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    duration: row.duration,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    tags: row.tags || [],
    styleId: row.style_id,
    backgroundColor: row.background_color,
    category: row.category || 'background',
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Convert database row to SlideFolder type
function rowToSlideFolder(row: any): SlideFolder {
  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getMedia(churchId: string, filters?: MediaFilters): Promise<Media[]> {
  const supabase = getSupabase()

  // Get church media and built-in media (church_id IS NULL)
  let query = supabase
    .from('media')
    .select('*')
    .or(`church_id.eq.${churchId},church_id.is.null`)

  // Filter by category (defaults to 'background' if not specified)
  if (filters?.category) {
    query = query.eq('category', filters.category)
  }

  if (filters?.type) {
    query = query.eq('type', filters.type)
  }

  if (filters?.source) {
    query = query.eq('source', filters.source)
  }

  if (filters?.tags && filters.tags.length > 0) {
    // Use cs (contains) operator with JSON array format for JSONB
    query = query.filter('tags', 'cs', JSON.stringify(filters.tags))
  }

  // Filter by folder - null means slides not in any folder
  if (filters?.folderId !== undefined) {
    if (filters.folderId === null) {
      query = query.is('folder_id', null)
    } else {
      query = query.eq('folder_id', filters.folderId)
    }
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(rowToMedia)
}

export async function getMediaById(id: string): Promise<Media | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('media')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  return rowToMedia(data)
}

export async function createMedia(churchId: string, input: MediaInput): Promise<Media> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('media')
    .insert({
      church_id: churchId,
      name: input.name,
      type: input.type,
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      thumbnail_path: input.thumbnailPath || null,
      file_size: input.fileSize,
      width: input.width || null,
      height: input.height || null,
      duration: input.duration || null,
      source: input.source || 'upload',
      source_id: input.sourceId || null,
      source_url: input.sourceUrl || null,
      tags: input.tags || [],
      style_id: input.styleId || null,
      background_color: input.backgroundColor || null,
      category: input.category || 'background',
      folder_id: input.folderId || null,
    })
    .select()
    .single()

  if (error) throw error
  return rowToMedia(data)
}

export async function updateMedia(id: string, input: { name?: string; tags?: string[]; folderId?: string | null }): Promise<Media> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}

  if (input.name !== undefined) updateData.name = input.name
  if (input.tags !== undefined) updateData.tags = input.tags
  if (input.folderId !== undefined) updateData.folder_id = input.folderId

  const { data, error } = await supabase
    .from('media')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToMedia(data)
}

export async function deleteMedia(id: string): Promise<void> {
  const supabase = getSupabase()

  // First, get the media to find storage paths
  const media = await getMediaById(id)
  if (!media) throw new Error('Media not found')

  // Delete storage files first
  const pathsToDelete: string[] = [media.storagePath]
  if (media.thumbnailPath) {
    pathsToDelete.push(media.thumbnailPath)
  }

  const { error: storageError } = await supabase.storage
    .from('media')
    .remove(pathsToDelete)

  if (storageError) {
    console.warn('Failed to delete storage files:', storageError)
    // Continue with DB deletion even if storage deletion fails
  }

  // Then delete the database record
  const { error } = await supabase
    .from('media')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function searchMedia(churchId: string, query: string, filters?: MediaFilters): Promise<Media[]> {
  const supabase = getSupabase()

  let dbQuery = supabase
    .from('media')
    .select('*')
    .eq('church_id', churchId)
    .ilike('name', `%${query}%`)

  // Filter by category
  if (filters?.category) {
    dbQuery = dbQuery.eq('category', filters.category)
  }

  if (filters?.type) {
    dbQuery = dbQuery.eq('type', filters.type)
  }

  if (filters?.source) {
    dbQuery = dbQuery.eq('source', filters.source)
  }

  if (filters?.tags && filters.tags.length > 0) {
    // Use cs (contains) operator with JSON array format for JSONB
    dbQuery = dbQuery.filter('tags', 'cs', JSON.stringify(filters.tags))
  }

  const { data, error } = await dbQuery
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data || []).map(rowToMedia)
}

export async function getAllTags(churchId: string, category?: MediaCategory): Promise<string[]> {
  const supabase = getSupabase()

  let query = supabase
    .from('media')
    .select('tags')
    .eq('church_id', churchId)

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) throw error

  // Extract unique tags from all media
  const tagsSet = new Set<string>()
  for (const row of data || []) {
    const tags = row.tags || []
    for (const tag of tags) {
      tagsSet.add(tag)
    }
  }

  return Array.from(tagsSet).sort()
}

export async function getMediaUsage(id: string): Promise<{ songIds: string[]; isUsed: boolean }> {
  const supabase = getSupabase()

  // Check if media is used in any song's backgrounds JSONB field
  // The backgrounds field stores media IDs as values
  const { data, error } = await supabase
    .from('songs')
    .select('id, backgrounds')
    .not('backgrounds', 'is', null)

  if (error) throw error

  const songIds: string[] = []

  for (const song of data || []) {
    const backgrounds = song.backgrounds || {}
    // Check if any background value matches the media ID
    const usesMedia = Object.values(backgrounds).some(value => value === id)
    if (usesMedia) {
      songIds.push(song.id)
    }
  }

  return {
    songIds,
    isUsed: songIds.length > 0,
  }
}

export function getMediaUrl(path: string): string {
  const supabase = getSupabase()
  const { data } = supabase.storage.from('media').getPublicUrl(path)
  return data.publicUrl
}

export async function getSignedMediaUrl(path: string, expiresIn: number = 3600): Promise<string> {
  const supabase = getSupabase()

  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data.signedUrl
}

export async function searchStockMedia(
  provider: 'pexels' | 'unsplash' | 'pixabay',
  query: string,
  options: { page?: number; perPage?: number; type?: 'image' | 'video' } = {}
): Promise<StockSearchResult> {
  const supabase = getSupabase()

  const { data, error } = await supabase.functions.invoke('stock-media-search', {
    body: {
      provider,
      query,
      page: options.page || 1,
      per_page: options.perPage || 20,
      type: options.type || 'image',
    },
  })

  if (error) throw error
  return data as StockSearchResult
}

export async function importStockMedia(
  churchId: string,
  item: StockMediaItem,
  category: MediaCategory = 'background'
): Promise<Media> {
  const supabase = getSupabase()

  // Download the media
  const response = await fetch(item.downloadUrl)
  if (!response.ok) throw new Error('Failed to download media')

  const blob = await response.blob()

  // Determine if this is a video based on mime type
  const isVideo = blob.type.startsWith('video/')
  const extension = isVideo ? 'mp4' : 'jpg'
  const file = new File([blob], `${item.id}.${extension}`, { type: blob.type })

  // Generate storage paths
  const storagePath = generateStoragePath(churchId, file.name)
  const thumbnailPath = generateStoragePath(churchId, `${item.id}.jpg`, true)

  let thumbnailBlob: Blob | null = null
  let thumbError: Error | null = null

  if (isVideo) {
    // For videos, download the thumbnail from the provider
    try {
      const thumbResponse = await fetch(item.thumbnailUrl)
      if (thumbResponse.ok) {
        thumbnailBlob = await thumbResponse.blob()
      }
    } catch (err) {
      console.error('Failed to download video thumbnail:', err)
      thumbError = err as Error
    }
  } else {
    // For images, generate thumbnail locally
    try {
      thumbnailBlob = await generateImageThumbnail(file)
    } catch (err) {
      console.error('Failed to generate thumbnail:', err)
      thumbError = err as Error
    }
  }

  // Upload original
  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(storagePath, blob)

  if (uploadError) throw uploadError

  // Upload thumbnail if we have one
  if (thumbnailBlob) {
    const { error: thumbUploadError } = await supabase.storage
      .from('media')
      .upload(thumbnailPath, thumbnailBlob)

    if (thumbUploadError) {
      console.error('Thumbnail upload failed:', thumbUploadError)
      thumbError = thumbUploadError
    }
  }

  // Create media record
  return createMedia(churchId, {
    name: item.attribution,
    type: isVideo ? 'video' : 'image',
    mimeType: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    storagePath,
    thumbnailPath: thumbError || !thumbnailBlob ? undefined : thumbnailPath,
    fileSize: blob.size,
    width: item.width,
    height: item.height,
    source: item.provider as 'pexels' | 'unsplash' | 'pixabay',
    sourceId: item.id,
    sourceUrl: item.downloadUrl,
    category,
  })
}

export async function updateMediaStyle(mediaId: string, styleId: string | null): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('media')
    .update({ style_id: styleId })
    .eq('id', mediaId)

  if (error) throw error
}

export async function getMediaWithStyle(mediaId: string): Promise<(Media & { style: Style | null }) | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('media')
    .select('*, styles(*)')
    .eq('id', mediaId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return {
    ...rowToMedia(data),
    style: data.styles ? rowToStyle(data.styles) : null,
  }
}

export async function createSolidColorBackground(
  churchId: string,
  name: string,
  color: string,
  styleId?: string,
  category: MediaCategory = 'background'
): Promise<Media> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('media')
    .insert({
      church_id: churchId,
      name,
      type: 'image',
      mime_type: 'application/x-color',
      storage_path: null,
      file_size: 0,
      source: 'upload',
      tags: ['color'],
      style_id: styleId || null,
      background_color: color,
      category,
    })
    .select()
    .single()

  if (error) throw error
  return rowToMedia(data)
}

// ============ Slide Folder Functions ============

export async function getSlideFolders(churchId: string): Promise<SlideFolder[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('slide_folders')
    .select('*')
    .eq('church_id', churchId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data || []).map(rowToSlideFolder)
}

export async function getSlideFolderById(id: string): Promise<SlideFolder | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('slide_folders')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  return rowToSlideFolder(data)
}

export async function createSlideFolder(churchId: string, input: SlideFolderInput): Promise<SlideFolder> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('slide_folders')
    .insert({
      church_id: churchId,
      name: input.name,
      description: input.description || null,
    })
    .select()
    .single()

  if (error) throw error
  return rowToSlideFolder(data)
}

export async function updateSlideFolder(id: string, input: Partial<SlideFolderInput>): Promise<SlideFolder> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}
  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description

  const { data, error } = await supabase
    .from('slide_folders')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToSlideFolder(data)
}

export async function deleteSlideFolder(id: string): Promise<void> {
  const supabase = getSupabase()

  // Note: Due to ON DELETE SET NULL, slides in this folder will have their folder_id set to null
  const { error } = await supabase
    .from('slide_folders')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function getSlidesInFolder(folderId: string): Promise<Media[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('media')
    .select('*')
    .eq('folder_id', folderId)
    .eq('category', 'slide')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(rowToMedia)
}

export async function moveSlideToFolder(slideId: string, folderId: string | null): Promise<Media> {
  return updateMedia(slideId, { folderId })
}
