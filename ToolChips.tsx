'use client';

import { TOOL_LABELS } from '@/lib/toolDefs';
import type { ToolCall } from '@/lib/types';
import { AlertIcon, BellIcon, BrainIcon, CheckIcon, ListIcon, MailIcon, WrenchIcon } from './Icons';

function iconFor(name: string) {
  if (name.includes('alarm') || name === 'set_timer') return BellIcon;
  if (name.includes('email') || name.includes('contact')) return MailIcon;
  if (['remember', 'recall', 'forget'].includes(name)) return BrainIcon;
  if (name.includes('task') || name.includes('note') || name.includes('expense')) return ListIcon;
  return WrenchIcon;
}

function summarize(c: ToolCall): string {
  try {
    const a = JSON.parse(c.args || '{}') as Record<string, unknown>;
    if (c.name === 'send_email') return `${a.to ?? ''} · ${a.subject ?? ''}`;
    if (c.name === 'get_weather') return String(a.location ?? '');
    if (c.name === 'calculate') return String(a.expression ?? '');
    if (c.name === 'web_search') return String(a.query ?? '');
    if (c.name === 'read_webpage') return String(a.url ?? '');
    if (c.name === 'get_news') return String(a.topic ?? 'top headlines');
    if (c.name === 'create_file') return String(a.filename ?? '');
    if (c.name === 'create_calendar_event') return String(a.title ?? '');
    if (c.name === 'remember') return String(a.fact ?? '');
    if (c.name === 'add_task') return String(a.text ?? '');
    if (c.name === 'convert_currency') return `${a.amount ?? ''} ${a.from ?? ''} → ${a.to ?? ''}`;
    if (c.name === 'crypto_price') return String(a.coin ?? '');
    if (c.name === 'stock_quote') return String(a.symbol ?? '');
  } catch {
    /* ignore */
  }
  return '';
}

export function ToolChips({ calls }: { calls: ToolCall[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {calls.map((c) => {
        const Icon = iconFor(c.name);
        const bad = c.status === 'error';
        const live = c.status === 'running' || c.status === 'awaiting';
        const detail = c.status === 'done' || bad || c.status === 'cancelled' ? c.result?.replace(/^Error: /, '') : summarize(c);
        return (
          <div
            key={c.id}
            className={`flex items-start gap-2.5 rounded-2xl border px-3 py-2 text-xs ${
              bad ? 'border-red-400/25 bg-red-500/[0.07] text-red-200' : c.status === 'cancelled' ? 'border-white/10 bg-white/[0.03] text-zinc-400' : 'border-cyan-300/15 bg-cyan-400/[0.05] text-zinc-300'
            }`}
          >
            <span className={`mt-0.5 shrink-0 ${live ? 'animate-pulse text-cyan-300' : bad ? 'text-red-300' : 'text-emerald-300'}`}>
              {bad ? <AlertIcon width={14} height={14} /> : c.status === 'done' ? <CheckIcon width={14} height={14} /> : <Icon width={14} height={14} />}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-zinc-200">
                {TOOL_LABELS[c.name] ?? c.name}
                {c.status === 'awaiting' && <span className="ml-2 font-normal text-amber-300">waiting for your OK</span>}
              </p>
              {detail && <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-zinc-400">{detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
