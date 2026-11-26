import { NextRequest } from 'next/server';
import { DEFAULT_MODEL_ID, MODEL_IDS } from '@/lib/models';
import { TOOL_DEFS, agentSystemPrompt } from '@/lib/toolDefs';
import { ndjson, sanitizeMessages, sseToEventStream } from '@/lib/chatProtocol';
import { getServerUser, getUserTier } from '@/lib/serverAuth';
import { teamPrompt } from '@/lib/team';
import { PERSONAS, PERSONA_IDS } from '@/lib/personas';
import { APP_CODENAME, APP_VERSION_LABEL } from '@/lib/version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds (Vercel function limit)

/**
 * Nameless Labs tier -> OpenRouter model slug.
 *
 * Any slug can be overridden from Vercel Environment Variables without a code
 * change, e.g. MODEL_AETHER_PRO=anthropic/claude-sonnet-4.5
 * (variable name = "MODEL_" + tier id, upper-cased, dashes -> underscores).
 */
const DEFAULT_SLUGS: Record<string, string> = {
  'nameless-ai': 'qwen/qwen3-30b-a3b-instruct-2507',
  'pulse-nano': 'meta-llama/llama-3.2-3b-instruct',
  'lyric-flash': 'google/gemini-2.5-flash',
  'vega-mini': 'openai/gpt-4o-mini',
  'aether-pro': 'anthropic/claude-sonnet-5.5',
  'quasar-apex': 'deepseek/deepseek-r1-0528',
};

function resolveSlug(id: string): string {
  const envKey = `MODEL_${id.toUpperCase().replace(/-/g, '_')}`;
  return process.env[envKey]?.trim() || DEFAULT_SLUGS[id] || DEFAULT_SLUGS[DEFAULT_MODEL_ID];
}

const SYSTEM_PROMPT = `You are NamelessAI, an advanced AI assistant built by Mythical Studios for the Nameless Labs AI ecosystem. Your current version is ${APP_VERSION_LABEL} (codename ${APP_CODENAME}); say so whenever asked which version you are. You give direct, high-precision, well-structured answers. You are especially strong at clean modern software engineering (Next.js, TypeScript, Tailwind CSS, Supabase) and polished UI design. Use Markdown, put code in fenced code blocks with a language tag, and keep answers concise unless asked for depth.\n\n${teamPrompt()}`;


const MAX_TOKENS = Number(process.env.MAX_TOKENS) > 0 ? Number(process.env.MAX_TOKENS) : 4096;


function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function eventResponse(body: BodyInit, source: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Nameless-Source': source,
    },
  });
}

function friendlyUpstreamError(status: number, raw: string): string {
  let detail = '';
  try {
    const j = JSON.parse(raw);
    detail = j?.error?.message || j?.error || j?.message || '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch {
    detail = raw.slice(0, 200);
  }
  switch (status) {
    case 401:
      return 'OpenRouter rejected the API key. Check OPENROUTER_API_KEY in your Vercel Environment Variables.';
    case 402:
      return 'Your OpenRouter account is out of credits (or this model needs more than your balance allows).';
    case 404:
      return `OpenRouter could not find this model${detail ? ` (${detail})` : ''}. Override its slug with a MODEL_* environment variable.`;
    case 429:
      return 'This model is being rate-limited right now. Please wait a moment and try again.';
    default:
      return detail || `Upstream error (${status}).`;
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getServerUser(req);
  const userTier = authUser ? await getUserTier(authUser.id) : 'FREE';

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }

  const {
    messages: rawMessages,
    model: rawModel,
    userName: rawName,
    aiName: rawAiName,
    tools: rawTools,
    voice: rawVoice,
    persona: rawPersona,
    clientTime: rawTime,
  } = (body ?? {}) as Record<string, unknown>;
  const modelId = typeof rawModel === 'string' && MODEL_IDS.has(rawModel) ? rawModel : DEFAULT_MODEL_ID;
  const messages = sanitizeMessages(rawMessages);
  if (!messages) return jsonError('Send at least one non-empty user message.', 400);
  const requiredTier: 'FREE' | 'PLUS' | 'PRO' = modelId === 'quasar-apex' ? 'PRO' : modelId === 'aether-pro' ? 'PLUS' : 'FREE';
  if (requiredTier === 'PLUS' && userTier === 'FREE') return jsonError('A NamelessAI Plus subscription is required for this model. Upgrade at /tiers.', 403);
  if (requiredTier === 'PRO' && userTier !== 'PRO') return jsonError('A NamelessAI Pro subscription is required for this model. Upgrade at /tiers.', 403);

  const useTools = rawTools === true;
  // web_search is only offered when a search provider key is configured
  const activeTools = TOOL_DEFS.filter((t) => t.function.name !== 'web_search' || !!process.env.TAVILY_API_KEY?.trim());
  const voice = rawVoice === true;

  // Optional personalisation: the signed-in user's display name (sanitised, length-capped).
  const userName =
    typeof rawName === 'string' ? rawName.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60) : '';
