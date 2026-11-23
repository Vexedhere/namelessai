'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_THEME, THEMES, THEME_KEY, type ThemeId } from '@/lib/themes';
import { CheckIcon, PaletteIcon } from './Icons';

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const cur = document.documentElement.getAttribute('data-theme') as ThemeId | null;
    if (cur && THEMES.some((t) => t.id === cur)) setTheme(cur);
  }, []);

  const pick = (id: ThemeId) => {
    setTheme(id);
    document.documentElement.setAttribute('data-theme', id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Change theme"
        title="Change theme"
        aria-expanded={open}
        className="rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
      >
        <PaletteIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="animate-pop absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-white/10 bg-surface/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-2xl">
            <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Theme</p>
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${theme === t.id ? 'bg-white/[0.08] text-white' : 'text-zinc-300 hover:bg-white/[0.05]'}`}
              >
                <span className="h-5 w-5 rounded-full" style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }} />
                <span className="flex-1">{t.name}</span>
                {theme === t.id && <CheckIcon width={16} height={16} className="text-cyan-300" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
