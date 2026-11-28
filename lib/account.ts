import type { SupabaseClient } from '@supabase/supabase-js';

/** Everything about "how this user's AI looks and behaves". Saved per account, not per device. */
export type AccountSettings = {
  aiName: string | null;
  aiAvatar: string;
  theme: string;
  persona: string;
  model: string;
  voiceLang: string;
  agent: boolean;
  preferences?: Record<string, unknown>;
};

export type AccountRow = { settings: Partial<AccountSettings> | null; data: Record<string, unknown> };

export const cleanAiName = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/[^\p{L}\p{N} .'_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';

export async function fetchAccount(sb: SupabaseClient, userId: string): Promise<AccountRow> {
  const { data, error } = await sb
    .from('user_settings')
    .select('ai_name,ai_avatar,theme,persona,model,voice_lang,agent,data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { settings: null, data: {} };
  return {
    settings: {
      aiName: cleanAiName(data.ai_name) || null,
      aiAvatar: typeof data.ai_avatar === 'string' ? data.ai_avatar : 'sparkles',
      ...(data.theme ? { theme: String(data.theme) } : {}),
      ...(data.persona ? { persona: String(data.persona) } : {}),
      ...(data.model ? { model: String(data.model) } : {}),
      ...(data.voice_lang ? { voiceLang: String(data.voice_lang) } : {}),
      ...(typeof data.agent === 'boolean' ? { agent: data.agent } : {}),
      ...(data.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences) ? { preferences: data.preferences as Record<string, unknown> } : {}),
    },
    data: data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? (data.data as Record<string, unknown>) : {},
  };
}

export async function pushSettings(sb: SupabaseClient, userId: string, s: AccountSettings) {
  const { error } = await sb.from('user_settings').upsert(
    {
      user_id: userId,
      ai_name: s.aiName,
      ai_avatar: s.aiAvatar,
      theme: s.theme,
      persona: s.persona,
      model: s.model,
      voice_lang: s.voiceLang,
      agent: s.agent,
      preferences: s.preferences ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

export async function pushData(sb: SupabaseClient, userId: string, data: Record<string, unknown>) {
  const { error } = await sb
    .from('user_settings')
    .upsert({ user_id: userId, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
