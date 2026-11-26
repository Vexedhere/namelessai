'use client';

import type { ListenMode, VoiceState } from '@/lib/useVoiceMode';
import { VOICE_LANGS } from '@/lib/voice';
import { CloseIcon } from './Icons';

const LABEL: Record<VoiceState, string> = {
  off: '',
  standby: 'Standing by',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking · tap to skip',
};

export function VoiceBar({
  state,
  interim,
  error,
  lang,
  onLang,
  onStop,
  onInterrupt,
  hint,
  mode = 'push',
  wakeName = 'Nameless',
  onMode,
}: {
  state: VoiceState;
  interim: string;
  error: string | null;
  lang: string;
  onLang: (l: string) => void;
  onStop: () => void;
  onInterrupt: () => void;
  /** e.g. "Say “send” or “cancel”" while an email is waiting for confirmation */
  hint?: string;
  /** push = tap-to-talk, wake = always listening for the name, open = always listening and answers everything */
  mode?: ListenMode;
  wakeName?: string;
  onMode?: (m: 'wake' | 'open') => void;
}) {
  if (state === 'off' && !error) return null;
  const on = state !== 'off';

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2">
      <div className="animate-pop flex items-center gap-4 rounded-3xl border border-cyan-300/20 bg-[#0b1118]/90 p-3 pr-4 shadow-[0_10px_40px_-10px_rgba(34,211,238,0.25)] backdrop-blur-xl">
        <button
          onClick={state === 'speaking' ? onInterrupt : undefined}
          aria-label={LABEL[state] || 'Voice'}
          className="relative grid h-14 w-14 shrink-0 place-items-center"
        >
          {state === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/30" />}
          {state === 'standby' && <span className="absolute inset-1 animate-pulse rounded-full bg-cyan-400/10" />}
          {state === 'speaking' && <span className="absolute inset-0 animate-pulse rounded-full bg-violet-400/30" />}
          <span
            className={`relative grid h-11 w-11 place-items-center rounded-full transition ${
              state === 'listening'
                ? 'bg-gradient-to-br from-cyan-300 to-cyan-500 text-black'
                : state === 'standby'
                  ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/30'
                  : state === 'speaking'
                  ? 'bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white'
                  : state === 'thinking'
                    ? 'bg-white/10 text-zinc-200'
                    : 'bg-red-500/20 text-red-200'
            }`}
          >
            {state === 'thinking' ? (
              <span className="flex gap-1">
                <span className="dot !h-1.5 !w-1.5" />
                <span className="dot !h-1.5 !w-1.5 [animation-delay:150ms]" />
                <span className="dot !h-1.5 !w-1.5 [animation-delay:300ms]" />
              </span>
            ) : (
              <span className="flex h-5 items-center gap-[3px]" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`w-[3px] rounded-full bg-current ${state === 'listening' || state === 'speaking' ? 'animate-pulse' : state === 'standby' ? 'opacity-60' : ''}`}
                    style={{ height: [10, 18, 14, 8][i], animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </span>
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          {error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-cyan-300/80">{LABEL[state]}</p>
              <p className="mt-0.5 line-clamp-2 min-h-[1.25rem] text-sm text-zinc-300">
                {interim ||
                  (state === 'standby'
                    ? `Say “Hey ${wakeName}” and then what you need. I’m only reacting to my name.`
                    : state === 'listening'
                      ? (hint ?? (mode === 'push' ? 'Say something like “wake me up at 6:30” or “turn the volume down”' : 'Go ahead, I’m listening. Say “stop listening” when you’re done.'))
                      : hint ?? '')}
              </p>
            </>
          )}
        </div>

        {mode !== 'push' && onMode && (
          <button
            onClick={() => onMode(mode === 'wake' ? 'open' : 'wake')}
            title={mode === 'wake' ? `Waits for “Hey ${wakeName}”. Click to answer everything it hears instead.` : 'Answers everything it hears. Click to wait for the wake word instead.'}
            className={`hidden shrink-0 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition sm:block ${
              mode === 'wake' ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15' : 'border-amber-300/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15'
            }`}
          >
            {mode === 'wake' ? `Wake word: ${wakeName}` : 'Open mic'}
          </button>
        )}
        <select
          value={lang}
          onChange={(e) => onLang(e.target.value)}
          aria-label="Voice language"
          className="hidden max-w-[9.5rem] rounded-xl border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-300 outline-none sm:block"
        >
          {VOICE_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button onClick={onStop} aria-label="End voice mode" className="rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white">
          <CloseIcon width={16} height={16} />
        </button>
      </div>
      {on && !error && <span className="sr-only" aria-live="polite">{LABEL[state]}</span>}
    </div>
  );
}
