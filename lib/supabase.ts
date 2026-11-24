import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client (Auth + chat sync).
 * The URL defaults to your project (nzaelikbjumaidaombmp); the anon/publishable key MUST be
 * provided as NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase → Project Settings → API).
 * It is safe to expose: data access is protected by Row Level Security (see supabase/schema.sql).
 */
const DEFAULT_URL = 'https://nzaelikbjumaidaombmp.supabase.co';

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  return client;
}
