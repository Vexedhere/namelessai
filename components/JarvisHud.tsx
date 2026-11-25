'use client';

import type { ReactNode } from 'react';
import type { VoiceState } from '@/lib/useVoiceMode';
import { VOICE_LANGS } from '@/lib/voice';

const LABEL: Record<VoiceState, string> = { off: 'Standby', listening: 'Listening', thinking: 'Processing', speaking: 'Speaking' };

/** "Jarvis" → "J.A.R.V.I.S." like the movie HUD; long names stay as plain caps. */
export function hudName(name: string): string {
  const n = name.trim().toUpperCase();
  return n.length <= 9 && !/\s/.test(n) ? [...n].join('.') + '.' : n;
}

const ring = (r: number, w: number, o: number, dash?: string, color = '--brand-400') => (
  <circle cx="200" cy="200" r={r} fill="none" strokeWidth={w} strokeDasharray={dash} style={{ stroke: `rgb(var(${color}) / ${o})` }} />
);

/** Full-screen voice interface: animated reactor rings around the AI's name. Colours follow the active theme. */
export function JarvisHud({
  state,
  interim,
  error,
  name,
  caption,
  activity,
  lang,
  onLang,
  onEnd,
  onMinimize,
  onInterrupt,
  hint,
  children,
}: {
  state: VoiceState;
  interim: string;
  error: string | null;
  name: string;
  caption: string;
  activity?: string;
  lang: string;
  onLang: (l: string) => void;
  onEnd: () => void;
  onMinimize: () => void;
  onInterrupt: () => void;
  hint?: string;
  children?: ReactNode;
}) {
  const label = LABEL[state];
  const display = hudName(name);
  const size = display.length <= 10 ? 'text-[clamp(1.4rem,5.2vmin,2.4rem)]' : display.length <= 16 ? 'text-[clamp(1.1rem,3.8vmin,1.7rem)]' : 'text-[clamp(0.9rem,2.8vmin,1.25rem)]';

  return (
    <div className="fixed inset-0 z-[55] flex flex-col items-center overflow-hidden bg-canvas/[0.97] backdrop-blur-2xl" role="dialog" aria-label={`${name} voice interface`}>
      {/* blueprint backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-grid absolute inset-0 opacity-70" />
        <div className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.12] blur-[110px]" />
      </div>

      <div className="relative z-10 flex w-full items-center justify-between gap-3 px-5 pt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-cyan-300/70">{display} · voice link</p>
        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => onLang(e.target.value)}
            aria-label="Voice language"
            className="max-w-[9rem] rounded-xl border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-300 outline-none"
          >
            {VOICE_LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <button onClick={onMinimize} aria-label="Minimise to compact bar" title="Minimise (keeps listening)" className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10">Minimise</button>
          <button onClick={onEnd} aria-label="End voice mode" title="End (Esc)" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/20">End</button>
        </div>
      </div>

      <button
        onClick={state === 'speaking' ? onInterrupt : undefined}
        aria-label={state === 'speaking' ? 'Tap to skip what I am saying' : label}
        className={`hud relative z-10 my-auto aspect-square w-[min(78vmin,34rem)] shrink-0 ${state === 'speaking' ? 'cursor-pointer' : 'cursor-default'}`}
        data-state={state}
      >
        <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" style={{ filter: 'drop-shadow(0 0 7px rgb(var(--brand-400) / 0.55))' }} aria-hidden>
          <circle className="hud-ping" cx="200" cy="200" r="150" fill="none" strokeWidth="2" style={{ stroke: 'rgb(var(--brand-300) / 0.6)', transformBox: 'view-box', transformOrigin: '200px 200px' }} />
          <g data-ring="a">{ring(193, 1.5, 0.55)}{ring(186, 9, 0.5, '1.6 7.2')}</g>
          <g data-ring="b">{ring(168, 20, 0.5, '560 496')}{ring(168, 2, 0.8, '8 1048')}</g>
          <g data-ring="c">{ring(146, 10, 0.55, '1.4 5.3')}</g>
          <g data-ring="d">{ring(126, 3.5, 0.95, '150 642', '--accent')}</g>
          <g data-ring="e">{ring(112, 1.5, 0.7, '30 12 4 12')}</g>
          <g className="hud-core" style={{ transformBox: 'view-box', transformOrigin: '200px 200px' }}>
            {ring(100, 2, 0.9, undefined, '--brand-300')}
            <circle cx="200" cy="200" r="97" style={{ fill: 'rgb(var(--bg) / 0.92)' }} />
            {ring(92, 0.8, 0.45)}
          </g>
        </svg>
        <span className="absolute inset-0 grid place-items-center px-[22%]">
          <span className={`hud-name text-center font-semibold uppercase tracking-[0.12em] text-white ${size}`}>{display}</span>
        </span>
      </button>

      <div className="relative z-10 mb-6 flex w-full max-w-2xl flex-col items-center gap-2 px-6 text-center">
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">{label}{state === 'speaking' ? ' · tap to skip' : ''}</p>
            {activity && <p className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">⚙ {activity}…</p>}
            <p className="min-h-[1.5rem] text-base text-white">{interim || (state === 'listening' ? hint ?? 'Go ahead, I’m listening.' : '')}</p>
            {caption && <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-zinc-400">{caption}</p>}
          </>
        )}
        {children}
        <p className="mt-1 text-[11px] text-zinc-600">Press Esc to end</p>
      </div>
    </div>
  );
}
