'use client';

import { useEffect, useRef, useState } from 'react';
import { THEMES, applyTheme, getStoredTheme } from '@/lib/theme';

/** Header button + popover to switch the colour theme (also settable by voice/chat via the set_theme tool). */
export function ThemeButton() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('aurora');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(getStoredTheme());
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

  const active = THEMES.find((t) => t.id === current) ?? THEMES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change theme"
        aria-expanded={open}
        title="Change theme"
        className="rounded-xl border border-white/10 p-2 transition hover:bg-white/10"
      >
        <span
          className="block h-[18px] w-[18px] rounded-full ring-1 ring-white/30"
          style={{ background: `linear-gradient(135deg, ${active.swatch[0]}, ${active.swatch[1]})` }}
        />
      </button>
      {open && (
        <div className="animate-pop absolute right-0 top-full z-50 mt-2 w-44 rounded-2xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                applyTheme(t.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-white/10 ${
                t.id === current ? 'bg-white/[0.07] text-white' : 'text-zinc-300'
              }`}
            >
              <span className="h-5 w-5 rounded-full ring-1 ring-white/25" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
              {t.name}
              {t.id === current && <span className="ml-auto text-xs text-cyan-300">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
