import { getSupabase } from '@/lib/supabase'

export interface StructureSongLyricsRequest {
  title: string
  author: string
  lyrics: string
}

export interface StructureSongLyricsResponse {
  markdown: string
  sections: number
  fallback: boolean
}

/**
 * Structure song lyrics using AI-powered edge function.
 * Converts raw lyrics into markdown with section headers and slide-sized chunks.
 */
export async function structureSongLyrics(
  title: string,
  author: string,
  lyrics: string
): Promise<StructureSongLyricsResponse> {
  const supabase = getSupabase()

  const { data, error } = await supabase.functions.invoke('structure-song-lyrics', {
    body: {
      title,
      author,
      lyrics,
    },
  })

  if (error) {
    console.error('Failed to structure lyrics:', error)
    throw error
  }

  if (!data) {
    throw new Error('No data returned from structure-song-lyrics edge function')
  }

  return data as StructureSongLyricsResponse
}
