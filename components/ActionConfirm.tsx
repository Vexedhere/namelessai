'use client';

import { ShieldIcon } from './Icons';

export type PendingConfirm = { title: string; detail: string; danger?: boolean };

/** Gate for actions that change the real computer. Nothing happens until the user taps Allow (or says “yes”). */
export function ActionConfirm({
  pending,
  voice,
  onAllow,
  onDeny,
}: {
  pending: PendingConfirm;
  voice: boolean;
  onAllow: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <div
        role="alertdialog"
        aria-labelledby="confirm-title"
        className={`animate-pop rounded-3xl border bg-[#0b1118]/95 p-4 backdrop-blur-xl ${
          pending.danger ? 'border-amber-300/40 shadow-[0_10px_40px_-10px_rgba(251,191,36,0.3)]' : 'border-cyan-300/25 shadow-[0_10px_40px_-10px_rgba(34,211,238,0.3)]'
        }`}
      >
        <div id="confirm-title" className="flex items-center gap-2 text-sm font-medium text-amber-200">
          <ShieldIcon width={16} height={16} /> {pending.title}
          {voice && <span className="ml-auto text-xs font-normal text-zinc-400">or say “yes” / “no”</span>}
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">{pending.detail}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onDeny} className="rounded-xl px-3.5 py-2 text-sm text-zinc-300 transition hover:bg-white/10">
            Cancel
          </button>
          <button
            onClick={onAllow}
            className="rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 px-4 py-2 text-sm font-semibold text-black shadow-[0_0_20px_rgba(251,191,36,0.3)] transition hover:brightness-110"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
