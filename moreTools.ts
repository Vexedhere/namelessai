// Extra browser-side tools: dates, text utilities, finance maths, expenses, bookmarks, habits, colours, focus sessions.
// Called from clientTools.runTool's default branch. Returns null when the name is not one of ours.

import { addAlarm } from './alarms';
import type { ToolOutcome } from './clientTools';

const ok = (result: string): ToolOutcome => ({ status: 'done', result });
const bad = (msg: string): ToolOutcome => ({ status: 'error', result: `Error: ${msg}` });

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
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
const money = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d;
}
const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

// ── date_calc ───────────────────────────────────────────────────────────────
function dateCalc(a: Record<string, unknown>): ToolOutcome {
  const action = str(a.action);
  const today = parseDay(dayKey())!;
  if (action === 'diff') {
    const from = parseDay(str(a.from)) ?? today;
    const to = parseDay(str(a.to));
    if (!to) return bad('"to" must be a date in YYYY-MM-DD form.');
    const n = daysBetween(from, to);
    return ok(`${fmtDay(from)} → ${fmtDay(to)}: ${Math.abs(n)} day(s) ${n < 0 ? 'earlier' : 'later'} (${(Math.abs(n) / 7).toFixed(1)} weeks).`);
  }
  if (action === 'add') {
    const base = parseDay(str(a.date)) ?? today;
    const days = num(a.days);
    if (!Number.isFinite(days)) return bad('"days" must be a number (negative to go back).');
    const d = new Date(base);
    d.setDate(d.getDate() + Math.round(days));
    return ok(`${fmtDay(base)} ${days >= 0 ? '+' : '−'} ${Math.abs(Math.round(days))} day(s) = ${fmtDay(d)} (${dayKey(d)}).`);
  }
  if (action === 'weekday') {
    const d = parseDay(str(a.date));
    return d ? ok(`${dayKey(d)} is a ${fmtDay(d)}.`) : bad('"date" must be YYYY-MM-DD.');
  }
  if (action === 'until') {
    const d = parseDay(str(a.date));
    if (!d) return bad('"date" must be YYYY-MM-DD.');
    const n = daysBetween(today, d);
    return ok(n === 0 ? `That is today (${fmtDay(d)}).` : n > 0 ? `${n} day(s) until ${fmtDay(d)}.` : `${fmtDay(d)} was ${-n} day(s) ago.`);
  }
  return bad('action must be diff, add, weekday or until.');
}

// ── text_tools ──────────────────────────────────────────────────────────────
async function textTools(a: Record<string, unknown>): Promise<ToolOutcome> {
  const text = typeof a.text === 'string' ? a.text.slice(0, 50_000) : '';
  if (!text) return bad('Missing "text".');
  switch (str(a.action)) {
    case 'stats': {
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const sentences = (text.match(/[.!?]+(\s|$)/g) ?? []).length || 1;
      return ok(`${words} words, ${text.length} characters (${text.replace(/\s/g, '').length} without spaces), ${text.split(/\n/).length} lines, ~${sentences} sentences, ~${Math.max(1, Math.round(words / 230))} min read.`);
    }
    case 'upper': return ok(text.toUpperCase());
    case 'lower': return ok(text.toLowerCase());
    case 'title': return ok(text.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()));
    case 'reverse': return ok([...text].reverse().join(''));
    case 'slug': return ok(text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    case 'sort_lines': return ok(text.split('\n').sort((x, y) => x.localeCompare(y)).join('\n'));
    case 'dedupe_lines': return ok([...new Set(text.split('\n'))].join('\n'));
    case 'url_encode': return ok(encodeURIComponent(text));
    case 'base64_encode': return ok(btoa(String.fromCharCode(...new TextEncoder().encode(text))));
    case 'base64_decode':
      try {
        return ok(new TextDecoder().decode(Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0))));
      } catch {
        return bad('That is not valid Base64.');
      }
    case 'sha256': {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return ok([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));
    }
    default: return bad('Unknown text action.');
  }
}

