import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return NextResponse.json({ error: 'A valid browser session is required.' }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nzaelikbjumaidaombmp.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) return NextResponse.json({ error: 'Usage service is not configured.' }, { status: 503 });
  const authorization = req.headers.get('authorization') || 'Bearer ' + anonKey;
  const response = await fetch(url + '/functions/v1/model-pool', {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', session_id: sessionId }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ error: 'Could not load model usage.' }));
  return NextResponse.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
}
