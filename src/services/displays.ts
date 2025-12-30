import { getSupabase } from '@/lib/supabase';
import type { Display, DisplayCreateInput, DisplayUpdateInput, DiscoveredDisplay } from '@/types/display';

function rowToDisplay(row: any): Display {
  return {
    id: row.id,
    churchId: row.church_id,
    name: row.name,
    location: row.location,
    displayClass: row.display_class,
    deviceId: row.device_id,
    host: row.host,
    port: row.port,
    isOnline: row.is_online,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDisplaysForChurch(churchId: string): Promise<Display[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('church_id', churchId)
    .order('name');

  if (error) throw error;
  return (data || []).map(rowToDisplay);
}

export async function getDisplayById(id: string): Promise<Display | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToDisplay(data);
}

export async function getDisplayByDeviceId(deviceId: string): Promise<Display | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('device_id', deviceId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToDisplay(data);
}

/**
 * Create a new display from a discovered device
 * Upserts by device_id to handle IP changes
 */
export async function addDiscoveredDisplay(
  churchId: string,
  discovered: DiscoveredDisplay,
  input: Omit<DisplayCreateInput, 'deviceId' | 'host' | 'port'>
): Promise<Display> {
  const supabase = getSupabase();

  if (!discovered.deviceId) {
    throw new Error('Device ID is required for adding discovered displays');
  }

  // Generate a user-friendly name from the service name if not provided
  const defaultName = input.name || discovered.name.replace('._mw-display._tcp.local.', '');

  const { data, error } = await supabase
    .from('displays')
    .upsert({
      church_id: churchId,
      device_id: discovered.deviceId,
      name: defaultName,
      location: input.location || null,
      display_class: input.displayClass || 'audience',
      host: discovered.host,
      port: discovered.port,
      is_online: true,
      last_seen_at: new Date().toISOString(),
    }, {
      onConflict: 'device_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToDisplay(data);
}

export async function createDisplay(churchId: string, input: DisplayCreateInput): Promise<Display> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .insert({
      church_id: churchId,
      name: input.name,
      location: input.location || null,
      display_class: input.displayClass || 'audience',
      device_id: input.deviceId,
      host: input.host || null,
      port: input.port || null,
      is_online: true,
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return rowToDisplay(data);
}

export async function updateDisplay(id: string, input: DisplayUpdateInput): Promise<Display> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .update({
      name: input.name,
      location: input.location,
      display_class: input.displayClass,
      host: input.host,
      port: input.port,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToDisplay(data);
}

/**
 * Update display's connection info (host, port) when discovered via mDNS
 */
export async function updateDisplayConnection(
  deviceId: string,
  host: string,
  port: number
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('displays')
    .update({
      host,
      port,
      is_online: true,
      last_seen_at: new Date().toISOString(),
    })
    .eq('device_id', deviceId);

  if (error) throw error;
}

export async function deleteDisplay(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('displays')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Mark a display as online (heartbeat)
 */
export async function updateDisplayHeartbeat(deviceId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('displays')
    .update({
      is_online: true,
      last_seen_at: new Date().toISOString(),
    })
    .eq('device_id', deviceId);

  if (error) throw error;
}

/**
 * Mark displays as offline if they haven't been seen recently
 */
export async function markStaleDisplaysOffline(churchId: string): Promise<void> {
  const supabase = getSupabase();
  const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();

  const { error } = await supabase
    .from('displays')
    .update({
      is_online: false,
    })
    .eq('church_id', churchId)
    .lt('last_seen_at', thirtySecondsAgo);

  if (error) throw error;
}
