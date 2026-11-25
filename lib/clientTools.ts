// Tools that run in the browser. Each returns text for the model; throwing = tool error.

import { calculate, formatNumber } from './calc';
import {
  addAlarm, clearAlarms, formatDuration, formatWhen, getAlarms, removeAlarm, resolveAlarmTime, type Repeat,
} from './alarms';
import { SERVER_TOOLS } from './toolDefs';
import { convertUnits } from './units';
import { runMoreTool } from './moreTools';
import { runDesktopTool } from './desktopTools';
import { applyTheme, findTheme } from './theme';
import { storeGet, storeSet } from './store';
import type { ToolStatus } from './types';

export type EmailDraft = { to: string; subject: string; body: string };
export type EmailOutcome = { action: 'sent' | 'opened' | 'cancelled'; to?: string };

export type ToolContext = {
  /** Shows the confirmation card and resolves once the user decided (and any sending happened). */
  confirmEmail: (draft: EmailDraft) => Promise<EmailOutcome>;
  signal?: AbortSignal;
};

export type ToolOutcome = { status: ToolStatus; result: string };

// ── account-backed data helpers (in memory; synced to the signed-in user's account, see lib/store.ts) ──
function read<T>(key: string, fallback: T): T {
  return storeGet<T>(key, fallback);
}
function write(key: string, value: unknown) {
  try {
    storeSet(key, value);
  } catch {
    throw new Error('Could not save this data.');
  }
}

const CONTACTS_KEY = 'nameless-labs-ai:contacts';
const NOTES_KEY = 'nameless-labs-ai:notes';
let alarmNoticeShown = false;

export type Contact = { name: string; email: string };
export const loadContacts = () => read<Contact[]>(CONTACTS_KEY, []).filter((c) => c && c.name && c.email);

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