// ── finance_calc ────────────────────────────────────────────────────────────
function financeCalc(a: Record<string, unknown>): ToolOutcome {
  const kind = str(a.kind);
  const n = (k: string) => num(a[k]);
  switch (kind) {
    case 'emi': {
      const P = n('principal'), r = n('annual_rate') / 1200, N = n('years') * 12;
      if (![P, r, N].every(Number.isFinite) || P <= 0 || N <= 0 || r < 0) return bad('Need principal, annual_rate (%) and years.');
      const emi = r === 0 ? P / N : (P * r * (1 + r) ** N) / ((1 + r) ** N - 1);
      return ok(`EMI ≈ ${money(emi)} per month for ${N} months. Total paid ${money(emi * N)}, of which interest ${money(emi * N - P)}.`);
    }
    case 'sip': {
      const M = n('monthly'), r = n('annual_rate') / 1200, N = n('years') * 12;
      if (![M, r, N].every(Number.isFinite) || M <= 0 || N <= 0 || r < 0) return bad('Need monthly, annual_rate (%) and years.');
      const fv = r === 0 ? M * N : M * (((1 + r) ** N - 1) / r) * (1 + r);
      return ok(`Investing ${money(M)}/month for ${N / 12} years at ${n('annual_rate')}% grows to ≈ ${money(fv)} (invested ${money(M * N)}, gain ${money(fv - M * N)}). Returns are assumed constant, not guaranteed.`);
    }
    case 'compound': {
      const P = n('principal'), R = n('annual_rate') / 100, Y = n('years'), f = Number.isFinite(n('times_per_year')) ? n('times_per_year') : 1;
      if (![P, R, Y].every(Number.isFinite) || P <= 0 || Y <= 0) return bad('Need principal, annual_rate (%) and years.');
      const fv = P * (1 + R / f) ** (f * Y);
      return ok(`${money(P)} at ${n('annual_rate')}% compounded ${f}×/year for ${Y} years = ${money(fv)} (gain ${money(fv - P)}).`);
    }
    case 'gst': {
      const amt = n('amount'), rate = Number.isFinite(n('rate')) ? n('rate') : 18;
      if (!Number.isFinite(amt) || amt < 0) return bad('Need amount.');
      if (a.inclusive === true) { const base = amt / (1 + rate / 100); return ok(`Amount ${money(amt)} includes ${rate}% tax: base ${money(base)}, tax ${money(amt - base)}.`); }
      return ok(`${money(amt)} + ${rate}% tax (${money((amt * rate) / 100)}) = ${money(amt * (1 + rate / 100))}.`);
    }
    case 'tip': {
      const amt = n('amount'), pct = Number.isFinite(n('percent')) ? n('percent') : 10, people = Math.max(1, Math.floor(n('people') || 1));
      if (!Number.isFinite(amt) || amt < 0) return bad('Need amount.');
      const total = amt * (1 + pct / 100);
      return ok(`Bill ${money(amt)} + ${pct}% tip = ${money(total)}${people > 1 ? `; split ${people} ways = ${money(total / people)} each` : ''}.`);
    }
    case 'percent_change': {
      const from = n('from'), to = n('to');
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return bad('Need non-zero "from" and a "to" value.');
      const pc = ((to - from) / Math.abs(from)) * 100;
      return ok(`${from} → ${to} is a ${pc >= 0 ? 'rise' : 'fall'} of ${Math.abs(pc).toFixed(2)}%.`);
    }
    case 'discount': {
      const price = n('amount'), pct = n('percent');
      if (!Number.isFinite(price) || !Number.isFinite(pct)) return bad('Need amount and percent.');
      return ok(`${money(price)} with ${pct}% off = ${money(price * (1 - pct / 100))} (you save ${money((price * pct) / 100)}).`);
    }
    default: return bad('kind must be emi, sip, compound, gst, tip, percent_change or discount.');
  }
}

// ── expenses ────────────────────────────────────────────────────────────────
type Expense = { id: string; amount: number; category: string; note: string; day: string };
const EXP_KEY = 'nameless-labs-ai:expenses';

