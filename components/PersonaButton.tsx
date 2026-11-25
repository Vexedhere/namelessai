'use client';

import { useEffect, useRef, useState } from 'react';
import { PERSONAS, getPersona } from '@/lib/personas';

/** Header dropdown to pick the assistant's working mode (coder, tutor, marketer…). */
export function PersonaButton({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = getPersona(value);

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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        title={`Mode: ${cur.name}`}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition disabled:opacity-40 ${
          cur.id !== 'default' ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-zinc-300 hover:bg-white/10'
        }`}
      >
        <span aria-hidden>{cur.emoji}</span>
        <span className="hidden sm:inline">{cur.name}</span>
      </button>
      {open && (
        <div className="animate-pop absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-white/10 bg-canvas/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/10 ${p.id === value ? 'bg-white/[0.07]' : ''}`}
            >
              <span className="text-lg">{p.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm text-white">{p.name}</span>
                <span className="block truncate text-xs text-zinc-400">{p.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
