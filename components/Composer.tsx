'use client';

import { useEffect, useRef, useState } from 'react';
import { HandsFreeIcon, MicIcon, SendIcon, StopIcon } from './Icons';
import { ModelPicker } from './ModelPicker';

export function Composer({
  loading,
  placeholder,
  onSend,
  onStop,
  onVoice,
  voiceActive = false,
  onHandsFree,
  handsFree = false,
  model,
  onModelChange,
  tier = 'FREE',
  poolRemaining,
  poolLimit,
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
  model?: string;
  onModelChange?: (id: string) => void;
  tier?: 'FREE' | 'BASE' | 'PLUS' | 'PRO';
  poolRemaining?: number;
  poolLimit?: number;
}) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [dragging, setDragging] = useState(false);
  const commands = [
    { command: '/research', label: 'Deep research', hint: 'Investigate a topic and compare sources', prefix: 'Research this thoroughly, compare reliable sources, cite evidence, and distinguish facts from uncertainty.\n\n' },
    { command: '/plan', label: 'Create a plan', hint: 'Turn the request into actionable steps', prefix: 'Create a practical step-by-step plan with milestones, dependencies, and a definition of done.\n\n' },
    { command: '/code', label: 'Code assistant', hint: 'Implement and review code', prefix: 'Act as a senior software engineer. Explain assumptions, write maintainable code, and include edge cases and tests.\n\n' },
    { command: '/explain', label: 'Explain simply', hint: 'Clear explanation with examples', prefix: 'Explain this from first principles using a concrete example and a short recap.\n\n' },
    { command: '/summarize', label: 'Summarize', hint: 'Extract key points and decisions', prefix: 'Summarize into key points, decisions, risks, and next actions.\n\n' },
  ];
  const fileRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    let text = value.trim();
    if ((!text && files.length === 0) || loading) return;
    const command = commands.find((item) => text.startsWith(item.command));
    if (command) text = command.prefix + text.slice(command.command.length).trim();
    if (enhanced && text) text = `Please handle this request by identifying the desired outcome, stating assumptions, and delivering an accurate, structured result with practical next steps.\n\nREQUEST:\n${text}`;
    onSend(text || 'Please read and analyse the attached file(s).', files);
    setValue('');
    setFiles([]);
    setEnhanced(false);
    setCommandsOpen(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className={`workspace-composer mx-auto w-full max-w-[920px] px-4 pb-5 pt-2 sm:px-6 ${dragging ? 'composer-dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={(e) => { e.preventDefault(); setDragging(false); setFiles((old) => [...old, ...Array.from(e.dataTransfer.files)].slice(0, 5)); }}>
      {dragging && <div className="composer-drop-hint">Drop files to attach them</div>}
      <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.pptx,.zip,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt,.md,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.go,.rs,.sql,.yaml,.yml,.toml,.log,.sh,.env,.ini,.conf,.graphql,.gql,.vue,.svelte" className="hidden" aria-label="Attach files" onChange={(e) => setFiles((old) => [...old, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
      {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file, i) => <span key={`${file.name}-${i}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-300"><span className="max-w-[220px] truncate">{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((_, n) => n !== i))} className="text-zinc-500 hover:text-white">×</button></span>)}</div>}
      {commandsOpen && <div className="composer-command-menu" role="listbox" aria-label="Slash commands">{commands.map((item) => <button type="button" key={item.command} onClick={() => { setValue(`${item.command} `); setCommandsOpen(false); ref.current?.focus(); }}><b>{item.command}</b><span>{item.label}</span><small>{item.hint}</small></button>)}</div>}
      <div className="workspace-composer-box flex items-end gap-2 rounded-3xl border border-white/10 bg-[#0d1219]/80 p-2 pl-5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.7)] backdrop-blur-xl transition">
        {model && onModelChange && <div className="composer-model-switch"><ModelPicker value={model} onChange={onModelChange} disabled={loading} tier={tier} />{typeof poolRemaining === 'number' && <small className={poolRemaining <= 1 ? 'composer-pool-warning' : 'composer-pool-label'}>{poolRemaining} / {poolLimit ?? 5} left · 3h pool</small>}</div>}
        <textarea
          ref={ref}
          rows={1}
          value={value}
          autoFocus
          onChange={(e) => { setValue(e.target.value); setCommandsOpen(e.target.value === '/' || (e.target.value.startsWith('/') && !e.target.value.includes(' '))); }}
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
        {!loading && <button type="button" onClick={() => setEnhanced((v) => !v)} aria-pressed={enhanced} title="Structure your prompt before sending" className={`composer-enhance grid h-10 shrink-0 place-items-center rounded-2xl px-3 text-xs font-semibold transition ${enhanced ? 'is-active' : ''}`}>✧ <span className="hidden sm:inline">{enhanced ? 'Enhanced' : 'Enhance'}</span></button>}
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
        Enter to send · Shift + Enter for a new line · <button type="button" onClick={() => { setValue('/'); setCommandsOpen(true); ref.current?.focus(); }} className="hover:text-violet-300">/ for commands</button> · AI can make mistakes
      </p>
    </div>
  );
}
