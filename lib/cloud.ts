import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chat } from './types';

const LIMIT = 50;

export async function fetchCloudChats(sb: SupabaseClient): Promise<Chat[]> {
  const { data, error } = await sb
    .from('chats')
    .select('id,title,model,messages,updated_at')
    .order('updated_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? 'New chat'),
    model: String(r.model ?? 'nameless-ai'),
    messages: Array.isArray(r.messages) ? r.messages : [],
    updatedAt: Date.parse(r.updated_at) || Date.now(),
  }));
}

export async function pushCloudChats(sb: SupabaseClient, userId: string, chats: Chat[]) {
  if (!chats.length) return;
  const rows = chats.map((c) => ({
    id: c.id,
    user_id: userId,
    title: c.title,
    model: c.model,
    messages: c.messages,
    updated_at: new Date(c.updatedAt).toISOString(),
  }));
  const { error } = await sb.from('chats').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteCloudChat(sb: SupabaseClient, id: string) {
  const { error } = await sb.from('chats').delete().eq('id', id);
  if (error) throw error;
}