function manageExpenses(a: Record<string, unknown>): ToolOutcome {
  const all = read<Expense[]>(EXP_KEY, []).filter((e) => e && typeof e.amount === 'number');
  switch (str(a.action)) {
    case 'add': {
      const amount = num(a.amount);
      if (!Number.isFinite(amount) || amount <= 0) return bad('"amount" must be a positive number.');
      const e: Expense = { id: newId('e'), amount, category: (str(a.category, 40) || 'general').toLowerCase(), note: str(a.note, 120), day: parseDay(str(a.date)) ? str(a.date) : dayKey() };
      write(EXP_KEY, [...all, e].slice(-2000));
      return ok(`Logged ${money(amount)} under "${e.category}"${e.note ? ` (${e.note})` : ''} on ${e.day}. [${e.id}]`);
    }
    case 'list': {
      const rows = all.slice(-15).reverse();
      return ok(rows.length ? rows.map((e) => `${e.id} ${e.day} ${money(e.amount)} ${e.category}${e.note ? ` – ${e.note}` : ''}`).join('\n') : 'No expenses logged yet.');
    }
    case 'summary': {
      const period = str(a.period) || 'month';
      const now = new Date();
      const since = period === 'today' ? dayKey() : period === 'week' ? dayKey(new Date(now.getTime() - 6 * 86_400_000)) : period === 'month' ? `${dayKey().slice(0, 8)}01` : '0000-00-00';
      const rows = all.filter((e) => e.day >= since);
      if (!rows.length) return ok(`No expenses for ${period}.`);
      const by = new Map<string, number>();
      rows.forEach((e) => by.set(e.category, (by.get(e.category) ?? 0) + e.amount));
      const total = rows.reduce((s, e) => s + e.amount, 0);
      return ok(`Spending (${period}): total ${money(total)} across ${rows.length} entries.\n` + [...by.entries()].sort((x, y) => y[1] - x[1]).map(([c, v]) => `- ${c}: ${money(v)} (${Math.round((v / total) * 100)}%)`).join('\n'));
    }
    case 'remove': {
      const id = str(a.id, 40);
      if (!all.some((e) => e.id === id)) return bad('No expense with that id. Use "list" to see ids.');
      write(EXP_KEY, all.filter((e) => e.id !== id));
      return ok(`Removed ${id}.`);
    }
    default: return bad('action must be add, list, summary or remove.');
  }
}

// ── bookmarks ───────────────────────────────────────────────────────────────
type Bookmark = { id: string; url: string; title: string; tag: string };
const BM_KEY = 'nameless-labs-ai:bookmarks';

function manageBookmarks(a: Record<string, unknown>): ToolOutcome {
  const all = read<Bookmark[]>(BM_KEY, []).filter((b) => b && typeof b.url === 'string');
  switch (str(a.action)) {
    case 'add': {
      const raw = str(a.url, 2000);
      let u: URL;
      try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return bad('That is not a valid URL.'); }
      if (!/^https?:$/.test(u.protocol)) return bad('Only http(s) links can be saved.');
      const b: Bookmark = { id: newId('b'), url: u.toString(), title: str(a.title, 120) || u.hostname, tag: str(a.tag, 30).toLowerCase() };
      write(BM_KEY, [...all, b].slice(-500));
      return ok(`Saved bookmark "${b.title}"${b.tag ? ` [${b.tag}]` : ''}.`);
    }
    case 'list': {
      const tag = str(a.tag, 30).toLowerCase();
      const rows = all.filter((b) => !tag || b.tag === tag);
      return ok(rows.length ? rows.map((b) => `${b.id} ${b.title}${b.tag ? ` [${b.tag}]` : ''} – ${b.url}`).join('\n') : 'No bookmarks yet.');
    }
    case 'remove': {
      const q = str(a.id || a.title, 120).toLowerCase();
      const hit = all.find((b) => b.id === q || b.title.toLowerCase().includes(q));
      if (!q || !hit) return bad('No matching bookmark.');
      write(BM_KEY, all.filter((b) => b.id !== hit.id));
      return ok(`Removed "${hit.title}".`);
    }
    default: return bad('action must be add, list or remove.');
  }
}

// ── habits ──────────────────────────────────────────────────────────────────
const HABIT_KEY = 'nameless-labs-ai:habits';
type Habits = Record<string, string[]>; // habit -> sorted list of YYYY-MM-DD

