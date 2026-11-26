import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nzaelikbjumaidaombmp.supabase.co';

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

function positiveLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 10000) : fallback;
}

/**
 * Uses a Supabase RPC so limits are shared across serverless instances.
 * Fails closed: a public AI endpoint must not run without its persistent guard.
 */
export async function checkAiRateLimit(req: Request, userId?: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey || serviceKey === 'your_supabase_service_role_key_here') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for public AI rate limiting.');
  }

  const forwarded = req.headers.get('x-vercel-forwarded-for') || req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim().slice(0, 100) || 'unknown';
  const identity = userId ? `user:${userId}` : `guest:${ip}`;
  const isGuest = !userId;
  const minuteLimit = positiveLimit(isGuest ? 'AI_GUEST_RPM' : 'AI_USER_RPM', isGuest ? 6 : 12);
  const dayLimit = positiveLimit(isGuest ? 'AI_GUEST_RPD' : 'AI_USER_RPD', isGuest ? 40 : 120);

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const minuteKey = await digest(`minute:${identity}`);
  const minute = await admin.rpc('consume_ai_rate_limit', {
    p_bucket_key: minuteKey,
    p_window_seconds: 60,
    p_max_requests: minuteLimit,
  });
  if (minute.error) throw new Error('AI rate-limit database function is missing or unavailable.');
  if (minute.data !== true) return { allowed: false, retryAfterSeconds: 60 };

  const dayKey = await digest(`day:${identity}`);
  const day = await admin.rpc('consume_ai_rate_limit', {
    p_bucket_key: dayKey,
    p_window_seconds: 86400,
    p_max_requests: dayLimit,
  });
  if (day.error) throw new Error('AI rate-limit database function is missing or unavailable.');
  if (day.data !== true) return { allowed: false, retryAfterSeconds: 86400 };
  return { allowed: true, retryAfterSeconds: 0 };
}