/** "Rahul" -> address via saved contacts; passes real addresses through. */
export function resolveRecipients(to: string, contacts: Contact[] = loadContacts()): { emails: string[] } | { error: string } {
  const parts = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { error: 'No recipient given. Ask the user who to send it to.' };
  const emails: string[] = [];
  for (const p of parts) {
    const bracket = /<([^>]+)>/.exec(p);
    const candidate = (bracket ? bracket[1] : p).trim();
    if (EMAIL_RE.test(candidate)) { emails.push(candidate); continue; }
    const q = p.toLowerCase();
    const exact = contacts.filter((c) => c.name.toLowerCase() === q);
    const hits = exact.length ? exact : contacts.filter((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
    if (hits.length === 1) emails.push(hits[0].email);
    else if (hits.length > 1) return { error: `"${p}" matches several contacts (${hits.map((h) => `${h.name} <${h.email}>`).join(', ')}). Ask the user which one.` };
    else return { error: `No saved contact named "${p}" and it is not an email address. Ask the user for their email address (you can then save it with save_contact).` };
  }
  return { emails };
}

function asString(v: unknown, field: string, max = 5000): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing "${field}".`);
  return v.trim().slice(0, max);
}

async function requestNotifications() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

function describeAlarm(a: { id: string; at: number; label: string; kind: string; repeat: Repeat }) {
  const left = formatDuration(a.at - Date.now());
  return `${a.kind} ${a.id}${a.label ? ` "${a.label}"` : ''}: ${formatWhen(a.at)} (in ${left})${a.repeat !== 'none' ? `, repeats ${a.repeat}` : ''}`;
}

function firstTimeNotice(): string {
  if (alarmNoticeShown) return '';
  alarmNoticeShown = true;
  return ' (Tell the user once, briefly: alarms ring only while this page stays open in a browser tab.)';
}


// ── tasks ───────────────────────────────────────────────────────────────────
const TASKS_KEY = 'nameless-labs-ai:tasks';
type Task = { id: string; text: string; done: boolean; due?: string; priority: 'low' | 'normal' | 'high'; at: number };
const loadTasks = () => read<Task[]>(TASKS_KEY, []).filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string');
const fmtTask = (t: Task) => `${t.done ? '[x]' : '[ ]'} ${t.id}: ${t.text}${t.due ? ` (due ${t.due})` : ''}${t.priority === 'high' ? ' ❗' : t.priority === 'low' ? ' (low)' : ''}`;

function manageTasks(args: Record<string, unknown>): ToolOutcome {
  const action = typeof args.action === 'string' ? args.action : '';
  const tasks = loadTasks();
  const text = typeof args.text === 'string' ? args.text.trim().slice(0, 300) : '';
  const find = () => {
    if (typeof args.id === 'string' && args.id) return tasks.find((t) => t.id === args.id);
    if (text) return tasks.find((t) => !t.done && t.text.toLowerCase().includes(text.toLowerCase())) ?? tasks.find((t) => t.text.toLowerCase().includes(text.toLowerCase()));
    return undefined;
  };
  switch (action) {
    case 'add': {
      if (!text) return { status: 'error', result: 'Error: missing task text.' };
      const t: Task = {
        id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
        text,
        done: false,
        due: typeof args.due === 'string' && args.due.trim() ? args.due.trim().slice(0, 60) : undefined,
        priority: args.priority === 'high' || args.priority === 'low' ? args.priority : 'normal',
        at: Date.now(),
      };
      write(TASKS_KEY, [...tasks, t].slice(-300));
      return { status: 'done', result: `Added task ${fmtTask(t)}` };
    }
    case 'list': {
      const open = tasks.filter((t) => !t.done);
      const done = tasks.filter((t) => t.done);
      if (!tasks.length) return { status: 'done', result: 'The to-do list is empty.' };
      return { status: 'done', result: [...open, ...done.slice(-5)].map(fmtTask).join('\n') + `\n(${open.length} open, ${done.length} done)` };
    }
    case 'complete': {
      const t = find();
      if (!t) return { status: 'error', result: 'Error: no matching task. Call manage_tasks with action "list" to see ids.' };
      write(TASKS_KEY, tasks.map((x) => (x.id === t.id ? { ...x, done: true } : x)));
      return { status: 'done', result: `Marked done: ${t.text}` };
    }
    case 'remove': {
      const t = find();
      if (!t) return { status: 'error', result: 'Error: no matching task.' };
      write(TASKS_KEY, tasks.filter((x) => x.id !== t.id));
      return { status: 'done', result: `Removed: ${t.text}` };
    }
    case 'clear_done': {
      const n = tasks.filter((t) => t.done).length;
      write(TASKS_KEY, tasks.filter((t) => !t.done));
      return { status: 'done', result: n ? `Cleared ${n} finished task(s).` : 'No finished tasks to clear.' };
    }
    default:
      return { status: 'error', result: 'Error: action must be add, list, complete, remove or clear_done.' };
  }
}

// ── world time ──────────────────────────────────────────────────────────────
const CITY_TZ: Record<string, string> = {
  hyderabad: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', bengaluru: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', pune: 'Asia/Kolkata', chennai: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', india: 'Asia/Kolkata',
  london: 'Europe/London', uk: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid', rome: 'Europe/Rome', amsterdam: 'Europe/Amsterdam', moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul',
  dubai: 'Asia/Dubai', abu_dhabi: 'Asia/Dubai', riyadh: 'Asia/Riyadh', karachi: 'Asia/Karachi', dhaka: 'Asia/Dhaka', kathmandu: 'Asia/Kathmandu', colombo: 'Asia/Colombo',
  singapore: 'Asia/Singapore', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', 'hong kong': 'Asia/Hong_Kong', shanghai: 'Asia/Shanghai', beijing: 'Asia/Shanghai', china: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', seoul: 'Asia/Seoul', manila: 'Asia/Manila',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', auckland: 'Pacific/Auckland',
  'new york': 'America/New_York', nyc: 'America/New_York', boston: 'America/New_York', toronto: 'America/Toronto', chicago: 'America/Chicago', dallas: 'America/Chicago', denver: 'America/Denver',
  'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver', 'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo',
  cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg', utc: 'UTC', gmt: 'UTC',
};

function worldTime(placeRaw: string): ToolOutcome {
  const key = placeRaw.trim().toLowerCase();
  const tz = CITY_TZ[key] ?? CITY_TZ[key.split(',')[0].trim()] ?? placeRaw.trim().replace(/\s+/g, '_');
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat([], { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(now);
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = (zone: string) => {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(now).find((x) => x.type === 'timeZoneName')?.value ?? '';
      return p === 'GMT' ? 'UTC+00:00' : p.replace('GMT', 'UTC');
    };
    return { status: 'done', result: `${fmt} in ${tz} (${offset(tz)}). The user's own timezone is ${here} (${offset(here)}).` };
  } catch {
    return { status: 'error', result: `Error: I don't know the timezone for "${placeRaw}". Try a major city or an IANA name like "Asia/Tokyo".` };
  }
}