// The name the user gave their AI (letters/numbers/spaces only, so it can't be used to inject instructions).
  const aiName =
    typeof rawAiName === 'string' ? rawAiName.replace(/[^\p{L}\p{N} .'_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
  const renamed = !!aiName && aiName.toLowerCase() !== 'namelessai';
  const base = renamed ? SYSTEM_PROMPT.replace('You are NamelessAI,', `You are ${aiName},`) : SYSTEM_PROMPT;
  let system = userName ? `${base}\n\nThe user's name is ${userName}. Address them by name only when natural.` : base;
  if (renamed) {
    system += `\n\nYOUR NAME: the user named you "${aiName}". Your name is ${aiName}. Use it when you introduce yourself or are asked who or what you are, and answer naturally when called by it. You run on NamelessAI technology from Mythical Studios; mention that only if asked what powers you.`;
  }

  if (typeof rawPersona === 'string' && PERSONA_IDS.has(rawPersona)) {
    const persona = PERSONAS.find((p) => p.id === rawPersona);
    if (persona?.prompt) system += `\n\n${persona.prompt}`;
  }

  if (useTools || voice) {
    const t = (rawTime ?? {}) as Record<string, unknown>;
    const nowIso = typeof t.iso === 'string' && /^[\w:.+\- ]{10,40}$/.test(t.iso) ? t.iso : new Date().toISOString();
    const timeZone = typeof t.tz === 'string' && /^[\w/+\-]{1,60}$/.test(t.tz) ? t.tz : 'UTC';
    system += '\n\n' + agentSystemPrompt({ tools: useTools, nowIso, timeZone, userName, userEmail: authUser?.email, voice });
  }
  const payloadMessages = [{ role: 'system', content: system }, ...messages];

  // 1) Optional: your own fine-tuned endpoint (Hugging Face / serverless) for NamelessAI.
  if (modelId === 'nameless-ai' && process.env.CUSTOM_MODEL_URL && !useTools) {
    try {
      const customRes = await fetch(process.env.CUSTOM_MODEL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CUSTOM_MODEL_TOKEN || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: payloadMessages, max_tokens: MAX_TOKENS }),
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(45_000)]),
      });
      if (customRes.ok) {
        const data = await customRes.json();
        const reply: unknown =
          data?.choices?.[0]?.message?.content ??
          (Array.isArray(data) ? data[0]?.generated_text : data?.generated_text);
        if (typeof reply === 'string' && reply.trim()) return eventResponse(ndjson({ type: 'text', text: reply }), 'custom');
      }
      console.warn('Custom model endpoint failed; falling back to OpenRouter.', customRes.status);
    } catch (err) {
      if (req.signal.aborted) return jsonError('Request cancelled.', 499);
      console.warn('Custom model endpoint error; falling back to OpenRouter.', err);
    }
  }

  // 2) OpenRouter (streaming)
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    return jsonError(
      'OPENROUTER_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.',
      500,
    );
  }

  const siteUrl =
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    'https://namelesslabs.ai';

  try {
    const primarySlug = resolveSlug(modelId);
    const fallbackSlugs = ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'];
    const slugsToTry = [primarySlug, ...fallbackSlugs.filter((slug) => slug !== primarySlug)];

    let upstream: Response | null = null;
    for (const slug of slugsToTry) {
      upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': siteUrl,
          'X-Title': 'Nameless Labs AI',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: slug,
          messages: payloadMessages,
          stream: true,
          max_tokens: MAX_TOKENS,
          ...(useTools ? { tools: activeTools, tool_choice: 'auto' } : {}),
        }),
        signal: req.signal,
      });

      // If a model ID is unavailable, automatically try a known fallback.
      if (upstream.status !== 404) break;
      console.warn(`OpenRouter model ${slug} returned 404; trying fallback.`);
    }

    if (!upstream || !upstream.ok || !upstream.body) {
      const status = upstream?.status ?? 502;
      const raw = upstream ? await upstream.text().catch(() => '') : '';
      return jsonError(friendlyUpstreamError(status, raw), status === 401 ? 502 : status);
    }

    return eventResponse(sseToEventStream(upstream.body), 'openrouter');
  } catch (err) {
    if (req.signal.aborted) return jsonError('Request cancelled.', 499);
    console.error('Chat API error:', err);
    return jsonError('Could not reach OpenRouter. Please try again.', 502);
  }
}
