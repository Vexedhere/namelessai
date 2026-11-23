'use client';

import type { EmailDraft } from '@/lib/clientTools';
import { MailIcon } from './Icons';

export type PendingEmail = { callId: string; draft: EmailDraft; busy: boolean; error: string | null };

/** The human-in-the-loop gate: nothing is emailed until the user presses Send (or says “send”). */
export function EmailConfirm({
  pending,
  signedIn,
  voice,
  onChange,
  onSend,
  onMailto,
  onCancel,
}: {
  pending: PendingEmail;
  signedIn: boolean;
  voice: boolean;
  onChange: (d: EmailDraft) => void;
  onSend: () => void;
  onMailto: () => void;
  onCancel: () => void;
}) {
  const { draft, busy, error } = pending;
  const field = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/50';
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <div className="animate-pop rounded-3xl border border-cyan-300/25 bg-surface/95 p-4 shadow-[0_10px_40px_-10px_rgb(var(--a-400)/0.3)] backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-cyan-200">
          <MailIcon width={16} height={16} /> Review email before sending
          {voice && <span className="ml-auto text-xs font-normal text-zinc-400">or say “send” / “cancel”</span>}
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">To</span>
            <input className={field} value={draft.to} onChange={(e) => onChange({ ...draft, to: e.target.value })} disabled={busy} inputMode="email" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Subject</span>
            <input className={field} value={draft.subject} onChange={(e) => onChange({ ...draft, subject: e.target.value })} disabled={busy} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">Message</span>
            <textarea
              className={`${field} scroll-thin min-h-[120px] max-h-56 resize-y leading-relaxed`}
              value={draft.body}
              onChange={(e) => onChange({ ...draft, body: e.target.value })}
              disabled={busy}
            />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {!signedIn && <span className="mr-auto text-xs text-zinc-500">Sign in to send directly from the app.</span>}
          <button onClick={onCancel} disabled={busy} className="rounded-xl px-3.5 py-2 text-sm text-zinc-300 transition hover:bg-white/10 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onMailto} disabled={busy} className="rounded-xl border border-white/15 px-3.5 py-2 text-sm text-zinc-200 transition hover:bg-white/10 disabled:opacity-50">
            Open in mail app
          </button>
          <button
            onClick={onSend}
            disabled={busy || !signedIn}
            className="rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 px-4 py-2 text-sm font-semibold text-black shadow-[0_0_20px_rgb(var(--a-400)/0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-zinc-500 disabled:shadow-none"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
