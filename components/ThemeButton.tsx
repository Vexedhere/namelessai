'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { THEMES, THEME_COUNT, applyTheme, getCurrentTheme, getTheme } from '@/lib/theme';

/** Header button + popover: search and pick from 390 colour themes (also settable by voice/chat via the set_theme tool). */
export function ThemeButton() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('violet-classic');
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(getCurrentTheme());
    const on = (e: Event) => setCurrent((e as CustomEvent<string>).detail);
    window.addEventListener('nameless-theme', on);
    return () => window.removeEventListener('nameless-theme', on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const active = getTheme(current) ?? THEMES[0];
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? THEMES.filter((t) => t.name.toLowerCase().includes(q)) : THEMES), [q]);
  const grad = (s: [string, string]) => `linear-gradient(135deg, ${s[0]}, ${s[1]})`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change theme"
        aria-expanded={open}
        title={`Theme: ${active.name} (${THEME_COUNT} available)`}
        className="rounded-xl border border-white/10 p-2 transition hover:bg-white/10"
      >
        <span className="block h-[18px] w-[18px] rounded-full ring-1 ring-white/30" style={{ background: grad(active.swatch) }} />
      </button>
      {open && (
        <div className="animate-pop absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{THEME_COUNT} themes</p>
            <button
              onClick={() => applyTheme(THEMES[Math.floor(Math.random() * THEMES.length)].id)}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/10"
            >
              🎲 Random
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: ruby, neon, midnight…"
            aria-label="Search themes"
            className="mb-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-400/40"
          />
          <div className="scroll-thin grid max-h-72 grid-cols-6 gap-2 overflow-y-auto p-1">
            {shown.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTheme(t.id)}
                title={t.name}
                aria-label={t.name}
                aria-pressed={t.id === current}
                className={`aspect-square rounded-full ring-1 transition hover:scale-110 ${t.id === current ? 'ring-2 ring-white' : 'ring-white/20'}`}
                style={{ background: grad(t.swatch) }}
              />
            ))}
            {!shown.length && <p className="col-span-6 py-6 text-center text-sm text-zinc-500">No theme matches “{query}”.</p>}
          </div>
          <p className="mt-2 truncate px-1 text-xs text-zinc-400">
            Current: <span className="text-zinc-200">{active.name}</span>
          </p>
        </div>
      )}
    </div>
  );
}
