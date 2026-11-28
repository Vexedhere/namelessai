import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getUserTier } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return NextResponse.json({ error: 'A valid browser session is required.' }, { status: 400 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: 'Usage pool is not configured.' }, { status: 503 });
  const user = await getServerUser(req);
  const tier = user ? await getUserTier(user.id) : 'FREE';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nzaelikbjumaidaombmp.supabase.co';
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('nl_model_pool_status', {
    p_user_id: user?.id ?? null,
    p_session_id: sessionId,
    p_tier: tier,
  });
  if (error) return NextResponse.json({ error: 'Could not load model usage.' }, { status: 503 });
  return NextResponse.json({ ...data, tier }, { headers: { 'Cache-Control': 'no-store' } });
}
