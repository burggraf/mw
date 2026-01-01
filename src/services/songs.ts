import { getSupabase } from '@/lib/supabase'
import { parseSong, songToMarkdown, generateDefaultArrangement } from '@/lib/song-parser'
import type { Song, SongInput, SongArrangements } from '@/types/song'

// Convert database row to Song type
function rowToSong(row: any): Song {
  return {
    id: row.id,
    churchId: row.church_id,
    title: row.title,
    author: row.author,
    copyrightInfo: row.copyright_info,
    ccliNumber: row.ccli_number,
    content: row.content,
    arrangements: row.arrangements,
    backgrounds: row.backgrounds,
    audienceBackgroundId: row.audience_background_id,
    stageBackgroundId: row.stage_background_id,
    lobbyBackgroundId: row.lobby_background_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getSongs(churchId: string): Promise<Song[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('church_id', churchId)
    .order('title')

  if (error) throw error
  return (data || []).map(rowToSong)
}

export async function getSong(id: string): Promise<Song | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null  // Not found
    throw error
  }

  return rowToSong(data)
}

export async function createSong(churchId: string, input: SongInput): Promise<Song> {
  const supabase = getSupabase()

  // Parse the content to extract sections for default arrangement
  const parsed = parseSong(input.content)
  const defaultArrangement = generateDefaultArrangement(parsed.sections)

  const arrangements: SongArrangements = input.arrangements || {
    default: defaultArrangement,
  }

  // If no default arrangement provided, use the parsed one
  if (!arrangements.default || arrangements.default.length === 0) {
    arrangements.default = defaultArrangement
  }

  const { data, error } = await supabase
    .from('songs')
    .insert({
      church_id: churchId,
      title: input.title,
      author: input.author || null,
      copyright_info: input.copyrightInfo || null,
      ccli_number: input.ccliNumber || null,
      content: input.content,
      arrangements,
      backgrounds: input.backgrounds || {},
      audience_background_id: input.audienceBackgroundId || null,
      stage_background_id: input.stageBackgroundId || null,
      lobby_background_id: input.lobbyBackgroundId || null,
    })
    .select()
    .single()

  if (error) throw error
  return rowToSong(data)
}

export async function updateSong(id: string, input: Partial<SongInput>): Promise<Song> {
  const supabase = getSupabase()

  const updateData: Record<string, any> = {}

  if (input.title !== undefined) updateData.title = input.title
  if (input.author !== undefined) updateData.author = input.author || null
  if (input.copyrightInfo !== undefined) updateData.copyright_info = input.copyrightInfo || null
  if (input.ccliNumber !== undefined) updateData.ccli_number = input.ccliNumber || null
  if (input.content !== undefined) {
    updateData.content = input.content
    // Re-parse to update arrangement if content changed
    const parsed = parseSong(input.content)
    const defaultArrangement = generateDefaultArrangement(parsed.sections)
    if (input.arrangements) {
      updateData.arrangements = input.arrangements
    } else {
      // Preserve existing arrangements but update default
      const { data: existing } = await supabase
        .from('songs')
        .select('arrangements')
        .eq('id', id)
        .single()
      if (existing) {
        updateData.arrangements = {
          ...existing.arrangements,
          default: defaultArrangement,
        }
      }
    }
  }
  if (input.arrangements !== undefined) updateData.arrangements = input.arrangements
  if (input.backgrounds !== undefined) updateData.backgrounds = input.backgrounds
  if (input.audienceBackgroundId !== undefined) updateData.audience_background_id = input.audienceBackgroundId || null
  if (input.stageBackgroundId !== undefined) updateData.stage_background_id = input.stageBackgroundId || null
  if (input.lobbyBackgroundId !== undefined) updateData.lobby_background_id = input.lobbyBackgroundId || null

  const { data, error } = await supabase
    .from('songs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToSong(data)
}

export async function deleteSong(id: string): Promise<void> {
  const supabase = getSupabase()

  const { error } = await supabase
    .from('songs')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function duplicateSong(id: string, newTitle?: string): Promise<Song> {
  const original = await getSong(id)
  if (!original) throw new Error('Song not found')

  // Parse and regenerate markdown with new title
  const parsed = parseSong(original.content)
  parsed.metadata.title = newTitle || `${original.title} (Copy)`

  const newContent = songToMarkdown({
    metadata: parsed.metadata,
    sections: parsed.sections,
  })

  return createSong(original.churchId, {
    title: parsed.metadata.title,
    author: original.author || undefined,
    copyrightInfo: original.copyrightInfo || undefined,
    ccliNumber: undefined,  // Don't copy CCLI number
    content: newContent,
    arrangements: original.arrangements,
    backgrounds: original.backgrounds,
    audienceBackgroundId: original.audienceBackgroundId || undefined,
    stageBackgroundId: original.stageBackgroundId || undefined,
    lobbyBackgroundId: original.lobbyBackgroundId || undefined,
  })
}

export async function searchSongs(churchId: string, query: string): Promise<Song[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('church_id', churchId)
    .or(`title.ilike.%${query}%,author.ilike.%${query}%,content.ilike.%${query}%`)
    .order('title')
    .limit(50)

  if (error) throw error
  return (data || []).map(rowToSong)
}

// Genius API types
export interface GeniusSong {
  id: number
  title: string
  artist: string
  albumArt: string
  url: string
}

export interface GeniusSearchResult {
  results: GeniusSong[]
}

export interface GeniusLyricsResult {
  lyrics: string | null
}

export async function searchGeniusSongs(query: string): Promise<GeniusSearchResult> {
  const supabase = getSupabase()

  const { data, error } = await supabase.functions.invoke('genius-search', {
    body: {
      action: 'search',
      query,
    },
  })

  if (error) throw error
  return data as GeniusSearchResult
}

export async function getGeniusLyrics(title: string, artist: string): Promise<GeniusLyricsResult> {
  const supabase = getSupabase()

  const { data, error } = await supabase.functions.invoke('genius-search', {
    body: {
      action: 'lyrics',
      title,
      artist,
    },
  })

  if (error) throw error
  return data as GeniusLyricsResult
}
