import { getSupabase } from '@/lib/supabase';
import type { SongFolder, SongFolderInput } from '@/types/folder';
import type { Song } from '@/types/song';
import { rowToSong } from './songs';

// Convert database row to SongFolder type
function rowToSongFolder(row: any): SongFolder {
  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all song folders for a church
 */
export async function getSongFolders(churchId: string): Promise<SongFolder[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('song_folders')
    .select('*')
    .eq('church_id', churchId)
    .order('name');

  if (error) throw error;
  return (data || []).map(rowToSongFolder);
}

/**
 * Get a single song folder by ID
 */
export async function getSongFolder(folderId: string): Promise<SongFolder | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('song_folders')
    .select('*')
    .eq('id', folderId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return rowToSongFolder(data);
}

/**
 * Create a new song folder
 */
export async function createSongFolder(
  churchId: string,
  input: SongFolderInput
): Promise<SongFolder> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('song_folders')
    .insert({
      church_id: churchId,
      name: input.name,
      description: input.description || null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToSongFolder(data);
}

/**
 * Update an existing song folder
 */
export async function updateSongFolder(
  folderId: string,
  input: SongFolderInput
): Promise<SongFolder> {
  const supabase = getSupabase();

  // Build update object conditionally - only update fields that are provided
  const updateData: Record<string, any> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description || null;

  const { data, error } = await supabase
    .from('song_folders')
    .update(updateData)
    .eq('id', folderId)
    .select()
    .single();

  if (error) throw error;
  return rowToSongFolder(data);
}

/**
 * Delete a song folder (cascades to songs)
 */
export async function deleteSongFolder(folderId: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('song_folders')
    .delete()
    .eq('id', folderId);

  if (error) throw error;
}

/**
 * Get all songs in a specific folder
 */
export async function getSongsInFolder(folderId: string): Promise<Song[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('folder_id', folderId)
    .order('title');

  if (error) throw error;
  return (data || []).map(rowToSong);
}

/**
 * Move a single song to a folder (or null for "All Songs")
 */
export async function moveSongToFolder(
  songId: string,
  folderId: string | null
): Promise<Song> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('songs')
    .update({ folder_id: folderId })
    .eq('id', songId)
    .select()
    .single();

  if (error) throw error;
  return rowToSong(data);
}

/**
 * Bulk move songs to a folder
 */
export async function bulkMoveToFolder(
  songIds: string[],
  folderId: string | null
): Promise<void> {
  // Guard against empty array
  if (songIds.length === 0) return;

  const supabase = getSupabase();

  const { error } = await supabase
    .from('songs')
    .update({ folder_id: folderId })
    .in('id', songIds);

  if (error) throw error;
}

/**
 * Bulk delete songs
 */
export async function bulkDeleteSongs(songIds: string[]): Promise<void> {
  // Guard against empty array
  if (songIds.length === 0) return;

  const supabase = getSupabase();

  // Note: Songs store content as markdown text in the database, not as separate storage files.
  // Songs reference media (backgrounds) by UUID, but those media records are managed separately
  // and are not deleted when songs are deleted. This prevents accidental loss of shared media.
  const { error } = await supabase
    .from('songs')
    .delete()
    .in('id', songIds);

  if (error) throw error;
}
