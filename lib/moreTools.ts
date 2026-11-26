// Extra browser-side tools: dates, text utilities, finance maths, expenses, bookmarks, habits, colours, focus sessions.
// Called from clientTools.runTool's default branch. Returns null when the name is not one of ours.

import { addAlarm } from './alarms';
import { storeGet, storeSet } from './store';
import type { ToolOutcome } from './clientTools';

const ok = (result: string): ToolOutcome => ({ status: 'done', result });
const bad = (msg: string): ToolOutcome => ({ status: 'error', result: `Error: ${msg}` });

// Data lives in memory and, when signed in, in the user's account (see lib/store.ts) — never in localStorage.
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


async function generateProfessionalPdf(a: Record<string, unknown>): Promise<ToolOutcome> {
  const title = str(a.title, 180);
  if (!title) return bad('A document title is required.');
  if (!Array.isArray(a.sections) || a.sections.length === 0) return bad('Add at least one document section.');
  if (a.sections.length > 100) return bad('A PDF can contain at most 100 content blocks.');
  const themeName = str(a.theme, 20) || 'navy';
  const palettes: Record<string, { accent: [number, number, number]; ink: [number, number, number]; muted: [number, number, number]; pale: [number, number, number] }> = {
    navy: { accent: [27, 76, 130], ink: [31, 41, 55], muted: [103, 116, 135], pale: [238, 244, 250] },
    teal: { accent: [13, 125, 125], ink: [31, 41, 55], muted: [103, 116, 135], pale: [233, 247, 245] },
    violet: { accent: [106, 76, 160], ink: [38, 35, 53], muted: [112, 106, 128], pale: [244, 240, 250] },
    minimal: { accent: [65, 75, 87], ink: [30, 35, 42], muted: [115, 120, 128], pale: [246, 247, 248] },
    warm: { accent: [166, 91, 48], ink: [55, 43, 35], muted: [130, 112, 98], pale: [250, 243, 235] },
  };
  const palette = palettes[themeName] || palettes.navy;
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 19, right = 19, top = 22, bottom = 21;
  const contentW = pageW - left - right;
  const author = str(a.author, 100) || 'Nameless Labs';
  const subtitle = str(a.subtitle, 220);
  let y = 0;
  const setInk = () => doc.setTextColor(...palette.ink);
  const ensure = (height: number) => {
    if (y + height > pageH - bottom) { doc.addPage(); y = top; }
  };
  const paragraph = (value: string, size = 10.5, indent = 0) => {
    const text = value.trim();
    if (!text) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    setInk();
    const lines = doc.splitTextToSize(text, contentW - indent);
    const lineH = size * 0.48;
    for (const line of lines) {
      ensure(lineH + 2);
      doc.text(line, left + indent, y);
      y += lineH;
    }
    y += 3;
  };

  // Refined title area: generous whitespace, accent rule and clear metadata.
  doc.setFillColor(...palette.accent);
  doc.rect(0, 0, pageW, 5, 'F');
  y = 29;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(25);
  doc.setTextColor(...palette.accent);
  const titleLines = doc.splitTextToSize(title, contentW);
  doc.text(titleLines, left, y);
  y += titleLines.length * 11 + 3;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...palette.muted);
    const subLines = doc.splitTextToSize(subtitle, contentW);
    doc.text(subLines, left, y);
    y += subLines.length * 5.5 + 2;
  }
  doc.setDrawColor(...palette.accent);
  doc.setLineWidth(0.8);
  doc.line(left, y + 2, left + 28, y + 2);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...palette.muted);
  doc.text(author, left, y);
  doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), pageW - right, y, { align: 'right' });
  y += 13;

  for (const raw of a.sections as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const section = raw as Record<string, unknown>;
    const type = str(section.type, 20);
    const heading = str(section.title, 180);
    if (type === 'page_break') { doc.addPage(); y = top; continue; }
    if (type === 'divider') {
      ensure(12); doc.setDrawColor(220, 225, 231); doc.setLineWidth(0.35); doc.line(left, y, pageW - right, y); y += 9; continue;
    }
    if (type === 'heading') {
      const text = heading || str(section.text, 180);
      if (!text) continue;
      ensure(17);
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...palette.accent);
      const lines = doc.splitTextToSize(text, contentW);
      doc.text(lines, left, y);
      y += lines.length * 7 + 4;
      continue;
    }
    if (type === 'paragraph') {
      if (heading) { ensure(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setInk(); doc.text(heading, left, y); y += 6; }
      paragraph(str(section.text, 12000));
      continue;
    }
    if (type === 'quote' || type === 'callout') {
      const text = str(section.text, 5000);
      if (!text) continue;
      doc.setFont('helvetica', type === 'quote' ? 'italic' : 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(text, contentW - 12);
      const h = lines.length * 5.2 + (heading ? 15 : 10);
      ensure(h + 4);
      doc.setFillColor(...palette.pale);
      doc.roundedRect(left, y - 4, contentW, h, 2, 2, 'F');
      doc.setFillColor(...palette.accent);
      doc.rect(left, y - 4, 1.4, h, 'F');
      let yy = y + 3;
      if (heading) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...palette.accent); doc.text(heading, left + 7, yy); yy += 6; }
      doc.setFont('helvetica', type === 'quote' ? 'italic' : 'normal');
      doc.setFontSize(10);
      setInk();
      doc.text(lines, left + 7, yy);
      y += h + 6;
      continue;
    }
    if (type === 'bullets' || type === 'numbered') {
      const items = Array.isArray(section.items) ? section.items.slice(0, 80).map(v => str(v, 1200)).filter(Boolean) : [];
      if (heading) { ensure(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setInk(); doc.text(heading, left, y); y += 7; }
      items.forEach((item, index) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setInk();
        const lines = doc.splitTextToSize(item, contentW - 9);
        const h = lines.length * 5 + 2;
        ensure(h);
        doc.setFillColor(...palette.accent);
        if (type === 'bullets') doc.circle(left + 2, y - 1.1, 0.65, 'F');
        else { doc.setFont('helvetica', 'bold'); doc.setTextColor(...palette.accent); doc.text(String(index + 1) + '.', left, y); setInk(); }
        doc.setFont('helvetica', 'normal'); doc.text(lines, left + 7, y);
        y += h + 1;
      });
      y += 3;
      continue;
    }
    if (type === 'table') {
      const headers = Array.isArray(section.headers) ? section.headers.slice(0, 8).map(v => str(v, 100)) : [];
      const rows = Array.isArray(section.rows) ? section.rows.slice(0, 200).map(row => Array.isArray(row) ? row.slice(0, headers.length || 8).map(v => str(v, 500)) : []) : [];
      if (!headers.length) continue;
      if (heading) { ensure(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setInk(); doc.text(heading, left, y); y += 6; }
      autoTable(doc, {
        startY: y,
        head: [headers],
        body: rows,
        margin: { left, right },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.6, textColor: palette.ink, lineColor: [225, 230, 236], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: palette.accent, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [247, 249, 251] },
        rowPageBreak: 'avoid',
        didDrawPage: () => { y = top; },
      });
      y = (doc as any).lastAutoTable?.finalY ?? y;
      y += 8;
    }
  }

  // Consistent running header/footer with page count, added after all page breaks.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    if (page > 1) {
      doc.setDrawColor(225, 230, 236);
      doc.setLineWidth(0.25);
      doc.line(left, 13, pageW - right, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...palette.muted);
      doc.text(title.slice(0, 90), left, 10);
    }
    doc.setDrawColor(225, 230, 236);
    doc.line(left, pageH - 14, pageW - right, pageH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...palette.muted);
    doc.text(author, left, pageH - 9);
    doc.text(`Page ${page} of ${totalPages}`, pageW - right, pageH - 9, { align: 'right' });
  }
  const base = str(a.filename, 100).replace(/\.pdf$/i, '').replace(/[^\w -]/g, '').trim() || title.replace(/[^\w -]/g, '').trim() || 'nameless-report';
  doc.save(`${base.slice(0, 80)}.pdf`);
  return ok(`Created and downloaded "${base}.pdf" (${totalPages} page(s)). It includes structured typography, section hierarchy, page-safe lists, styled tables, and repeating page headers/footers. Note: the built-in PDF font is best for Latin-script text; use plain ASCII transliteration for unsupported scripts.`);
}

export async function runMoreTool(name: string, a: Record<string, unknown>): Promise<ToolOutcome | null> {
  switch (name) {
    case 'generate_pdf': return generateProfessionalPdf(a);
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
