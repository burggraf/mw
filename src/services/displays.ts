import { getSupabase } from '@/lib/supabase';
import type { Display, DisplayCreateInput, DisplayUpdateInput, DiscoveredDisplay } from '@/types/display';

function rowToDisplay(row: any): Display {
  return {
    id: row.id,
    churchId: row.church_id,
    displayId: row.display_id,
    deviceId: row.device_id,
    name: row.name,
    location: row.location,
    displayClass: row.display_class,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    width: row.width,
    height: row.height,
    physicalWidthCm: row.physical_width_cm,
    physicalHeightCm: row.physical_height_cm,
    platform: row.platform,
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

/**
 * Get a display by its display_id (per-display UUID from EDID)
 */
export async function getDisplayByDisplayId(displayId: string): Promise<Display | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('display_id', displayId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToDisplay(data);
}

/**
 * Get all displays belonging to a device
 * A device (laptop, computer) can have multiple displays attached
 */
export async function getDisplaysByDeviceId(deviceId: string): Promise<Display[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('device_id', deviceId)
    .order('name');

  if (error) throw error;
  return (data || []).map(rowToDisplay);
}

/**
 * @deprecated Use getDisplayByDisplayId instead
 * Get a single display by device_id (for backward compat with single-display devices)
 */
export async function getDisplayByDeviceId(deviceId: string): Promise<Display | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('device_id', deviceId)
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToDisplay(data);
}

/**
 * Create a new display from a discovered device
 * Upserts by display_id to handle IP changes
 */
export async function addDiscoveredDisplay(
  churchId: string,
  discovered: DiscoveredDisplay,
  input: Omit<DisplayCreateInput, 'displayId' | 'deviceId' | 'host' | 'port'>
): Promise<Display> {
  const supabase = getSupabase();

  if (!discovered.displayId) {
    throw new Error('Display ID is required for adding discovered displays');
  }

  // Generate a user-friendly name from the display name or service name
  const defaultName = input.name || discovered.displayName || discovered.name.replace('._mw-display._tcp.local.', '');

  const { data, error } = await supabase
    .from('displays')
    .upsert({
      church_id: churchId,
      display_id: discovered.displayId,
      device_id: discovered.deviceId || discovered.displayId, // Fall back to displayId if no deviceId
      name: defaultName,
      location: input.location || null,
      display_class: input.displayClass || 'audience',
      width: discovered.width || null,
      height: discovered.height || null,
      platform: discovered.platform || null,
      host: discovered.host,
      port: discovered.port,
      is_online: true,
      last_seen_at: new Date().toISOString(),
    }, {
      onConflict: 'display_id',
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
      display_id: input.displayId,
      device_id: input.deviceId,
      name: input.name,
      location: input.location || null,
      display_class: input.displayClass || 'audience',
      manufacturer: input.manufacturer || null,
      model: input.model || null,
      serial_number: input.serialNumber || null,
      width: input.width || null,
      height: input.height || null,
      physical_width_cm: input.physicalWidthCm || null,
      physical_height_cm: input.physicalHeightCm || null,
      platform: input.platform || null,
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

  // Only include defined fields in the update
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.displayClass !== undefined) updateData.display_class = input.displayClass;
  if (input.manufacturer !== undefined) updateData.manufacturer = input.manufacturer;
  if (input.model !== undefined) updateData.model = input.model;
  if (input.serialNumber !== undefined) updateData.serial_number = input.serialNumber;
  if (input.width !== undefined) updateData.width = input.width;
  if (input.height !== undefined) updateData.height = input.height;
  if (input.physicalWidthCm !== undefined) updateData.physical_width_cm = input.physicalWidthCm;
  if (input.physicalHeightCm !== undefined) updateData.physical_height_cm = input.physicalHeightCm;
  if (input.platform !== undefined) updateData.platform = input.platform;
  if (input.host !== undefined) updateData.host = input.host;
  if (input.port !== undefined) updateData.port = input.port;

  const { data, error } = await supabase
    .from('displays')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToDisplay(data);
}

/**
 * Update display's connection info (host, port) when discovered via mDNS
 * Uses a database function to bypass RLS (displays may not be authenticated)
 * Now uses display_id instead of device_id for per-display addressing
 */
export async function updateDisplayConnection(
  displayId: string,
  host: string,
  port: number
): Promise<void> {
  const supabase = getSupabase();

  // Use the database function which has SECURITY DEFINER to bypass RLS
  const { error } = await supabase.rpc('update_display_connection', {
    p_display_id: displayId,
    p_host: host,
    p_port: port,
  });

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
 * Now uses display_id for per-display tracking
 */
export async function updateDisplayHeartbeat(displayId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('displays')
    .update({
      is_online: true,
      last_seen_at: new Date().toISOString(),
    })
    .eq('display_id', displayId);

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
