'use client';

import { useEffect, useState } from 'react';
import { MODELS, getModel, type ModelDef } from '@/lib/models';
import { CheckIcon, ChevronIcon } from './Icons';

export function ModelOrb({ model, size = 28 }: { model: ModelDef; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 25%, #ffffffcc 0%, transparent 38%), linear-gradient(135deg, ${model.accent[0]}, ${model.accent[1]})`,
        boxShadow: `0 0 ${size * 0.8}px ${model.accent[0]}55, inset 0 0 ${size * 0.3}px #00000055`,
      }}
    />
  );
}

export function ModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = getModel(value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-3 text-sm transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-50"
      >
        <ModelOrb model={current} size={22} />
        <span className="max-w-[9.5rem] truncate font-medium text-white sm:max-w-[16rem]">{current.name}</span>
        <ChevronIcon width={15} height={15} className={`text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="animate-pop absolute left-0 top-full z-40 mt-2 w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f15]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-2xl"
          >
            <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Select model tier
            </p>
            {MODELS.map((m) => {
              const active = m.id === value;\n              const required = m.id === 'aether-pro' ? 'PLUS' : m.id === 'quasar-apex' ? 'PRO' : 'FREE';\n              const locked = required === 'PLUS' ? tier === 'FREE' : required === 'PRO' ? tier !== 'PRO' : false;
              return (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    active ? 'bg-white/[0.08]' : locked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <ModelOrb model={m} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{m.name}</span>
                      <span
                        className="rounded-full border px-2 py-px text-[10px] font-medium"
                        style={{ color: m.accent[0], borderColor: `${m.accent[0]}44`, background: `${m.accent[0]}12` }}
                      >
                        {m.badge}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-zinc-400">{m.tagline}</span>
                  </span>
                  {active && <CheckIcon width={16} height={16} className="shrink-0 text-cyan-300" />}\n                  {locked && <span className="shrink-0 text-[11px] text-violet-300">Upgrade</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
