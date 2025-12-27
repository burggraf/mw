import { getSupabase } from '@/lib/supabase'
import type { Media, MediaInput, MediaFilters } from '@/types/media'

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getMedia(churchId: string, filters?: MediaFilters): Promise<Media[]> {
  const supabase = getSupabase()

  let query = supabase
    .from('media')
    .select('*')
    .eq('church_id', churchId)

  if (filters?.type) {
    query = query.eq('type', filters.type)
  }

  if (filters?.source) {
    query = query.eq('source', filters.source)
  }

  if (filters?.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags)
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
    })
    .select()
    .single()

  if (error) throw error
  return rowToMedia(data)
}

export async function updateMedia(id: string, input: { name?: string; tags?: string[] }): Promise<Media> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}

  if (input.name !== undefined) updateData.name = input.name
  if (input.tags !== undefined) updateData.tags = input.tags

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

  if (filters?.type) {
    dbQuery = dbQuery.eq('type', filters.type)
  }

  if (filters?.source) {
    dbQuery = dbQuery.eq('source', filters.source)
  }

  if (filters?.tags && filters.tags.length > 0) {
    dbQuery = dbQuery.contains('tags', filters.tags)
  }

  const { data, error } = await dbQuery
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data || []).map(rowToMedia)
}

export async function getAllTags(churchId: string): Promise<string[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('media')
    .select('tags')
    .eq('church_id', churchId)

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
