// Alarm + timer store (localStorage-backed, observable). The ringing itself lives in
// components/AlarmRinger.tsx; this file is pure data + time maths so it can be unit-tested.

export type Repeat = 'none' | 'daily' | 'weekdays';
export type Alarm = {
  id: string;
  /** epoch ms of the next ring */
  at: number;
  label: string;
  kind: 'alarm' | 'timer';
  repeat: Repeat;
};

const KEY = 'nameless-labs-ai:alarms';
let alarms: Alarm[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof localStorage === 'undefined') return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(raw)) {
      alarms = raw.filter((a) => a && typeof a.id === 'string' && typeof a.at === 'number').slice(0, 100);
    }
  } catch {
    alarms = [];
  }
}

function commit(next: Alarm[]) {
  alarms = next.sort((a, b) => a.at - b.at);
  try {
    localStorage.setItem(KEY, JSON.stringify(alarms));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function subscribeAlarms(fn: () => void) {
  load();
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      listeners.forEach((l) => l());
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
export const getAlarms = (): Alarm[] => {
  load();
  return alarms;
};
export const EMPTY_ALARMS: Alarm[] = [];

export function addAlarm(a: Omit<Alarm, 'id'>): Alarm {
  load();
  if (alarms.length >= 100) throw new Error('Too many alarms (limit 100). Cancel some first.');
  const alarm = { ...a, id: Math.random().toString(36).slice(2, 6) + Date.now().toString(36).slice(-2) };
  commit([...alarms, alarm]);
  return alarm;
}
export function removeAlarm(id: string): boolean {
  load();
  const had = alarms.some((a) => a.id === id);
  if (had) commit(alarms.filter((a) => a.id !== id));
  return had;
}
export function clearAlarms(): number {
  load();
  const n = alarms.length;
  if (n) commit([]);
  return n;
}
export function replaceAlarm(id: string, patch: Partial<Alarm>) {
  load();
  commit(alarms.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

// ── time maths ──────────────────────────────────────────────────────────────

export type TimeSpec = { time?: unknown; date?: unknown; in_minutes?: unknown };

/** Turns the model's arguments into an absolute time, in the user's local zone. */
export function resolveAlarmTime(spec: TimeSpec, now: Date = new Date()): { at: number } | { error: string } {
  if (spec.in_minutes !== undefined && spec.in_minutes !== null && spec.in_minutes !== '') {
    const m = Number(spec.in_minutes);
    if (!Number.isFinite(m) || m <= 0 || m > 60 * 24 * 7) return { error: 'in_minutes must be between 1 and 10080.' };
    return { at: now.getTime() + Math.round(m * 60_000) };
  }
  if (typeof spec.time !== 'string') return { error: 'Provide `time` (HH:MM, 24h) or `in_minutes`.' };
  const t = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(spec.time);
  if (!t || +t[1] > 23 || +t[2] > 59) return { error: `Invalid time "${spec.time}". Use 24-hour HH:MM.` };
  const hh = +t[1];
  const mm = +t[2];

  if (typeof spec.date === 'string' && spec.date.trim()) {
    const d = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(spec.date);
    if (!d) return { error: `Invalid date "${spec.date}". Use YYYY-MM-DD.` };
    const at = new Date(+d[1], +d[2] - 1, +d[3], hh, mm, 0, 0);
    if (at.getMonth() !== +d[2] - 1) return { error: `"${spec.date}" is not a real date.` };
    if (at.getTime() <= now.getTime()) return { error: `${spec.date} ${spec.time} is already in the past.` };
    return { at: at.getTime() };
  }
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return { at: at.getTime() };
}

/** Next ring time for a repeating alarm (DST-safe: works on calendar days, not 24h blocks). */
export function nextOccurrence(at: number, repeat: Repeat, now: number = Date.now()): number | null {
  if (repeat === 'none') return null;
  const d = new Date(at);
  do {
    d.setDate(d.getDate() + 1);
    if (repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  } while (d.getTime() <= now);
  return d.getTime();
}

export function formatWhen(at: number, now: number = Date.now()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const tomorrow = new Date(now + 86_400_000).toDateString() === d.toDateString();
  if (sameDay) return `today at ${time}`;
  if (tomorrow) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return sec && m < 10 ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}
