import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const str = (v: unknown, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const strip = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
function safeUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('Invalid URL.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP and HTTPS webpages can be read.');
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local') || /^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) throw new Error('Local/private URLs cannot be fetched.');
  return u;
}
async function webSearch(query: string) {
  if (!query) throw new Error('Search query is required.');
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  let res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NamelessAI/1.0)' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Search provider returned ${res.status}.`);
  let html = await res.text();
  let anchors = [...html.matchAll(/<a[^>]*class="[^"']*result__a[^"']*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  if (!anchors.length) {
    res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NamelessAI/1.0)' }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) { html = await res.text(); anchors = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].filter((m) => /^https?:\/\//i.test(decode(m[1]))); }
  }
  const results = anchors.slice(0, 8).map((match) => {
    let href = decode(match[1]);
    try { const u = new URL(href); if (u.hostname.includes('duckduckgo.com') && u.searchParams.has('uddg')) href = u.searchParams.get('uddg') || href; } catch {}
    const tail = html.slice(match.index || 0, (match.index || 0) + 1800);
    const snippet = /class="[^"']*result__snippet[^"']*"[^>]*>([\s\S]*?)<\/[^>]+>/i.exec(tail);
    return { title: strip(match[2]), url: href, snippet: strip(snippet?.[1] || '') };
  }).filter((x): x is {title:string;url:string;snippet:string} => !!x && !!x.title && /^https?:\/\//i.test(x.url));
  if (!results.length) throw new Error('Search provider returned no readable results. Try a more specific query.');
  return results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n');
}
async function readPage(raw: string) {
  const url = safeUrl(raw);
  const res = await fetch(url.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NamelessAI/1.0)', Accept: 'text/html,application/xhtml+xml,text/plain' }, redirect: 'manual', signal: AbortSignal.timeout(18_000) });
  if (res.status >= 300 && res.status < 400) throw new Error('This page redirects; open the destination URL directly.');
  if (!res.ok) throw new Error(`Page returned HTTP ${res.status}.`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html') && !type.includes('text/plain') && !type.includes('application/xhtml')) throw new Error(`This page is not readable text (${type}).`);
  const body = await res.text();
  const text = type.includes('text/plain') ? body : strip(body);
  if (!text) throw new Error('No readable text found on that page.');
  return `Source: ${url}\n\n${text.slice(0, 16_000)}`;
}
async function tool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'web_search': return webSearch(str(args.query, 300));
    case 'read_webpage': return readPage(str(args.url, 2000));
    case 'wikipedia_summary': {
      const topic = str(args.topic, 200); if (!topic) throw new Error('Topic is required.');
      const search = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json`, { headers: { 'User-Agent': 'NamelessAI/1.0' }, signal: AbortSignal.timeout(12_000) });
      const data = await search.json(); const title = data?.query?.search?.[0]?.title; if (!title) throw new Error('No Wikipedia article found.');
      const page = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { 'User-Agent': 'NamelessAI/1.0' }, signal: AbortSignal.timeout(12_000) });
      const p = await page.json(); return `${p.title}\n${p.extract || 'No summary available.'}\nSource: ${p.content_urls?.desktop?.page || ''}`;
    }
    case 'define_word': {
      const word = str(args.word, 100); if (!word) throw new Error('Word is required.');
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(12_000) });
      if (!r.ok) throw new Error('Definition not found.'); const data = await r.json();
      return (data || []).flatMap((entry: any) => (entry.meanings || []).map((m: any) => `${entry.word} (${m.partOfSpeech || 'word'}): ${(m.definitions || []).slice(0, 3).map((d: any) => d.definition).join('; ')}`)).join('\n');
    }
    case 'get_weather': {
      const place = str(args.location, 100); if (!place) throw new Error('Location is required.');
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(12_000) }); const gd = await geo.json(); const loc = gd?.results?.[0]; if (!loc) throw new Error('Location not found.');
      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`, { signal: AbortSignal.timeout(12_000) }); const d = await w.json();
      return `${loc.name}, ${loc.country}: ${JSON.stringify(d.current)}\n3-day forecast: ${JSON.stringify(d.daily)}`;
    }
    case 'convert_currency': {
      const amount = Number(args.amount), from = str(args.from, 3).toUpperCase(), to = str(args.to, 3).toUpperCase(); if (!Number.isFinite(amount) || !from || !to) throw new Error('Amount and currency codes are required.');
      const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`, { signal: AbortSignal.timeout(12_000) }); const d = await r.json(); const rate = d?.rates?.[to]; if (!rate) throw new Error('Exchange rate unavailable.'); return `${amount} ${from} = ${(amount * rate).toFixed(2)} ${to} (rate ${rate}, date ${d.date}).`;
    }
    case 'get_crypto_price': {
      const coin = str(args.coin || args.symbol, 30).toLowerCase(); if (!coin) throw new Error('Coin name or symbol is required.');
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd,inr&include_24hr_change=true`, { signal: AbortSignal.timeout(12_000) }); const d = await r.json(); if (!d?.[coin]) throw new Error('Coin not found; use its CoinGecko ID.'); return JSON.stringify(d[coin]);
    }
    case 'get_news': return webSearch(`${str(args.topic, 200) || 'top'} latest news`);
    case 'country_info': {
      const country = str(args.country, 100); if (!country) throw new Error('Country is required.');
      const r = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,region,subregion,population,currencies,languages,flags`, { signal: AbortSignal.timeout(12_000) }); if (!r.ok) throw new Error('Country not found.'); return JSON.stringify(await r.json());
    }
    case 'public_holidays': {
      const year = Number(args.year) || new Date().getFullYear(), country = str(args.country_code || args.country, 2).toUpperCase(); if (!/^[A-Z]{2}$/.test(country)) throw new Error('Country must be a 2-letter ISO code.');
      const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, { signal: AbortSignal.timeout(12_000) }); if (!r.ok) throw new Error('Holiday calendar unavailable.'); const d = await r.json(); return (d || []).map((h: any) => `${h.date}: ${h.localName} (${h.name})`).join('\n') || 'No holidays found.';
    }
    default: throw new Error(`Unknown tool "${name}".`);
  }
}
export async function POST(req: NextRequest) {
  let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON request.' }, 400); }
  const name = str(body?.name, 80); const args = body?.args && typeof body.args === 'object' ? body.args : {};
  try { return json({ result: await tool(name, args) }); } catch (e) { return json({ error: e instanceof Error ? e.message : 'Tool failed.' }, 502); }
}
