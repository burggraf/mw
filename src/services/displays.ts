import { getSupabase } from '@/lib/supabase';
import type { Display, DisplayCreateInput, DisplayUpdateInput } from '@/types/display';

function rowToDisplay(row: any): Display {
  return {
    id: row.id,
    churchId: row.church_id,
    pairingCode: row.pairing_code,
    name: row.name,
    location: row.location,
    displayClass: row.display_class,
    deviceId: row.device_id,
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

export async function getDisplayByPairingCode(pairingCode: string): Promise<Display | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .select('*')
    .eq('pairing_code', pairingCode)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToDisplay(data);
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

export async function createDisplay(churchId: string, input: DisplayCreateInput): Promise<Display> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('displays')
    .insert({
      church_id: churchId,
      pairing_code: input.pairingCode,
      name: input.name,
      location: input.location,
      display_class: input.displayClass,
      device_id: input.deviceId,
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
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return rowToDisplay(data);
}

export async function deleteDisplay(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('displays')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateDisplayHeartbeat(pairingCode: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('displays')
    .update({
      is_online: true,
      last_seen_at: new Date().toISOString(),
    })
    .eq('pairing_code', pairingCode);

  if (error) throw error;
}

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

export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
