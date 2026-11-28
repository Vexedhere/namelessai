'use client';

import { useEffect, useRef, useState } from 'react';
import { cleanAiName } from '@/lib/account';

const IDEAS = ['Nova', 'Jarvis', 'Echo', 'Atlas', 'Luna', 'Sage', 'Zen', 'Orion'];
const AVATARS = ['sparkles','bot','brain','rocket','cat','orbit','sun','moon','leaf','zap','flame','heart'];
const ICONS: Record<string,string> = {sparkles:'✦',bot:'◈',brain:'✺',rocket:'↗',cat:'◡',orbit:'◎',sun:'☼',moon:'☾',leaf:'❋',zap:'ϟ',flame:'♨',heart:'♡'};

/** Shown when someone opens the site and their AI has no name yet (and again from "rename"). */
export function NameAiModal({
  open,
  initial,
  initialAvatar = 'sparkles',
  signedIn,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: string | null;
  initialAvatar?: string;
  signedIn: boolean;
  onSave: (name: string, avatar: string) => void;
  /** Provided only when the dialog may be dismissed (renaming). First-time naming can be skipped via "Use default". */
  onClose?: () => void;
}) {
  const [value, setValue] = useState('');
  const [avatar, setAvatar] = useState(initialAvatar);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initial ?? '');
      setAvatar(initialAvatar);
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open, initial, initialAvatar]);

  if (!open) return null;
  const name = cleanAiName(value);
  const submit = () => name && onSave(name, avatar);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="name-ai-title">
      <div className="animate-pop relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-canvas p-7 shadow-2xl shadow-black/70">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/20 blur-[70px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-accent/20 blur-[70px]" />
        <div className="relative">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-accent text-xl font-bold text-black shadow-[0_0_30px_rgba(255,255,255,0.15)]">✦</span>
          <h2 id="name-ai-title" className="mt-5 text-2xl font-semibold tracking-tight text-white">Name your AI</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
            Pick any name. Your AI will know it, answer to it and introduce itself with it.
            {signedIn ? ' It’s saved to your account, so it follows you to any device.' : ' You’re not signed in, so it’s only remembered until you close this tab.'}
          </p>

          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={30}
            placeholder="e.g. Nova"
            aria-label="AI name"
            className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder-zinc-600 outline-none transition focus:border-cyan-400/50"
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {IDEAS.map((n) => (
              <button key={n} onClick={() => setValue(n)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300 transition hover:border-cyan-400/40 hover:bg-white/[0.06] hover:text-white">
                {n}
              </button>
            ))}
          </div>

          <div className="mt-5"><p className="mb-2 text-xs font-semibold text-zinc-400">Choose your assistant avatar</p><div className="grid grid-cols-6 gap-2">{AVATARS.map((item) => <button type="button" key={item} onClick={() => setAvatar(item)} aria-pressed={avatar === item} className={'grid h-10 place-items-center rounded-xl border text-lg transition ' + (avatar === item ? 'border-cyan-300/70 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/[.03] text-zinc-400 hover:bg-white/[.08]')}>{ICONS[item]}</button>)}</div></div>
          <button
            onClick={submit}
            disabled={!name}
            className="mt-6 w-full rounded-2xl bg-gradient-to-br from-cyan-300 to-cyan-500 px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save name
          </button>
          <div className="mt-3 flex justify-center gap-4 text-xs text-zinc-500">
            {onClose ? (
              <button onClick={onClose} className="transition hover:text-zinc-300">Cancel</button>
            ) : (
              <button onClick={() => onSave('NamelessAI')} className="transition hover:text-zinc-300">Use default (NamelessAI)</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
