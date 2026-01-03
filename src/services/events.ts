import { getSupabase } from '@/lib/supabase'
import type {
  Event,
  EventInput,
  EventItem,
  EventItemWithData,
  EventItemType,
  EventItemCustomizations,
  EventFilter
} from '@/types/event'
import type { Media, SlideFolder } from '@/types/media'

// Convert database row to Event type
function rowToEvent(row: any): Event {
  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    description: row.description,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Convert database row to EventItem type
function rowToEventItem(row: any): EventItem {
  return {
    id: row.id,
    eventId: row.event_id,
    position: row.position,
    itemType: row.item_type,
    itemId: row.item_id,
    customizations: row.customizations || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ============================================================================
// Events CRUD
// ============================================================================

export async function getEvents(churchId: string, filter: EventFilter = 'upcoming'): Promise<Event[]> {
  const supabase = getSupabase()
  const now = new Date().toISOString()

  let query = supabase
    .from('events')
    .select('*')
    .eq('church_id', churchId)

  if (filter === 'upcoming') {
    query = query.gte('scheduled_at', now).order('scheduled_at', { ascending: true })
  } else {
    query = query.lt('scheduled_at', now).order('scheduled_at', { ascending: false })
  }

  const { data, error } = await query

  if (error) throw error
  return (data || []).map(rowToEvent)
}

export async function getEventById(id: string): Promise<Event | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return rowToEvent(data)
}

export async function createEvent(churchId: string, input: EventInput): Promise<Event> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('events')
    .insert({
      church_id: churchId,
      name: input.name,
      description: input.description || null,
      scheduled_at: input.scheduledAt,
    })
    .select()
    .single()

  if (error) throw error
  return rowToEvent(data)
}

export async function updateEvent(id: string, input: Partial<EventInput>): Promise<Event> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}
  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description || null
  if (input.scheduledAt !== undefined) updateData.scheduled_at = input.scheduledAt

  const { data, error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToEvent(data)
}

