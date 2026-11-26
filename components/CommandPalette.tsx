'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon, DownloadIcon, LaptopIcon, MicIcon, PlusIcon, SparkIcon, WrenchIcon } from './Icons';

type Command = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  shortcut?: string;
  run: () => void;
  icon: (props: { width?: number; height?: number }) => JSX.Element;
  disabled?: boolean;
};

export function CommandPalette({
  open,
  onClose,
  onNewChat,
  onToggleAgent,
  agent,
  onDevices,
  onVoice,
  onToggleGodmode,
  godmode,
  onExport,
  onExportPdf,
  hasChat,
  toolsAvailable,
}: {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onToggleAgent: () => void;
  agent: boolean;
  onDevices: () => void;
  onVoice: () => void;
  onToggleGodmode: () => void;
  godmode: boolean;
  onExport: () => void;
  onExportPdf: () => void;
  hasChat: boolean;
  toolsAvailable: boolean;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { id: 'new', label: 'Start a new chat', description: 'Create a fresh conversation', keywords: 'new chat reset', shortcut: 'N', run: onNewChat, icon: PlusIcon },
    { id: 'agent', label: agent ? 'Switch to AI mode' : 'Switch to Agent mode', description: agent ? 'Turn off tool execution' : 'Enable available agent tools', keywords: 'ai agent tools mode', shortcut: 'A', run: onToggleAgent, icon: WrenchIcon, disabled: !agent && !toolsAvailable },
    { id: 'devices', label: 'Open device centre', description: 'Connect or manage your desktop companion', keywords: 'device computer desktop connect', run: onDevices, icon: LaptopIcon },
    { id: 'voice', label: 'Start voice conversation', description: 'Talk to NamelessAI', keywords: 'voice microphone speak talk', run: onVoice, icon: MicIcon },
    { id: 'godmode', label: godmode ? 'Turn off Godmode' : 'Enable Godmode', description: 'Allow longer multi-step agent workflows', keywords: 'godmode autonomous workflow', run: onToggleGodmode, icon: SparkIcon, disabled: !toolsAvailable },
    { id: 'export', label: 'Export current chat', description: 'Download this conversation as Markdown', keywords: 'download export save markdown', run: onExport, icon: DownloadIcon, disabled: !hasChat },
    { id: 'export-pdf', label: 'Export conversation as PDF', description: 'Create a paginated, print-ready PDF transcript', keywords: 'download pdf print document conversation', run: onExportPdf, icon: DownloadIcon, disabled: !hasChat },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((c) => !q || `${c.label} ${c.description} ${c.keywords}`.toLowerCase().includes(q));
  }, [query, agent, godmode, hasChat]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1));
  }, [active, filtered.length]);

  if (!open) return null;

  const run = (command: Command) => {
    if (command.disabled) return;
    onClose();
    command.run();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[min(18vh,150px)] backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#10131b] shadow-[0_30px_100px_-25px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4">
          <SparkIcon width={18} height={18} className="shrink-0 text-cyan-200" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((v) => Math.min(filtered.length - 1, v + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((v) => Math.max(0, v - 1)); }
              if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); run(filtered[active]); }
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
            placeholder="What would you like to do?"
            aria-label="Search commands"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
          <button onClick={onClose} aria-label="Close command palette" className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-white"><CloseIcon width={16} height={16} /></button>
        </div>
        <div className="max-h-[min(55vh,420px)] overflow-y-auto p-2">
          {filtered.length ? filtered.map((command, index) => {
            const Icon = command.icon;
            return (
              <button
                key={command.id}
                disabled={command.disabled}
                onMouseEnter={() => setActive(index)}
                onClick={() => run(command)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${index === active ? 'bg-cyan-300/[0.09] text-white' : 'text-zinc-300 hover:bg-white/[0.04]'} disabled:cursor-not-allowed disabled:opacity-35`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${index === active ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' : 'border-white/[0.08] bg-white/[0.03] text-zinc-400'}`}><Icon width={16} height={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{command.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">{command.description}</span>
                </span>
                {command.shortcut && <kbd className="rounded-md border border-white/10 px-2 py-1 font-mono text-[10px] text-zinc-500">{command.shortcut}</kbd>}
              </button>
            );
          }) : <p className="px-4 py-8 text-center text-sm text-zinc-500">No matching commands.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2.5 text-[10px] text-zinc-600">
          <span><kbd className="rounded border border-white/10 px-1.5 py-0.5">↑</kbd> <kbd className="rounded border border-white/10 px-1.5 py-0.5">↓</kbd> to navigate · Enter to run</span>
          <span>NamelessAI command centre</span>
        </div>
      </section>
    </div>
  );
}
