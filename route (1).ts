import { NextRequest } from 'next/server';
import { getServerUser } from '@/lib/serverAuth';
import { allowWebTool, runServerTool } from '@/lib/serverTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Server-side tools. The browser runs most tools itself (alarms, notes, ...); only
 * things that need a secret or server networking live here:
 *   - get_weather  (Open-Meteo, no key needed)
 *   - send_email   (Resend; signed-in users only; the client has ALREADY asked the user to confirm)
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// ── rate limit (best effort: per server instance) ──────────────────────────
const EMAIL_LIMIT = 10; // per user per hour
const sent = new Map<string, number[]>();
function allowEmail(userId: string) {
  const now = Date.now();
  const recent = (sent.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= EMAIL_LIMIT) {
    sent.set(userId, recent);
    return false;
  }
  recent.push(now);
  sent.set(userId, recent);
  return true;
}

// ── email ───────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max) : '');

async function sendEmail(req: NextRequest, args: Record<string, unknown>) {
  const user = await getServerUser(req);
  if (!user) return json({ code: 'auth_required', error: 'Sign in to send email from the app.' }, 401);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return json({ code: 'not_configured', error: 'Email sending is not configured on this server (RESEND_API_KEY / EMAIL_FROM).' }, 501);
  }

  const recipients = clean(args.to, 500)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length || recipients.length > 5 || !recipients.every((r) => EMAIL_RE.test(r))) {
    return json({ code: 'bad_request', error: 'Invalid recipient email address.' }, 400);
  }
  const subject = clean(args.subject, 200).replace(/[\r\n]+/g, ' ').trim();
  const text = clean(args.body, 10_000).trim();
  if (!subject || !text) return json({ code: 'bad_request', error: 'Subject and body are required.' }, 400);

  if (!allowEmail(user.id)) return json({ code: 'rate_limited', error: `Email limit reached (${EMAIL_LIMIT} per hour). Try again later.` }, 429);

  // Transparent sender identity: the user can't spoof someone else, and replies go to them.
  const footer = `\n\n—\nSent via Nameless Labs AI on behalf of ${user.name}${user.email ? ` <${user.email}>` : ''}.`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: recipients, subject, text: text + footer, ...(user.email ? { reply_to: user.email } : {}) }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!res) return json({ code: 'upstream', error: 'Could not reach the email provider.' }, 502);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = typeof detail?.message === 'string' ? detail.message : `Email provider error (${res.status}).`;
    return json({ code: 'upstream', error: msg }, res.status === 429 ? 429 : 502);
  }
  return json({ ok: true, to: recipients });
}

// ── weather ─────────────────────────────────────────────────────────────────
const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'heavy freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'violent showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};

async function getWeather(args: Record<string, unknown>) {
  const location = clean(args.location, 80).trim();
  if (!location) return json({ error: 'Which location?' }, 400);
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.split(',')[0])}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(10_000) },
    ).then((r) => r.json());
    const place = geo?.results?.[0];
    if (!place) return json({ result: `I couldn't find a place called "${location}".` });

    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`,
      { signal: AbortSignal.timeout(10_000) },
    ).then((r) => r.json());

    const c = w?.current;
    const d = w?.daily;
    if (!c || !d) return json({ error: 'Weather service returned no data.' }, 502);
    const desc = (code: number) => WMO[code] ?? 'mixed conditions';
    const days = (d.time as string[])
      .map((day, i) => `${day}: ${desc(d.weather_code[i])}, ${Math.round(d.temperature_2m_min[i])}–${Math.round(d.temperature_2m_max[i])}°C, ${d.precipitation_probability_max[i] ?? 0}% chance of rain`)
      .join('; ');
    const where = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
    return json({
      result:
        `${where}: now ${Math.round(c.temperature_2m)}°C (feels ${Math.round(c.apparent_temperature)}°C), ${desc(c.weather_code)}, ` +
        `humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h. Forecast — ${days}.`,
    });
  } catch {
    return json({ error: 'Could not reach the weather service.' }, 502);
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const { name, args } = (body ?? {}) as { name?: unknown; args?: unknown };
  const a = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
  if (name === 'send_email') return sendEmail(req, a);
  if (name === 'get_weather') return getWeather(a);
  if (typeof name === 'string') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!allowWebTool(ip)) return json({ error: 'Too many requests. Please slow down a little.' }, 429);
    const out = await runServerTool(name, a);
    if (out) return 'error' in out ? json({ error: out.error }, out.status ?? 500) : json({ result: out.result });
  }
  return json({ error: 'Unknown tool.' }, 404);
}