export async function deleteEvent(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function duplicateEvent(id: string, newScheduledAt: string): Promise<Event> {
  // Get original event
  const original = await getEventById(id)
  if (!original) throw new Error('Event not found')

  // Create new event
  const newEvent = await createEvent(original.churchId, {
    name: `${original.name} (Copy)`,
    description: original.description || undefined,
    scheduledAt: newScheduledAt,
  })

  // Copy items
  const items = await getEventItems(id)
  for (const item of items) {
    await addEventItem(newEvent.id, item.itemType, item.itemId, item.customizations)
  }

  return newEvent
}

// ============================================================================
// Event Items
// ============================================================================

// Helper to convert media database row to Media type
function rowToMedia(m: any): Media {
  return {
    id: m.id,
    churchId: m.church_id,
    name: m.name,
    type: m.type,
    mimeType: m.mime_type,
    storagePath: m.storage_path,
    thumbnailPath: m.thumbnail_path,
    fileSize: m.file_size,
    width: m.width,
    height: m.height,
    duration: m.duration,
    source: m.source,
    sourceId: m.source_id,
    sourceUrl: m.source_url,
    tags: m.tags || [],
    styleId: m.style_id,
    backgroundColor: m.background_color,
    category: m.category || 'background',
    folderId: m.folder_id,
    loopTime: m.loop_time,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }
}

export async function getEventItems(eventId: string): Promise<EventItemWithData[]> {
  const supabase = getSupabase()

  // Get items
  const { data: items, error } = await supabase
    .from('event_items')
    .select('*')
    .eq('event_id', eventId)
    .order('position', { ascending: true })

  if (error) throw error
  if (!items || items.length === 0) return []

  // Collect IDs by type
  const songIds = items.filter(i => i.item_type === 'song').map(i => i.item_id)
  const slideIds = items.filter(i => i.item_type === 'slide').map(i => i.item_id)
  const slideFolderIds = items.filter(i => i.item_type === 'slideFolder').map(i => i.item_id)

  // Fetch songs
  const songsMap: Record<string, any> = {}
  if (songIds.length > 0) {
    const { data: songs } = await supabase
      .from('songs')
      .select('*')
      .in('id', songIds)

    for (const song of songs || []) {
      songsMap[song.id] = song
    }
  }

  // Fetch individual slides (media)
  const slidesMap: Record<string, Media> = {}
  if (slideIds.length > 0) {
    const { data: slides } = await supabase
      .from('media')
      .select('*')
      .in('id', slideIds)

    for (const m of slides || []) {
      slidesMap[m.id] = rowToMedia(m)
    }
  }

  // Fetch slide folders with their slides
  const foldersMap: Record<string, SlideFolder & { slides: Media[] }> = {}
  if (slideFolderIds.length > 0) {
    // Fetch folders
    const { data: folders } = await supabase
      .from('slide_folders')
      .select('*')
      .in('id', slideFolderIds)

    // Fetch slides in these folders
    const { data: folderSlides } = await supabase
      .from('media')
      .select('*')
      .in('folder_id', slideFolderIds)
      .eq('category', 'slide')
      .order('created_at', { ascending: true })

    // Group slides by folder
    const slidesByFolder: Record<string, Media[]> = {}
    for (const m of folderSlides || []) {
      const folderId = m.folder_id
      if (!slidesByFolder[folderId]) slidesByFolder[folderId] = []
      slidesByFolder[folderId].push(rowToMedia(m))
    }

    // Map folders with their slides
    for (const f of folders || []) {
      foldersMap[f.id] = {
        id: f.id,
        churchId: f.church_id,
        name: f.name,
        description: f.description,
        defaultLoopTime: f.default_loop_time,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        slides: slidesByFolder[f.id] || [],
      }
    }
  }

  // Map items with resolved data
  return items.map(row => {
    const item = rowToEventItem(row)
    const result: EventItemWithData = { ...item }

    if (item.itemType === 'song' && songsMap[item.itemId]) {
      const s = songsMap[item.itemId]
      result.song = {
        id: s.id,
        churchId: s.church_id,
        title: s.title,
        author: s.author,
        copyrightInfo: s.copyright_info,
        ccliNumber: s.ccli_number,
        content: s.content,
        arrangements: s.arrangements || { default: [] },
        backgrounds: s.backgrounds || {},
        audienceBackgroundId: s.audience_background_id,
        stageBackgroundId: s.stage_background_id,
        lobbyBackgroundId: s.lobby_background_id,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }
    }

    if (item.itemType === 'slide' && slidesMap[item.itemId]) {
      result.slide = slidesMap[item.itemId]
    }

    if (item.itemType === 'slideFolder' && foldersMap[item.itemId]) {
      result.slideFolder = foldersMap[item.itemId]
    }

    return result
  })
}

export async function addEventItem(
  eventId: string,
  itemType: EventItemType,
  itemId: string,
  customizations: EventItemCustomizations = {}
): Promise<EventItem> {
  const supabase = getSupabase()

  // Get max position
  const { data: existing } = await supabase
    .from('event_items')
    .select('position')
    .eq('event_id', eventId)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0

  const { data, error } = await supabase
    .from('event_items')
    .insert({
      event_id: eventId,
      position: nextPosition,
      item_type: itemType,
      item_id: itemId,
      customizations,
    })
    .select()
    .single()

  if (error) throw error
  return rowToEventItem(data)
}

export async function updateEventItem(
  id: string,
  customizations: EventItemCustomizations
): Promise<EventItem> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('event_items')
    .update({ customizations })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToEventItem(data)
}

export async function removeEventItem(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('event_items')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function reorderEventItems(eventId: string, itemIds: string[]): Promise<void> {
  const supabase = getSupabase()

  // Update each item's position
  const updates = itemIds.map((id, index) =>
    supabase
      .from('event_items')
      .update({ position: index })
      .eq('id', id)
      .eq('event_id', eventId)
  )

  await Promise.all(updates)
}

// ============================================================================
// Helpers
// ============================================================================

export function getEventItemCount(items: EventItemWithData[]): { songs: number; slides: number } {
  return {
    songs: items.filter(i => i.itemType === 'song').length,
    slides: items.filter(i => i.itemType === 'slide' || i.itemType === 'slideFolder').length,
  }
}