// ── randomness / passwords ──────────────────────────────────────────────────
function randInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

function makePassword(length: number, symbols: boolean) {
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', ...(symbols ? ['!@#$%^&*-_=+?'] : [])];
  const all = sets.join('');
  const chars = sets.map((set) => set[randInt(set.length)]); // guarantee one of each class
  while (chars.length < length) chars.push(all[randInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function randomPick(args: Record<string, unknown>): ToolOutcome {
  const count = Math.min(20, Math.max(1, Math.floor(Number(args.count) || 1)));
  switch (args.kind) {
    case 'dice': {
      const sides = Math.min(1000, Math.max(2, Math.floor(Number(args.sides) || 6)));
      const rolls = Array.from({ length: count }, () => randInt(sides) + 1);
      return { status: 'done', result: `Rolled ${count}d${sides}: ${rolls.join(', ')}${count > 1 ? ` (total ${rolls.reduce((a, b) => a + b, 0)})` : ''}` };
    }
    case 'coin': {
      const flips = Array.from({ length: count }, () => (randInt(2) ? 'heads' : 'tails'));
      return { status: 'done', result: `Coin flip${count > 1 ? 's' : ''}: ${flips.join(', ')}` };
    }
    case 'number': {
      const lo = Math.floor(Number(args.min) || 1);
      const hi = Math.floor(Number(args.max) || 100);
      if (hi < lo) return { status: 'error', result: 'Error: max must be at least min.' };
      return { status: 'done', result: `Random number between ${lo} and ${hi}: ${lo + randInt(hi - lo + 1)}` };
    }
    case 'choice': {
      const opts = Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === 'string' && !!o.trim()).slice(0, 100) : [];
      if (opts.length < 2) return { status: 'error', result: 'Error: give at least two options to choose from.' };
      return { status: 'done', result: `Picked: ${opts[randInt(opts.length)]}` };
    }
    default:
      return { status: 'error', result: 'Error: kind must be dice, coin, number or choice.' };
  }
}

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(8)));
}

