'use client';

import { TOOL_LABELS } from '@/lib/toolDefs';
import type { ToolCall } from '@/lib/types';
import { AlertIcon, BellIcon, CheckIcon, MailIcon, WrenchIcon } from './Icons';

function iconFor(name: string) {
  if (name.includes('alarm') || name === 'set_timer') return BellIcon;
  if (name.includes('email') || name.includes('contact')) return MailIcon;
  return WrenchIcon;
}

function summarize(c: ToolCall): string {
  try {
    const a = JSON.parse(c.args || '{}') as Record<string, unknown>;
    if (c.name === 'send_email') return `${a.to ?? ''} · ${a.subject ?? ''}`;
    if (c.name === 'get_weather') return String(a.location ?? '');
    if (c.name === 'calculate') return String(a.expression ?? '');
    if (c.name === 'web_search') return String(a.query ?? '');
    if (c.name === 'read_webpage' || c.name === 'open_website') return String(a.url ?? '');
    if (c.name === 'wikipedia_summary') return String(a.topic ?? '');
    if (c.name === 'define_word') return String(a.word ?? '');
    if (c.name === 'convert_currency') return `${a.amount ?? ''} ${a.from ?? ''} → ${a.to ?? ''}`;
    if (c.name === 'convert_units') return `${a.value ?? ''} ${a.from ?? ''} → ${a.to ?? ''}`;
    if (c.name === 'world_time') return String(a.place ?? '');
    if (c.name === 'get_news') return String(a.topic ?? 'top headlines');
    if (c.name === 'get_crypto_price') return String(a.coin ?? '');
    if (c.name === 'country_info') return String(a.country ?? '');
    if (c.name === 'finance_calc' || c.name === 'date_calc' || c.name === 'manage_expenses' || c.name === 'track_habit' || c.name === 'manage_bookmarks') return String(a.kind ?? a.action ?? '');
    if (c.name === 'set_theme') return String(a.theme ?? '');
    if (c.name === 'manage_tasks') return `${a.action ?? ''}${a.text ? `: ${a.text}` : ''}`;
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
