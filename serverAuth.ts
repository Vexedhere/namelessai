import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nzaelikbjumaidaombmp.supabase.co';

export type ServerUser = { id: string; email: string; name: string };

/** Pull the access token out of an `Authorization: Bearer <jwt>` header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

/** Verifies the Supabase session token. Returns null for guests / invalid tokens. */
export async function getServerUser(req: Request): Promise<ServerUser | null> {
  const token = bearerToken(req);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !anonKey) return null;
  try {
    const sb = createClient(SUPABASE_URL, anonKey);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const name = [meta.full_name, meta.name].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
    return { id: data.user.id, email: data.user.email ?? '', name: name?.trim() || (data.user.email ?? '').split('@')[0] };
  } catch {
    return null;
  }
}

/** Looks up the subscription tier (needs SUPABASE_SERVICE_ROLE_KEY). */
export async function getUserTier(userId: string): Promise<'FREE' | 'PLUS' | 'PRO'> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return 'FREE';
  try {
    const admin = createClient(SUPABASE_URL, serviceKey);
    const { data } = await admin.from('profiles').select('tier').eq('id', userId).maybeSingle();
    return data?.tier === 'PRO' || data?.tier === 'PLUS' ? data.tier : 'FREE';
  } catch {
    return 'FREE';
  }
}
