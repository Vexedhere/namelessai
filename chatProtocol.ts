// Wire-protocol helpers for /api/chat: request sanitising and the OpenRouter-SSE → NDJSON converter.
// Kept out of the route file so they can be unit-tested.

import { TOOL_NAMES } from './toolDefs';
import type { ApiMessage, StreamEvent } from './types';

export const MAX_MESSAGES = 60; // tool calls + results count as messages
export const MAX_CHARS_PER_MESSAGE = 32_000;
export const MAX_TOOL_ARG_CHARS = 8_000;
export const MAX_TOOL_RESULT_CHARS = 8_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function ndjson(event: StreamEvent) {
  return encoder.encode(JSON.stringify(event) + '\n');
}

/** Streams events as newline-delimited JSON. */

export function sanitizeMessages(input: unknown): ApiMessage[] | null {
  if (!Array.isArray(input)) return null;
  const out: ApiMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    if (r.role === 'user' && typeof r.content === 'string') {
      if (r.content.trim()) out.push({ role: 'user', content: r.content.slice(0, MAX_CHARS_PER_MESSAGE) });
    } else if (r.role === 'assistant') {
      const content = typeof r.content === 'string' ? r.content.slice(0, MAX_CHARS_PER_MESSAGE) : '';
      const calls: NonNullable<Extract<ApiMessage, { role: 'assistant' }>['tool_calls']> = [];
      if (Array.isArray(r.tool_calls)) {
        for (const c of r.tool_calls) {
          const cc = c as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
          const name = cc?.function?.name;
          const args = cc?.function?.arguments;
          if (typeof cc?.id !== 'string' || typeof name !== 'string' || !TOOL_NAMES.has(name)) continue;
          calls.push({
            id: cc.id.slice(0, 80),
            type: 'function',
            function: { name, arguments: typeof args === 'string' ? args.slice(0, MAX_TOOL_ARG_CHARS) : '{}' },
          });
        }
      }
      if (content.trim() || calls.length) out.push({ role: 'assistant', content: content.trim() ? content : null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (r.role === 'tool' && typeof r.tool_call_id === 'string' && typeof r.content === 'string') {
      out.push({ role: 'tool', tool_call_id: r.tool_call_id.slice(0, 80), content: r.content.slice(0, MAX_TOOL_RESULT_CHARS) });
    }
  }

  const trimmed = out.slice(-MAX_MESSAGES);
  // Most providers require the conversation to start with a user turn.
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();

  // Providers reject tool calls without matching results (and results without calls): repair the pairing.
  const repaired: ApiMessage[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    const m = trimmed[i];
    if (m.role === 'tool') continue; // orphan result
    repaired.push(m);
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const results = new Map<string, string>();
      let j = i + 1;
      while (j < trimmed.length && trimmed[j].role === 'tool') {
        const t = trimmed[j] as Extract<ApiMessage, { role: 'tool' }>;
        results.set(t.tool_call_id, t.content);
        j++;
      }
      for (const c of m.tool_calls) {
        repaired.push({ role: 'tool', tool_call_id: c.id, content: results.get(c.id) ?? 'No result (the action was interrupted).' });
      }
      i = j - 1;
    }
  }
  return repaired.length ? repaired : null;
}

/** Turns OpenRouter's SSE stream into NDJSON events: text deltas, then (if any) the complete tool calls. */
export function sseToEventStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  let buffer = '';
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();
  let autoIndex = 0;

  const handleLine = (line: string, controller: ReadableStreamDefaultController<Uint8Array>) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return false; // comments / keep-alives
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return false;
    try {
      const json = JSON.parse(payload);
      if (json?.error) {
        const msg = typeof json.error === 'string' ? json.error : json.error.message || 'Model error';
        controller.enqueue(ndjson({ type: 'error', message: msg }));
        return true;
      }
      const delta = json?.choices?.[0]?.delta;
      let emitted = false;
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          let idx: number = typeof tc.index === 'number' ? tc.index : autoIndex;
          const existing = toolAcc.get(idx);
          // some providers omit/reuse `index`; a new id on a used slot means a new call
          if (existing && tc.id && existing.id && tc.id !== existing.id) idx = ++autoIndex + 1000;
          const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (typeof tc.function?.arguments === 'string') cur.args += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
      if (typeof delta?.content === 'string' && delta.content.length) {
        controller.enqueue(ndjson({ type: 'text', text: delta.content }));
        emitted = true;
      }
      return emitted;
    } catch {
      /* ignore partial / malformed chunk */
    }
    return false;
  };

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    const calls = [...toolAcc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => c)
      .filter((c) => c.name)
      .map((c) => ({
        id: c.id || `call_${Math.random().toString(36).slice(2, 12)}`,
        name: c.name,
        arguments: c.args.trim() || '{}',
      }));
    if (calls.length) controller.enqueue(ndjson({ type: 'tool_calls', calls }));
    controller.close();
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
            finish(controller);
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
