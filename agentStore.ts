// On-device storage for the agent's memory, tasks and expenses (localStorage).
// Shared by the tools (lib/clientToolsMore.ts) and the Agent panel UI.

export const MEMORY_KEY = 'nameless-labs-ai:memory';
export const TASKS_KEY = 'nameless-labs-ai:tasks';
export const EXPENSES_KEY = 'nameless-labs-ai:expenses';
export const STORE_EVENT = 'nameless-agent-store';

export type Memory = { id: string; text: string; category: string; at: number };
export type Task = { id: string; text: string; due?: string; priority: 'low' | 'normal' | 'high'; done: boolean; at: number };
export type Expense = { id: string; amount: number; category: string; note: string; date: string; at: number };

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Browser storage is full or unavailable.');
  }
  try {
    window.dispatchEvent(new Event(STORE_EVENT));
  } catch {
    /* ignore */
  }
}

export const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;

export const loadMemories = () => readStore<Memory[]>(MEMORY_KEY, []).filter((m) => m && typeof m.text === 'string');
export const loadTasks = () => readStore<Task[]>(TASKS_KEY, []).filter((t) => t && typeof t.text === 'string');
export const loadExpenses = () => readStore<Expense[]>(EXPENSES_KEY, []).filter((e) => e && Number.isFinite(e.amount));

/** Text appended to the system prompt so the model "remembers" the user across chats. */
export function memoryPrompt(): string {
  const mems = loadMemories().slice(-40);
  if (!mems.length) return '';
  return mems.map((m) => `- ${m.text}`).join('\n');
}
