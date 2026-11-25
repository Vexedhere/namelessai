'use client';

import { useEffect, useRef, useState } from 'react';
import { connectFolder, disconnectFolder, folderName, folderSupported, subscribeFolder, systemInfo } from '@/lib/system';

/** Header button: connect one desktop folder for the AI (files/PDFs) and peek at system info. */
export function DesktopButton() {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [info, setInfo] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupported(folderSupported());
    setFolder(folderName());
    return subscribeFolder(() => setFolder(folderName()));
  }, []);

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

  const connect = async () => {
    setErr('');
    try {
      await connectFolder();
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setErr((e as Error).message || 'Could not connect the folder.');
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Desktop access"
        aria-expanded={open}
        title={folder ? `Desktop folder: ${folder}` : 'Connect a desktop folder'}
        className={`rounded-xl border p-2 text-sm leading-none transition hover:bg-white/10 ${folder ? 'border-cyan-300/40 bg-cyan-400/10' : 'border-white/10'}`}
      >
        🖥️
      </button>
      {open && (
        <div className="animate-pop absolute right-0 top-full z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Desktop access</p>
          <p className="mt-2 text-sm text-zinc-300">
            {folder ? (<>Connected to <span className="font-medium text-white">{folder}</span>. The AI can list, read and save files here, and PDFs it makes land here.</>) : 'Choose one folder (e.g. Desktop or Documents). The AI can only touch files inside it.'}
          </p>
          {!supported ? (
            <p className="mt-3 rounded-xl bg-amber-400/10 p-2.5 text-xs text-amber-200">Folder access needs Chrome, Edge or Opera on a computer. PDFs will download instead.</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={connect} className="flex-1 rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110">
                {folder ? 'Change folder' : 'Connect folder'}
              </button>
              {folder && <button onClick={disconnectFolder} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10">Disconnect</button>}
            </div>
          )}
          {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
          <button onClick={async () => setInfo(await systemInfo())} className="mt-3 text-xs text-cyan-300 hover:underline">Show system info</button>
          {info && <pre className="scroll-thin mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-2.5 text-[11px] leading-relaxed text-zinc-400">{info}</pre>}
          <p className="mt-3 text-[11px] leading-snug text-zinc-600">For your safety the connection ends when you refresh or close the tab, and the AI never overwrites existing files.</p>
        </div>
      )}
    </div>
  );
}
