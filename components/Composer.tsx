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
  uploading = false,
}: {
  loading: boolean;
  placeholder: string;
  onSend: (text: string, files?: File[]) => void;
  onStop: () => void;
  /** start hands-free voice mode (hidden when omitted) */
  onVoice?: () => void;
  voiceActive?: boolean;
  /** toggle always-listening mode (hidden when omitted) */
  onHandsFree?: () => void;
  handsFree?: boolean;
  uploading?: boolean;
}) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if ((!text && files.length === 0) || loading) return;
    onSend(text || 'Please read and analyse the attached file(s).', files);
    setValue('');
    setFiles([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addFiles = (incoming: File[]) => setFiles((old) => [...old, ...incoming].slice(0, 5));
  const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div
      className={`mx-auto w-full max-w-3xl px-4 pb-5 pt-2 transition ${dragging ? 'rounded-3xl bg-cyan-300/[0.06] ring-1 ring-cyan-300/40' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!loading) setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (!loading) addFiles(Array.from(e.dataTransfer.files)); }}
    >
      <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.pptx,.zip,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt,.md,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.go,.rs,.sql,.yaml,.yml,.toml,.log,.sh,.env,.ini,.conf,.graphql,.gql,.vue,.svelte" className="hidden" aria-label="Attach files" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      {dragging && <div className="mb-2 rounded-xl border border-dashed border-cyan-300/40 bg-cyan-300/[0.06] px-3 py-2 text-center text-xs font-medium text-cyan-100">Drop files to attach · up to 5 files</div>}
      {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file, i) => <span key={`${file.name}-${i}`} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-zinc-300"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-[9px] font-bold uppercase text-cyan-200">{file.name.split('.').pop()?.slice(0, 4) || 'FILE'}</span><span className="min-w-0"><span className="block max-w-[190px] truncate">{file.name}</span><span className="block text-[10px] text-zinc-500">{fileSize(file.size)}</span></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((_, n) => n !== i))} className="ml-1 text-zinc-500 hover:text-white">×</button></span>)}</div>}
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
        <button type="button" onClick={() => fileRef.current?.click()} disabled={loading || files.length >= 5} aria-label="Attach files" title="Attach up to 5 files (PDF, Word, Excel, PowerPoint, ZIP, images, text and code)" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"/></svg></button>
        {uploading ? (
          <div role="status" aria-live="polite" className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] px-3 text-xs font-medium text-cyan-100"><span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-200" />Reading files</div>
        ) : loading ? (
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
            disabled={!value.trim() && files.length === 0}
            aria-label="Send message"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-cyan-500 text-black shadow-[0_0_24px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-zinc-600 disabled:shadow-none"
          >
            <SendIcon width={18} height={18} strokeWidth={2.2} />
          </button>
          </>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-600">
        Enter to send · Shift + Enter for a new line · drop files or attach PDFs, docs, sheets and images · AI can make mistakes
      </p>
    </div>
  );
}
