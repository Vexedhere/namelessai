import type { ApiMessage, Message, StreamEvent } from './types';
import { memoryPrompt } from './agentStore';

export type ToolCallRequest = { id: string; name: string; arguments: string };

/** Local time with offset + weekday, e.g. "Monday 2026-11-23T11:38:00+05:30" (models do better with the weekday). */
export function localTimeString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  return (
    `${weekday} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}

/** Converts stored chat messages into the OpenAI-style wire format (tool calls always paired with results). */
export function toApiMessages(msgs: Message[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      if (m.content.trim()) out.push({ role: 'user', content: m.content });
      continue;
    }
    const calls = m.toolCalls ?? [];
    if (m.error && !calls.length) continue; // failed bubbles are not part of the conversation
    if (!m.content.trim() && !calls.length) continue;
    out.push({
      role: 'assistant',
      content: m.content.trim() ? m.content : null,
      ...(calls.length
        ? { tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } })) }
        : {}),
    });
    for (const c of calls) out.push({ role: 'tool', tool_call_id: c.id, content: c.result ?? 'No result (the action was interrupted).' });
  }
  return out;
}

/** Reads one /api/chat response (NDJSON events). Throws for HTTP-level failures. */
export async function streamChat(p: {
  messages: ApiMessage[];
  model: string;
  userName?: string;
  tools: boolean;
  voice: boolean;
  token?: string;
  signal: AbortSignal;
  onText: (accumulated: string) => void;
}): Promise<{ text: string; calls: ToolCallRequest[]; error?: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(p.token ? { Authorization: `Bearer ${p.token}` } : {}) },
    body: JSON.stringify({
      model: p.model,
      userName: p.userName,
      tools: p.tools,
      voice: p.voice,
      memory: p.tools ? memoryPrompt() : '',
      clientTime: { iso: localTimeString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
      messages: p.messages,
    }),
    signal: p.signal,
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let error: string | undefined;
  const calls: ToolCallRequest[] = [];

  const handle = (line: string) => {
    if (!line.trim()) return;
    let ev: StreamEvent;
    try {
      ev = JSON.parse(line) as StreamEvent;
    } catch {
      return;
    }
    if (ev.type === 'text') {
      text += ev.text;
      p.onText(text);
    } else if (ev.type === 'tool_calls') {
      calls.push(...ev.calls);
    } else if (ev.type === 'error') {
      error = ev.message;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
  }
  buffer += decoder.decode();
  handle(buffer);
  return { text, calls, error };
}
