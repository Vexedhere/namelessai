'use client';

import { useEffect, useRef, useState } from 'react';
import { HandsFreeIcon, MicIcon, SendIcon, StopIcon } from './Icons';

export function Composer({
  loading,
  placeholder,
  onSend,
  onStop,
  onVoice,
  voiceActive = false,
  onHandsFree,
  handsFree = false,
}: {
  loading: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
  /** start hands-free voice mode (hidden when omitted) */
  onVoice?: () => void;
  voiceActive?: boolean;
  /** toggle always-listening mode (hidden when omitted) */
  onHandsFree?: () => void;
  handsFree?: boolean;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || loading) return;
    onSend(text);
    setValue('');
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2">
      <div className="flex items-end gap-2 rounded-3xl border border-white/10 bg-[#0d1219]/80 p-2 pl-5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.7)] backdrop-blur-xl transition focus-within:border-cyan-400/40 focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_10px_40px_-10px_rgba(34,211,238,0.2)]">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
          className="scroll-thin max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] leading-6 text-white placeholder-zinc-500 outline-none"
        />
        {loading ? (
          <button
            onClick={onStop}
            aria-label="Stop generating"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-white transition hover:bg-white/20"
          >
            <StopIcon width={16} height={16} />
          </button>
        ) : (
          <>
            {onHandsFree && !value.trim() && (
              <button
                onClick={onHandsFree}
                aria-pressed={handsFree}
                aria-label={handsFree ? 'Turn off always-listening' : 'Turn on always-listening'}
                title={handsFree ? 'Always listening is on. Click to turn it off.' : 'Always listening: just say “Hey <name>”, no tapping'}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition ${
                  handsFree ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200' : 'border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <HandsFreeIcon width={18} height={18} />
              </button>
            )}
            {onVoice && !value.trim() && (
              <button
                onClick={onVoice}
                aria-label={voiceActive ? 'Voice mode is on' : 'Start voice mode'}
                title="Talk to NamelessAI"
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition ${
                  voiceActive ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-200' : 'border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <MicIcon width={18} height={18} />
              </button>
            )}
          <button
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Send message"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-cyan-500 text-black shadow-[0_0_24px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-zinc-600 disabled:shadow-none"
          >
            <SendIcon width={18} height={18} strokeWidth={2.2} />
          </button>
          </>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-600">
        Enter to send · Shift + Enter for a new line · Mic to talk · headset for always-listening · AI can make mistakes
      </p>
    </div>
  );
}
