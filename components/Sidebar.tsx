'use client';

import { useState } from 'react';
import { APP_VERSION_LABEL } from '@/lib/version';
import type { Chat, Message } from '@/lib/types';
import type { Profile } from '@/lib/useAuth';
import { getModel } from '@/lib/models';
import { Avatar } from './Avatar';
import { CloseIcon, PlusIcon, TrashIcon } from './Icons';
import { ModelOrb } from './ModelPicker';
import { ThemeButton } from './ThemeButton';

export function Sidebar({
  chats,
  voiceTranscript = [],
  activeId,
  open,
  onClose,
  onNew,
  onAgentMode,
  onOpenTools,
  agentMode,
  onSelect,
  onDelete,
  profile,
  authReady,
  sync,
  onSignIn,
  onSignOut,
}: {
  chats: Chat[];
  voiceTranscript?: Message[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onAgentMode: () => void;
  onOpenTools: () => void;
  agentMode: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  profile: Profile | null;
  authReady: boolean;
  sync: 'off' | 'syncing' | 'synced' | 'error';
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const q = query.trim().toLowerCase();
  const sorted = [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)));
  const syncLabel = { off: '', syncing: 'Syncing…', synced: 'Saved to your account', error: 'Sync failed' }[sync];

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[18.5rem] flex-col border-r border-white/[0.08] bg-[#0a0d0b]/95 backdrop-blur-2xl transition-transform duration-300 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-accent text-sm font-bold text-black shadow-[0_0_24px_rgba(34,211,238,0.35)]">
              N
            </span>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-white">Nameless Labs</h1>
              <p className="text-[11px] text-zinc-500">
                A quieter place to get work done · <span className="font-mono">{APP_VERSION_LABEL}</span>
              </p>
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
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.025] px-3 py-2 text-xs text-zinc-400"><span>Appearance</span><ThemeButton /></div>
        </div>

        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => {
              onAgentMode();
              onClose();
            }}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${agentMode ? "border-lime-300/35 bg-lime-300/[0.09] shadow-[0_0_22px_-12px_rgba(190,242,100,0.55)]" : "border-white/10 bg-white/[0.025] hover:border-lime-300/25 hover:bg-lime-300/[0.045]"}`}
            aria-label="Open Agent Mode"
            aria-pressed={agentMode}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-lime-300/20 bg-lime-300/[0.07] text-lg text-lime-200">✧</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-lime-100">Agent Mode</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">Plan · use tools · verify results</span>
            </span>
            <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${agentMode ? "border-violet-300/35 text-violet-100" : "border-violet-300/20 text-violet-200/80"}`}>{agentMode ? "ON" : "BETA"}</span>
          </button>
        </div>

        <div className="px-4 pb-2"><button type="button" onClick={() => { onOpenTools(); onClose(); }} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-3 text-left text-sm text-zinc-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.05]"><span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] text-lg text-cyan-200">✳</span><span className="min-w-0 flex-1"><b className="block font-semibold">Explore tools</b><small className="text-[11px] text-zinc-500">Search built-in capabilities</small></span><span className="text-xs text-zinc-500">↗</span></button></div>
        <div className="px-4 pb-2"><a href="https://tiers.namlesslabs.in.net" className="block w-full rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-2.5 text-center text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20">✦ Upgrade to Plus / Pro</a></div>

        {chats.length > 3 && (
          <div className="px-4 pb-1 pt-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              aria-label="Search chats"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-cyan-400/40"
            />
          </div>
        )}

        {voiceTranscript.length > 12 && (
          <section className="mx-3 mb-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-2.5">
            <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">Voice transcript · {voiceTranscript.length} messages</p>
            <div className="scroll-thin max-h-56 space-y-2 overflow-y-auto px-1" aria-label="Full voice conversation transcript">
              {voiceTranscript.map((message) => (
                <div key={message.id} className="text-xs leading-relaxed">
                  <span className={message.role === 'user' ? 'font-semibold text-cyan-200' : 'font-semibold text-zinc-400'}>{message.role === 'user' ? 'You' : 'NamelessAI'}</span>
                  <p className="whitespace-pre-wrap break-words text-zinc-300">{message.content}</p>
                </div>
              ))}
            </div>
          </section>
        )}
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-2" aria-label="Chat history">
          <p className="px-2 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">CONVERSATIONS</p>
          {sorted.length === 0 && (
            <p className="px-2 text-sm text-zinc-600">{q ? 'No chats match your search.' : profile ? 'Your conversations will appear here.' : 'Sign in to save your chats. As a guest, they disappear when you close this page.'}</p>
          )}
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

        <div className="relative border-t border-white/[0.08] p-3">
          {profile ? (
            <>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="animate-pop absolute inset-x-3 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-canvas p-1.5 shadow-2xl shadow-black/60">
                    <div className="px-3 py-2 text-xs text-zinc-500">
                      Signed in as
                      <p className="truncate text-sm text-zinc-200">{profile.email || profile.name}</p>
                      {syncLabel && <p className="mt-1 text-[11px] text-zinc-500">{syncLabel}</p>}
                    </div>
                    <button
                      onClick={() => {
                        setMenu(false);
                        onSignOut();
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
              <button
                onClick={() => setMenu((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menu}
                className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/[0.06]"
              >
                <Avatar name={profile.name} src={profile.avatar} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{profile.name}</span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-zinc-500">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        sync === 'error' ? 'bg-red-400' : sync === 'syncing' ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    {syncLabel || 'Signed in'}
                  </span>
                </span>
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex items-center gap-3">
                <Avatar size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white">Guest</span>
                  <span className="block truncate text-xs text-zinc-500">Not signed in · chats aren’t saved</span>
                </span>
              </div>
              <button
                onClick={onSignIn}
                disabled={!authReady}
                className="mt-3 w-full rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:opacity-50"
              >
                Sign in
              </button>
            </div>
          )}
          <p className="px-2 pb-1 pt-2.5 text-center text-[11px] text-zinc-600">
            Powered by <span className="text-zinc-400">Mythical Studios</span>
          </p>
        </div>
      </aside>
    </>
  );
}