// ── dispatcher ──────────────────────────────────────────────────────────────

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutcome> {
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawArgs || '{}');
    args = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { status: 'error', result: 'Error: the tool arguments were not valid JSON.' };
  }

  try {
    if (SERVER_TOOLS.has(name)) return await runServerTool(name, args, ctx.signal);
    switch (name) {
      case 'set_alarm': {
        const when = resolveAlarmTime(args);
        if ('error' in when) return { status: 'error', result: `Error: ${when.error}` };
        const repeat: Repeat = args.repeat === 'daily' || args.repeat === 'weekdays' ? args.repeat : 'none';
        const label = typeof args.label === 'string' ? args.label.trim().slice(0, 100) : '';
        const a = addAlarm({ at: when.at, label, kind: 'alarm', repeat });
        void requestNotifications();
        return { status: 'done', result: `Alarm set: ${describeAlarm(a)}.${firstTimeNotice()}` };
      }
      case 'set_timer': {
        const secs = Math.round((Number(args.minutes) || 0) * 60 + (Number(args.seconds) || 0));
        if (!(secs >= 1) || secs > 86_400) return { status: 'error', result: 'Error: timer must be between 1 second and 24 hours.' };
        const label = typeof args.label === 'string' ? args.label.trim().slice(0, 100) : '';
        const a = addAlarm({ at: Date.now() + secs * 1000, label, kind: 'timer', repeat: 'none' });
        void requestNotifications();
        return { status: 'done', result: `Timer started: ${describeAlarm(a)}.${firstTimeNotice()}` };
      }
      case 'list_alarms': {
        const list = getAlarms();
        return { status: 'done', result: list.length ? list.map(describeAlarm).join('\n') : 'No active alarms or timers.' };
      }
      case 'cancel_alarm': {
        if (args.all === true) {
          const n = clearAlarms();
          return { status: 'done', result: n ? `Cancelled ${n} alarm(s)/timer(s).` : 'There was nothing to cancel.' };
        }
        const id = asString(args.id, 'id', 40);
        return removeAlarm(id)
          ? { status: 'done', result: `Cancelled ${id}.` }
          : { status: 'error', result: `Error: no alarm with id "${id}". Call list_alarms to see the ids.` };
      }
      case 'save_contact': {
        const n = asString(args.name, 'name', 80);
        const email = asString(args.email, 'email', 200);
        if (!EMAIL_RE.test(email)) return { status: 'error', result: `Error: "${email}" is not a valid email address.` };
        const rest = loadContacts().filter((c) => c.name.toLowerCase() !== n.toLowerCase());
        write(CONTACTS_KEY, [...rest, { name: n, email }].slice(-200));
        return { status: 'done', result: `Saved ${n} <${email}>.` };
      }
      case 'find_contact': {
        const q = asString(args.name, 'name', 80).toLowerCase();
        const hits = loadContacts().filter((c) => c.name.toLowerCase().includes(q));
        return { status: 'done', result: hits.length ? hits.map((c) => `${c.name} <${c.email}>`).join('\n') : `No saved contact matching "${q}".` };
      }
      case 'save_note': {
        const text = asString(args.text, 'text', 1000);
        const list = (typeof args.list === 'string' && args.list.trim() ? args.list.trim() : 'notes').slice(0, 40).toLowerCase();
        const notes = read<{ list: string; text: string; at: number }[]>(NOTES_KEY, []);
        write(NOTES_KEY, [...notes, { list, text, at: Date.now() }].slice(-500));
        return { status: 'done', result: `Saved to "${list}": ${text}` };
      }
      case 'list_notes': {
        const want = typeof args.list === 'string' && args.list.trim() ? args.list.trim().toLowerCase() : '';
        const notes = read<{ list: string; text: string; at: number }[]>(NOTES_KEY, []).filter((n) => !want || n.list === want);
        return { status: 'done', result: notes.length ? notes.map((n) => `[${n.list}] ${n.text}`).join('\n') : want ? `No notes in "${want}".` : 'No saved notes.' };
      }
      case 'get_current_time': {
        const now = new Date();
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return { status: 'done', result: `${now.toLocaleString([], { dateStyle: 'full', timeStyle: 'long' })} (${tz})` };
      }
      case 'calculate': {
        const expr = asString(args.expression, 'expression', 200);
        return { status: 'done', result: `${expr} = ${formatNumber(calculate(expr))}` };
      }
      case 'convert_units': {
        const v = Number(args.value);
        if (!Number.isFinite(v)) return { status: 'error', result: 'Error: "value" must be a number.' };
        const r = convertUnits(v, asString(args.from, 'from', 30), asString(args.to, 'to', 30));
        return r.ok ? { status: 'done', result: `${fmtNum(v)} ${r.from} = ${fmtNum(r.value)} ${r.to}` } : { status: 'error', result: `Error: ${r.error}` };
      }
      case 'world_time':
        return worldTime(asString(args.place, 'place', 80));
      case 'manage_tasks':
        return manageTasks(args);
      case 'generate_password': {
        const len = Math.min(64, Math.max(8, Math.floor(Number(args.length) || 16)));
        const pw = makePassword(len, args.symbols !== false);
        return { status: 'done', result: `Generated a ${len}-character password: ${pw}\n(It was created locally in the browser. Suggest the user store it in a password manager.)` };
      }
      case 'random_pick':
        return randomPick(args);
      case 'set_theme': {
        const t = findTheme(asString(args.theme, 'theme', 40));
        if (!t) return { status: 'error', result: 'Error: unknown theme. Use a colour (e.g. Ruby, Azure, Violet, Emerald) optionally followed by a style (Midnight, Neon, Pastel, Noir…), or "random".' };
        applyTheme(t.id);
        return { status: 'done', result: `Theme changed to ${t.name}.` };
      }
      case 'copy_to_clipboard': {
        const text = asString(args.text, 'text', 20_000);
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          return { status: 'error', result: 'Error: the browser blocked clipboard access. Ask the user to copy the text manually.' };
        }
        return { status: 'done', result: `Copied ${text.length} characters to the clipboard.` };
      }
      case 'open_website': {
        const raw = asString(args.url, 'url', 2000);
        let u: URL;
        try {
          u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
        } catch {
          return { status: 'error', result: 'Error: that is not a valid URL.' };
        }
        if (u.protocol !== 'https:') return { status: 'error', result: 'Error: only https:// links can be opened.' };
        const w = window.open(u.toString(), '_blank', 'noopener,noreferrer');
        return { status: 'done', result: w ? `Opened ${u.hostname}.` : `Tried to open ${u.toString()} but the browser may have blocked the pop-up; the user can allow pop-ups for this site.` };
      }
      case 'send_email': {
        const subject = asString(args.subject, 'subject', 200);
        const body = asString(args.body, 'body', 10_000);
        const recipients = resolveRecipients(asString(args.to, 'to', 500));
        if ('error' in recipients) return { status: 'error', result: `Error: ${recipients.error}` };
        const out = await ctx.confirmEmail({ to: recipients.emails.join(', '), subject, body });
        if (out.action === 'cancelled') return { status: 'cancelled', result: 'The user cancelled; the email was NOT sent.' };
        if (out.action === 'opened') return { status: 'done', result: `The draft was opened in the user's mail app for them to send (delivery cannot be confirmed).` };
        return { status: 'done', result: `Email sent to ${out.to}.` };
      }
      default: {
        const desk = await runDesktopTool(name, args);
        if (desk) return desk;
        const more = await runMoreTool(name, args);
        return more ?? { status: 'error', result: `Error: unknown tool "${name}".` };
      }
    }
  } catch (err) {
    return { status: 'error', result: `Error: ${err instanceof Error ? err.message : 'tool failed.'}` };
  }
}

async function runServerTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolOutcome> {
  const res = await fetch('/api/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, args }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) return { status: 'error', result: `Error: ${data?.error || `tool failed (${res.status})`}` };
  return { status: 'done', result: String(data?.result ?? 'Done.') };
}

/** Sends a confirmed draft through the server. Throws with a user-readable message. */
export async function sendEmailViaServer(draft: EmailDraft, accessToken: string | undefined): Promise<void> {
  const res = await fetch('/api/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ name: 'send_email', args: draft }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => null);
  throw Object.assign(new Error(data?.error || `Sending failed (${res.status}).`), { code: data?.code as string | undefined });
}

export function mailtoUrl(d: EmailDraft) {
  return `mailto:${encodeURIComponent(d.to).replace(/%2C/g, ',').replace(/%40/g, '@')}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
}
