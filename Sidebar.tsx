'use client';

import type { Chat } from '@/lib/types';
import { getModel } from '@/lib/models';
import { CloseIcon, PlusIcon, TrashIcon } from './Icons';
import { ModelOrb } from './ModelPicker';

export function Sidebar({
  chats,
  activeId,
  open,
  onClose,
  onNew,
  onSelect,
  onDelete,
}: {
  chats: Chat[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[18.5rem] flex-col border-r border-white/[0.08] bg-[#080b10]/90 backdrop-blur-2xl transition-transform duration-300 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-bold text-black shadow-[0_0_24px_rgba(34,211,238,0.35)]">
              N
            </span>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-white">Nameless Labs</h1>
              <p className="text-[11px] text-zinc-500">AI workspace</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close sidebar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white md:hidden">
            <CloseIcon />
          </button>
        </div>

        <div className="px-4 pb-2">
          <button
            onClick={() => {
              onNew();
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/40 hover:bg-white/[0.09]"
          >
            <PlusIcon width={16} height={16} /> New chat
          </button>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-2" aria-label="Chat history">
          <p className="px-2 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Recent</p>
          {sorted.length === 0 && <p className="px-2 text-sm text-zinc-600">Your conversations will appear here.</p>}
          <ul className="space-y-0.5">
            {sorted.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    onClick={() => {
                      onSelect(c.id);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 pr-9 text-left text-sm transition ${
                      active ? 'bg-white/[0.09] text-white' : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'
                    }`}
                  >
                    <ModelOrb model={getModel(c.model)} size={10} />
                    <span className="truncate">{c.title}</span>
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    aria-label={`Delete chat ${c.title}`}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 opacity-0 transition hover:bg-white/10 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/[0.08] px-5 py-4 text-xs text-zinc-500">
          Powered by <span className="text-zinc-300">Mythical Studios</span>
        </div>
      </aside>
    </>
  );
}
