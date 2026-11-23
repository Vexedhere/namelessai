'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MEMORY_KEY, STORE_EVENT, TASKS_KEY, loadMemories, loadTasks, writeStore, type Memory, type Task,
} from '@/lib/agentStore';
import { COMPANY, TEAM } from '@/lib/team';
import { BrainIcon, CheckIcon, CloseIcon, GridIcon, ListIcon, SparkIcon, TrashIcon } from './Icons';

const ABILITIES: { title: string; blurb: string; prompts: string[] }[] = [
  {
    title: 'Research',
    blurb: 'Search the web, read pages, follow the news.',
    prompts: ['Search the web for the latest on Next.js 15 and summarise it', 'Read https://vercel.com/blog and tell me the top story', 'Top news about AI today', 'Define the word “ephemeral”'],
  },
  {
    title: 'Money & markets',
    blurb: 'Live currency, crypto and stock prices plus an expense tracker.',
    prompts: ['Convert 2500 USD to INR', 'Bitcoin and Ethereum price right now', 'Share price of RELIANCE.NS', 'Log an expense: 450 on food, lunch with team', 'How much did I spend this month?'],
  },
  {
    title: 'Memory & tasks',
    blurb: 'Remembers you across chats and keeps your to-do list.',
    prompts: ['Remember that I prefer concise answers and work in Hyderabad', 'Add a high priority task: send invoice to client, due tomorrow', 'What are my open tasks?', 'What do you remember about me?'],
  },
  {
    title: 'Create & export',
    blurb: 'Generates real files and calendar events you can download.',
    prompts: ['Create a markdown study plan for the next 7 days as a file', 'Make a CSV of 10 sample customers and download it', 'Add “Team sync” to my calendar tomorrow 4pm for 45 minutes', 'Generate a QR code for https://namelesslabs.ai'],
  },
  {
    title: 'Everyday actions',
    blurb: 'Alarms, timers, email, notes, weather, maps and more.',
    prompts: ['Wake me at 6:30 and start a 10 minute timer', 'Weather in Hyderabad this weekend', 'Directions to Charminar by walking', 'Draft an email to my team moving Friday’s standup to 11am'],
  },
  {
    title: 'Handy utilities',
    blurb: 'Converters, date maths, world clock, dice and passwords.',
    prompts: ['How many days until 31 December 2026?', 'Convert 72 °F to Celsius and 10 miles to km', 'What time is it in Tokyo and New York?', 'Generate a strong 24 character password'],
  },
];

type Tab = 'abilities' | 'memory' | 'tasks' | 'team';

export function AgentButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Agent hub: abilities, memory, tasks"
      aria-label="Open agent hub"
      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-2.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
    >
      <GridIcon width={14} height={14} />
      <span className="hidden sm:inline">Agent hub</span>
    </button>
  );
}