function streak(days: string[]): number {
  const set = new Set(days);
  let n = 0;
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not logged yet doesn't break the streak
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function trackHabit(a: Record<string, unknown>): ToolOutcome {
  const data = read<Habits>(HABIT_KEY, {});
  const habit = str(a.habit, 40).toLowerCase();
  switch (str(a.action)) {
    case 'log': {
      if (!habit) return bad('Which habit?');
      const days = new Set(data[habit] ?? []);
      days.add(dayKey());
      data[habit] = [...days].sort().slice(-730);
      write(HABIT_KEY, data);
      return ok(`Logged "${habit}" for today. Current streak: ${streak(data[habit])} day(s); ${data[habit].length} total.`);
    }
    case 'status':
    case 'list': {
      const names = habit ? [habit] : Object.keys(data);
      if (!names.length) return ok('No habits tracked yet.');
      return ok(names.map((h) => `${h}: streak ${streak(data[h] ?? [])} day(s), ${(data[h] ?? []).length} total, ${(data[h] ?? []).includes(dayKey()) ? 'done today' : 'not done today'}`).join('\n'));
    }
    case 'remove': {
      if (!habit || !(habit in data)) return bad('No such habit.');
      delete data[habit];
      write(HABIT_KEY, data);
      return ok(`Stopped tracking "${habit}".`);
    }
    default: return bad('action must be log, status, list or remove.');
  }
}

// ── colours ─────────────────────────────────────────────────────────────────
function colorConvert(a: Record<string, unknown>): ToolOutcome {
  const raw = str(a.color, 60).toLowerCase();
  let r: number, g: number, b: number;
  let m: RegExpExecArray | null;
  if ((m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(raw))) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else if ((m = /^rgb\(?\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/.exec(raw))) {
    [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if ([r, g, b].some((x) => x > 255)) return bad('RGB values must be 0–255.');
  } else if ((m = /^hsl\(?\s*(\d{1,3})[\s,]+(\d{1,3})%?[\s,]+(\d{1,3})%?\s*\)?$/.exec(raw))) {
    const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const f = (n: number) => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    [r, g, b] = [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
  } else return bad('Give a colour as #hex, rgb(r,g,b) or hsl(h,s%,l%).');
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h = Math.round(((h * 60) + 360) % 360);
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  const lum = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lum(rn) + 0.7152 * lum(gn) + 0.0722 * lum(bn);
  const contrast = (L2: number) => ((Math.max(L, L2) + 0.05) / (Math.min(L, L2) + 0.05)).toFixed(1);
  return ok(`${hex} · rgb(${r}, ${g}, ${b}) · hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%). Contrast vs white ${contrast(1)}:1, vs black ${contrast(0)}:1.`);
}

// ── focus session ───────────────────────────────────────────────────────────
function focusSession(a: Record<string, unknown>): ToolOutcome {
  const work = Math.min(180, Math.max(1, Math.round(num(a.minutes) || 25)));
  const brk = Math.min(60, Math.max(0, Math.round(Number.isFinite(num(a.break_minutes)) ? num(a.break_minutes) : 5)));
  const label = str(a.label, 60);
  const now = Date.now();
  addAlarm({ at: now + work * 60_000, label: `Focus done${label ? `: ${label}` : ''} — take a break`, kind: 'timer', repeat: 'none' });
  if (brk) addAlarm({ at: now + (work + brk) * 60_000, label: 'Break over — back to work', kind: 'timer', repeat: 'none' });
  return ok(`Focus session started: ${work} min${label ? ` on "${label}"` : ''}${brk ? `, then a ${brk} min break` : ''}. Timers ring while this page stays open.`);
}

export async function runMoreTool(name: string, a: Record<string, unknown>): Promise<ToolOutcome | null> {
  switch (name) {
    case 'date_calc': return dateCalc(a);
    case 'text_tools': return textTools(a);
    case 'finance_calc': return financeCalc(a);
    case 'manage_expenses': return manageExpenses(a);
    case 'manage_bookmarks': return manageBookmarks(a);
    case 'track_habit': return trackHabit(a);
    case 'color_convert': return colorConvert(a);
    case 'start_focus_session': return focusSession(a);
    default: return null;
  }
}
