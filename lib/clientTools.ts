// Tools that run in the browser. Each returns text for the model; throwing = tool error.

import { calculate, formatNumber } from './calc';
import {
  addAlarm, clearAlarms, formatDuration, formatWhen, getAlarms, removeAlarm, resolveAlarmTime, type Repeat,
} from './alarms';
import { SERVER_TOOLS } from './toolDefs';
import type { ToolStatus } from './types';

export type EmailDraft = { to: string; subject: string; body: string };
export type EmailOutcome = { action: 'sent' | 'opened' | 'cancelled'; to?: string };

export type ToolContext = {
  /** Shows the confirmation card and resolves once the user decided (and any sending happened). */
  confirmEmail: (draft: EmailDraft) => Promise<EmailOutcome>;
  signal?: AbortSignal;
};

export type ToolOutcome = { status: ToolStatus; result: string };

// ── tiny localStorage helpers ───────────────────────────────────────────────
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Browser storage is full or unavailable.');
  }
}

const CONTACTS_KEY = 'nameless-labs-ai:contacts';
const NOTES_KEY = 'nameless-labs-ai:notes';
const NOTICE_KEY = 'nameless-labs-ai:alarm-notice';

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
  try {
    if (localStorage.getItem(NOTICE_KEY)) return '';
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    return '';
  }
  return ' (Tell the user once, briefly: alarms ring only while this page stays open in a browser tab.)';
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
      default:
        return { status: 'error', result: `Error: unknown tool "${name}".` };
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