export function AgentPanel({ open, onClose, onPrompt, actionsReady }: { open: boolean; onClose: () => void; onPrompt: (text: string) => void; actionsReady: boolean }) {
  const [tab, setTab] = useState<Tab>('abilities');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const refresh = useCallback(() => {
    setMemories(loadMemories());
    setTasks(loadTasks());
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    window.addEventListener(STORE_EVENT, refresh);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(STORE_EVENT, refresh);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, refresh, onClose]);

  if (!open) return null;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'abilities', label: 'Abilities' },
    { id: 'memory', label: 'Memory', count: memories.length },
    { id: 'tasks', label: 'Tasks', count: tasks.filter((t) => !t.done).length },
    { id: 'team', label: 'Team' },
  ];

  const run = (p: string) => {
    onPrompt(p);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Agent hub">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-pop relative flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface/95 shadow-2xl shadow-black/70 backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
              <SparkIcon width={18} height={18} />
            </span>
            <div className="leading-tight">
              <h2 className="text-[15px] font-semibold text-white">Agent hub</h2>
              <p className="text-xs text-zinc-400">Everything your agent can do, remember and track</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white">
            <CloseIcon />
          </button>
        </div>

        <div className="flex gap-1 border-b border-white/[0.07] px-3 pt-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-xl px-3.5 py-2 text-sm font-medium transition ${tab === t.id ? 'bg-white/[0.07] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t.label}
              {!!t.count && <span className="ml-1.5 rounded-full bg-cyan-400/15 px-1.5 py-px text-[10px] text-cyan-200">{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto p-5">
          {tab === 'abilities' && (
            <div className="space-y-5">
              {!actionsReady && (
                <p className="rounded-xl border border-amber-300/25 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
                  Actions are off or this model can’t use tools. Turn on “Actions” and pick Lyric, Vega, Aether or NamelessAI.
                </p>
              )}
              {ABILITIES.map((g) => (
                <section key={g.title}>
                  <h3 className="text-sm font-semibold text-white">{g.title}</h3>
                  <p className="mb-2 text-xs text-zinc-400">{g.blurb}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.prompts.map((p) => (
                      <button
                        key={p}
                        onClick={() => run(p)}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-zinc-300 transition hover:border-cyan-400/40 hover:bg-white/[0.07] hover:text-white"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {tab === 'memory' && (
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
                <BrainIcon width={14} height={14} /> Stored only in this browser. Tell the agent “remember that…” to add, or delete items here.
              </p>
              {memories.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">Nothing remembered yet.</p>
              ) : (
                <ul className="space-y-2">
                  {memories.map((m) => (
                    <li key={m.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-200">
                      <span className="mt-0.5 rounded-full bg-violet-400/15 px-2 py-px text-[10px] text-violet-200">{m.category}</span>
                      <span className="min-w-0 flex-1 break-words">{m.text}</span>
                      <button
                        onClick={() => writeStore(MEMORY_KEY, loadMemories().filter((x) => x.id !== m.id))}
                        aria-label="Forget this"
                        className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-white/10 hover:text-red-300"
                      >
                        <TrashIcon width={15} height={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {memories.length > 0 && (
                <button onClick={() => writeStore(MEMORY_KEY, [])} className="mt-4 text-xs text-zinc-500 underline-offset-2 hover:text-red-300 hover:underline">
                  Forget everything
                </button>
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
                <ListIcon width={14} height={14} /> Say “add a task…” or “what’s on my to-do list?”. Tap a circle to complete.
              </p>
              {tasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">No tasks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm">
                      <button
                        onClick={() => writeStore(TASKS_KEY, loadTasks().map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                        aria-label={t.done ? 'Mark as open' : 'Mark as done'}
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${t.done ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300' : 'border-white/25 text-transparent hover:border-cyan-300'}`}
                      >
                        <CheckIcon width={12} height={12} />
                      </button>
                      <span className={`min-w-0 flex-1 break-words ${t.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                        {t.text}
                        {t.due && <span className="ml-2 text-xs text-zinc-500">due {t.due}</span>}
                      </span>
                      {t.priority === 'high' && <span className="rounded-full bg-red-400/15 px-2 py-px text-[10px] text-red-200">high</span>}
                      <button
                        onClick={() => writeStore(TASKS_KEY, loadTasks().filter((x) => x.id !== t.id))}
                        aria-label="Delete task"
                        className="shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-white/10 hover:text-red-300"
                      >
                        <TrashIcon width={15} height={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'team' && (
            <div>
              <p className="mb-4 text-sm text-zinc-300">
                <span className="font-medium text-white">{COMPANY.product}</span> is built by {COMPANY.studio}. Ask the agent “who founded this?” or “who is the CEO?”.
              </p>
              <ul className="grid gap-3 sm:grid-cols-3">
                {TEAM.map((m) => (
                  <li key={m.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-bold text-black">{m.name[0]}</span>
                    <p className="mt-3 font-semibold text-white">{m.name}</p>
                    <p className="mt-1 text-xs leading-snug text-zinc-400">{m.roles.join(' · ')}</p>
                  </li>
                ))}
              </ul>
              <button onClick={() => run('Who are the founders and leadership of Nameless Labs AI?')} className="mt-5 text-xs text-cyan-300 underline-offset-2 hover:underline">
                Ask the agent about the team →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
