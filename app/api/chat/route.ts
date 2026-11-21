import { NextRequest } from 'next/server';
import { DEFAULT_MODEL_ID, MODEL_IDS } from '@/lib/models';

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
  'nameless-ai': 'qwen/qwen-2.5-72b-instruct',
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

const SYSTEM_PROMPT = `You are NamelessAI, an advanced AI assistant built by Mythical Studios for the Nameless Labs AI ecosystem. You give direct, high-precision, well-structured answers. You are especially strong at clean modern software engineering (Next.js, TypeScript, Tailwind CSS, Supabase) and polished UI design. Use Markdown, put code in fenced code blocks with a language tag, and keep answers concise unless asked for depth.`;

const MAX_MESSAGES = 40;
const MAX_CHARS_PER_MESSAGE = 32_000;
const MAX_TOKENS = Number(process.env.MAX_TOKENS) > 0 ? Number(process.env.MAX_TOKENS) : 4096;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function textResponse(body: BodyInit, source: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Nameless-Source': source,
    },
  });
}

function sanitizeMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const out: ChatMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== 'object') continue;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    if (!content.trim()) continue;
    out.push({ role, content: content.slice(0, MAX_CHARS_PER_MESSAGE) });
  }
  const trimmed = out.slice(-MAX_MESSAGES);
  // Most providers require the conversation to start with a user turn.
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();
  return trimmed.length ? trimmed : null;
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

/** Turns OpenRouter's SSE stream into a plain stream of text deltas. */
function sseToTextStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  let buffer = '';

  const handleLine = (line: string, controller: ReadableStreamDefaultController<Uint8Array>) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return false; // comments / keep-alives
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return false;
    try {
      const json = JSON.parse(payload);
      if (json?.error) {
        const msg = typeof json.error === 'string' ? json.error : json.error.message || 'Model error';
        controller.enqueue(encoder.encode(`\n\n> ⚠️ ${msg}`));
        return true;
      }
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length) {
        controller.enqueue(encoder.encode(delta));
        return true;
      }
    } catch {
      /* ignore partial / malformed chunk */
    }
    return false;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Keep reading until we emit something (or finish), otherwise the
        // stream could stall waiting for another pull that never comes.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer) handleLine(buffer, controller);
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          let emitted = false;
          for (const line of lines) emitted = handleLine(line, controller) || emitted;
          if (emitted) return;
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }

  const { messages: rawMessages, model: rawModel } = (body ?? {}) as Record<string, unknown>;
  const modelId = typeof rawModel === 'string' && MODEL_IDS.has(rawModel) ? rawModel : DEFAULT_MODEL_ID;
  const messages = sanitizeMessages(rawMessages);
  if (!messages) return jsonError('Send at least one non-empty user message.', 400);

  const payloadMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  // 1) Optional: your own fine-tuned endpoint (Hugging Face / serverless) for NamelessAI.
  if (modelId === 'nameless-ai' && process.env.CUSTOM_MODEL_URL) {
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
        if (typeof reply === 'string' && reply.trim()) return textResponse(reply, 'custom');
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
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': siteUrl,
        'X-Title': 'Nameless Labs AI',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveSlug(modelId),
        messages: payloadMessages,
        stream: true,
        max_tokens: MAX_TOKENS,
      }),
      signal: req.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const raw = await upstream.text().catch(() => '');
      return jsonError(friendlyUpstreamError(upstream.status, raw), upstream.status === 401 ? 502 : upstream.status);
    }

    return textResponse(sseToTextStream(upstream.body), 'openrouter');
  } catch (err) {
    if (req.signal.aborted) return jsonError('Request cancelled.', 499);
    console.error('Chat API error:', err);
    return jsonError('Could not reach OpenRouter. Please try again.', 502);
  }
}
