// More browser-side agent tools: memory, tasks, expenses, files, calendar, converters, helpers.
// Returns null when the name is not one of these so the main dispatcher can continue.

import type { ToolOutcome } from './clientTools';
import {
  EXPENSES_KEY, MEMORY_KEY, TASKS_KEY, loadExpenses, loadMemories, loadTasks, newId, readStore, writeStore, type Task,
} from './agentStore';

const ok = (result: string): ToolOutcome => ({ status: 'done', result });
const fail = (result: string): ToolOutcome => ({ status: 'error', result: `Error: ${result}` });

function text(v: unknown, field: string, max = 5000): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing "${field}".`);
  return v.trim().slice(0, max);
}
const optText = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

// ── secure randomness ───────────────────────────────────────────────────────
function randInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

// ── downloads ───────────────────────────────────────────────────────────────
function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const MIME: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html', htm: 'text/html',
  ics: 'text/calendar', xml: 'application/xml', js: 'text/javascript', ts: 'text/plain', py: 'text/x-python', css: 'text/css',
  yaml: 'text/yaml', yml: 'text/yaml', sql: 'text/plain', sh: 'text/plain', tsx: 'text/plain', jsx: 'text/plain',
};

function safeFilename(raw: string): string {
  const base = raw.replace(/[\\/]+/g, '_').replace(/[^\w.\- ]+/g, '').trim().replace(/^\.+/, '').slice(0, 80) || 'file';
  return /\.[A-Za-z0-9]{1,6}$/.test(base) ? base : `${base}.txt`;
}

// ── units ───────────────────────────────────────────────────────────────────
const UNIT_ALIASES: Record<string, string> = {
  kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', mile: 'mi', miles: 'mi', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  foot: 'ft', feet: 'ft', inch: 'in', inches: 'in', centimeter: 'cm', centimeters: 'cm', millimeter: 'mm', millimeters: 'mm', yard: 'yd', yards: 'yd',
  kilogram: 'kg', kilograms: 'kg', kgs: 'kg', pound: 'lb', pounds: 'lb', lbs: 'lb', gram: 'g', grams: 'g', ounce: 'oz', ounces: 'oz', tonne: 't', tonnes: 't',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', milliliter: 'ml', milliliters: 'ml', gallon: 'gal', gallons: 'gal', cups: 'cup', tablespoon: 'tbsp', teaspoon: 'tsp',
  'km/h': 'kmh', kph: 'kmh', 'mi/h': 'mph', 'm/s': 'ms', knot: 'kn', knots: 'kn',
  celsius: 'c', '°c': 'c', centigrade: 'c', fahrenheit: 'f', '°f': 'f', kelvin: 'k',
  byte: 'b', bytes: 'b', kilobyte: 'kb', kilobytes: 'kb', megabyte: 'mb', megabytes: 'mb', gigabyte: 'gb', gigabytes: 'gb', terabyte: 'tb', terabytes: 'tb',
  'm2': 'sqm', 'sq m': 'sqm', 'sqmeter': 'sqm', 'ft2': 'sqft', 'sq ft': 'sqft', acres: 'acre', hectare: 'ha', hectares: 'ha', 'km2': 'sqkm',
};
const UNITS: Record<string, { cat: string; f: number }> = {
  m: { cat: 'length', f: 1 }, km: { cat: 'length', f: 1000 }, cm: { cat: 'length', f: 0.01 }, mm: { cat: 'length', f: 0.001 },
  mi: { cat: 'length', f: 1609.344 }, ft: { cat: 'length', f: 0.3048 }, in: { cat: 'length', f: 0.0254 }, yd: { cat: 'length', f: 0.9144 },
  kg: { cat: 'mass', f: 1 }, g: { cat: 'mass', f: 0.001 }, lb: { cat: 'mass', f: 0.45359237 }, oz: { cat: 'mass', f: 0.028349523125 }, t: { cat: 'mass', f: 1000 },
  l: { cat: 'volume', f: 1 }, ml: { cat: 'volume', f: 0.001 }, gal: { cat: 'volume', f: 3.785411784 }, cup: { cat: 'volume', f: 0.2365882365 },
  tbsp: { cat: 'volume', f: 0.01478676478 }, tsp: { cat: 'volume', f: 0.00492892159 },
  ms: { cat: 'speed', f: 1 }, kmh: { cat: 'speed', f: 1 / 3.6 }, mph: { cat: 'speed', f: 0.44704 }, kn: { cat: 'speed', f: 0.514444 },
  b: { cat: 'data', f: 1 }, kb: { cat: 'data', f: 1024 }, mb: { cat: 'data', f: 1024 ** 2 }, gb: { cat: 'data', f: 1024 ** 3 }, tb: { cat: 'data', f: 1024 ** 4 },
  sqm: { cat: 'area', f: 1 }, sqft: { cat: 'area', f: 0.09290304 }, acre: { cat: 'area', f: 4046.8564224 }, ha: { cat: 'area', f: 10000 }, sqkm: { cat: 'area', f: 1_000_000 },
  c: { cat: 'temp', f: 1 }, f: { cat: 'temp', f: 1 }, k: { cat: 'temp', f: 1 },
};
const normUnit = (u: string) => {
  const k = u.trim().toLowerCase();
  return UNIT_ALIASES[k] ?? k;
};
const fmt = (n: number) => (Math.abs(n) >= 1e-3 || n === 0 ? Number(n.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 6 }) : n.toExponential(4));

function convertUnits(value: number, fromRaw: string, toRaw: string): string {
  const from = normUnit(fromRaw);
  const to = normUnit(toRaw);
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b) throw new Error(`Unknown unit "${!a ? fromRaw : toRaw}".`);
  if (a.cat !== b.cat) throw new Error(`Cannot convert ${a.cat} to ${b.cat}.`);
  if (a.cat === 'temp') {
    const c = from === 'c' ? value : from === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
    const out = to === 'c' ? c : to === 'f' ? (c * 9) / 5 + 32 : c + 273.15;
    return `${fmt(value)} °${from.toUpperCase()} = ${fmt(out)} °${to.toUpperCase()}`;
  }
  return `${fmt(value)} ${from} = ${fmt((value * a.f) / b.f)} ${to}`;
}

// ── calendar (.ics) ─────────────────────────────────────────────────────────
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsLocal(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
function icsUtc(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function openTab(url: string, what: string): ToolOutcome {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  return ok(w ? `Opened ${what}.` : `Tried to open ${what} but the browser may have blocked the pop-up; the user can allow pop-ups for this site.`);
}

// ── dispatcher ──────────────────────────────────────────────────────────────
export function runMoreTool(name: string, args: Record<string, unknown>): ToolOutcome | null {
  try {
    switch (name) {
      // memory
      case 'remember': {
        const fact = text(args.fact, 'fact', 300);
        if (/(password|passcode|otp|cvv|card number|secret key|api key)/i.test(fact)) return fail('I will not store passwords, codes or secrets. Ask the user to keep those somewhere safe.');
        const list = loadMemories();
        if (list.some((m) => m.text.toLowerCase() === fact.toLowerCase())) return ok('Already remembered.');
        const category = optText(args.category, 30).toLowerCase() || 'general';
        writeStore(MEMORY_KEY, [...list, { id: newId('m'), text: fact, category, at: Date.now() }].slice(-100));
        return ok(`Remembered: ${fact}`);
      }
      case 'recall': {
        const q = optText(args.query, 80).toLowerCase();
        const hits = loadMemories().filter((m) => !q || m.text.toLowerCase().includes(q) || m.category.includes(q));
        return ok(hits.length ? hits.map((m) => `${m.id}: ${m.text}`).join('\n') : q ? `Nothing remembered about "${q}".` : 'No memories stored yet.');
      }
      case 'forget': {
        const list = loadMemories();
        if (args.all === true) {
          writeStore(MEMORY_KEY, []);
          return ok(`Forgot all ${list.length} memories.`);
        }
        const id = optText(args.id, 20);
        const match = optText(args.match, 80).toLowerCase();
        if (!id && !match) return fail('Give an id, some text to match, or all: true.');
        const keep = list.filter((m) => !(id ? m.id === id : m.text.toLowerCase().includes(match)));
        if (keep.length === list.length) return fail('No matching memory found.');
        writeStore(MEMORY_KEY, keep);
        return ok(`Forgot ${list.length - keep.length} memory item(s).`);
      }

      // tasks
      case 'add_task': {
        const t = text(args.text, 'text', 300);
        const due = optText(args.due, 10);
        if (due && !parseYmd(due)) return fail('due must be YYYY-MM-DD.');
        const priority = args.priority === 'low' || args.priority === 'high' ? args.priority : 'normal';
        const task: Task = { id: newId('t'), text: t, ...(due ? { due } : {}), priority, done: false, at: Date.now() };
        writeStore(TASKS_KEY, [...loadTasks(), task].slice(-300));
        return ok(`Task added (${task.id}): ${t}${due ? `, due ${due}` : ''}${priority !== 'normal' ? `, ${priority} priority` : ''}.`);
      }
      case 'list_tasks': {
        const status = args.status === 'done' || args.status === 'all' ? args.status : 'open';
        const rank = { high: 0, normal: 1, low: 2 } as const;
        const list = loadTasks()
          .filter((t) => (status === 'all' ? true : status === 'done' ? t.done : !t.done))
          .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
        const today = ymd(new Date());
        return ok(
          list.length
            ? list.map((t) => `${t.done ? '[x]' : '[ ]'} ${t.id}: ${t.text}${t.due ? ` (due ${t.due}${!t.done && t.due < today ? ', OVERDUE' : ''})` : ''}${t.priority !== 'normal' ? ` [${t.priority}]` : ''}`).join('\n')
            : `No ${status === 'all' ? '' : status + ' '}tasks.`,
        );
      }
      case 'complete_task':
      case 'delete_task': {
        const list = loadTasks();
        const del = name === 'delete_task';
        if (del && args.done_only === true) {
          const n = list.filter((t) => t.done).length;
          writeStore(TASKS_KEY, list.filter((t) => !t.done));
          return ok(`Removed ${n} completed task(s).`);
        }
        const id = optText(args.id, 20);
        const match = optText(args.match, 100).toLowerCase();
        if (!id && !match) return fail('Give a task id or some text to match.');
        const hits = list.filter((t) => (id ? t.id === id : t.text.toLowerCase().includes(match)));
        if (!hits.length) return fail('No matching task. Call list_tasks to see the ids.');
        if (hits.length > 1) return fail(`Several tasks match: ${hits.map((h) => `${h.id} "${h.text}"`).join('; ')}. Ask the user which one.`);
        const h = hits[0];
        writeStore(TASKS_KEY, del ? list.filter((t) => t.id !== h.id) : list.map((t) => (t.id === h.id ? { ...t, done: true } : t)));
        return ok(`${del ? 'Deleted' : 'Completed'}: ${h.text}`);
      }
      case 'delete_note': {
        const key = 'nameless-labs-ai:notes';
        const notes = readStore<{ list: string; text: string; at: number }[]>(key, []);
        const list = optText(args.list, 40).toLowerCase();
        const match = optText(args.match, 100).toLowerCase();
        if (!list && !match) return fail('Give a list name or some text to match.');
        const keep = notes.filter((n) => !((!list || n.list === list) && (!match || n.text.toLowerCase().includes(match))));
        if (keep.length === notes.length) return fail('No matching notes.');
        writeStore(key, keep);
        return ok(`Deleted ${notes.length - keep.length} note(s).`);
      }

      // expenses
      case 'log_expense': {
        const amount = Number(args.amount);
        if (!Number.isFinite(amount) || amount === 0) return fail('amount must be a non-zero number.');
        const category = text(args.category, 'category', 40).toLowerCase();
        const date = optText(args.date, 10) || ymd(new Date());
        if (!parseYmd(date)) return fail('date must be YYYY-MM-DD.');
        writeStore(EXPENSES_KEY, [...loadExpenses(), { id: newId('e'), amount, category, note: optText(args.note, 120), date, at: Date.now() }].slice(-1000));
        return ok(`Logged ${amount > 0 ? 'expense' : 'income'} ${Math.abs(amount)} under "${category}" on ${date}.`);
      }
      case 'expense_report': {
        const period = args.period === 'today' || args.period === 'week' || args.period === 'all' ? args.period : 'month';
        const now = new Date();
        const startMs = period === 'all' ? 0 : period === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() : period === 'week' ? Date.now() - 7 * 86_400_000 : new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const rows = loadExpenses().filter((e) => (parseYmd(e.date)?.getTime() ?? e.at) >= startMs - 43_200_000);
        if (!rows.length) return ok(`No expenses logged for ${period}.`);
        const by = new Map<string, number>();
        let total = 0;
        for (const e of rows) {
          total += e.amount;
          by.set(e.category, (by.get(e.category) ?? 0) + e.amount);
        }
        const lines = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: ${fmt(v)}`);
        return ok(`Net spending (${period}): ${fmt(total)} across ${rows.length} entries (amounts as entered).\n${lines.join('\n')}`);
      }

      // files & calendar & clipboard
      case 'create_file': {
        const content = text(args.content, 'content', 500_000);
        const filename = safeFilename(text(args.filename, 'filename', 120));
        const ext = filename.split('.').pop()!.toLowerCase();
        download(filename, content, MIME[ext] ?? 'text/plain');
        return ok(`Created ${filename} (${content.length.toLocaleString()} characters). It is downloading to the user's device.`);
      }
      case 'create_calendar_event': {
        const title = text(args.title, 'title', 200);
        const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(optText(args.start, 30));
        if (!m) return fail('start must look like YYYY-MM-DDTHH:MM.');
        const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
        if (Number.isNaN(start.getTime())) return fail('start is not a valid date.');
        const mins = Math.min(1440, Math.max(5, Math.round(Number(args.duration_minutes) || 60)));
        const end = new Date(start.getTime() + mins * 60_000);
        const reminder = args.reminder_minutes === undefined ? -1 : Math.max(0, Math.round(Number(args.reminder_minutes)));
        const lines = [
          'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nameless Labs AI//Agent//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
          `UID:${Date.now()}-${Math.random().toString(36).slice(2, 8)}@namelesslabs.ai`,
          `DTSTAMP:${icsUtc(new Date())}`, `DTSTART:${icsLocal(start)}`, `DTEND:${icsLocal(end)}`, `SUMMARY:${icsEscape(title)}`,
          ...(optText(args.location, 200) ? [`LOCATION:${icsEscape(optText(args.location, 200))}`] : []),
          ...(optText(args.description, 1000) ? [`DESCRIPTION:${icsEscape(optText(args.description, 1000))}`] : []),
          ...(reminder >= 0 ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, `TRIGGER:-PT${reminder}M`, 'END:VALARM'] : []),
          'END:VEVENT', 'END:VCALENDAR',
        ];
        download(`${safeFilename(title).replace(/\.txt$/, '')}.ics`, lines.join('\r\n'), 'text/calendar');
        return ok(`Calendar file for "${title}" on ${ymd(start)} at ${pad(start.getHours())}:${pad(start.getMinutes())} (${mins} min) is downloading. Opening it adds the event to the user's calendar app.`);
      }
      case 'copy_to_clipboard': {
        const t = text(args.text, 'text', 20_000);
        // async, but fire-and-forget keeps the tool synchronous; report optimistically only if the API exists
        if (!navigator.clipboard?.writeText) return fail('Clipboard access is not available in this browser.');
        void navigator.clipboard.writeText(t).catch(() => {});
        return ok(`Copied ${t.length} characters to the clipboard.`);
      }

      // utilities
      case 'convert_units': {
        const v = Number(args.value);
        if (!Number.isFinite(v)) return fail('value must be a number.');
        return ok(convertUnits(v, text(args.from, 'from', 20), text(args.to, 'to', 20)));
      }
      case 'date_math': {
        const op = args.operation;
        const base = optText(args.date, 10) ? parseYmd(optText(args.date, 10)) : new Date(new Date().setHours(12, 0, 0, 0));
        if (!base) return fail('date must be YYYY-MM-DD.');
        const long = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (op === 'weekday') return ok(`${ymd(base)} is a ${long(base)}.`);
        if (op === 'diff') {
          const to = parseYmd(optText(args.to, 10));
          if (!to) return fail('"to" must be YYYY-MM-DD for diff.');
          const days = Math.round((to.getTime() - base.getTime()) / 86_400_000);
          return ok(`From ${ymd(base)} to ${ymd(to)}: ${days} day(s) (${(days / 7).toFixed(1)} weeks).${days < 0 ? ' (The end date is earlier.)' : ''}`);
        }
        if (op === 'add') {
          const d = new Date(base);
          const months = Math.round(Number(args.months) || 0) + 12 * Math.round(Number(args.years) || 0);
          if (months) {
            const day = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() + months);
            d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
          }
          d.setDate(d.getDate() + Math.round(Number(args.days) || 0) + 7 * Math.round(Number(args.weeks) || 0));
          return ok(`${ymd(d)} — ${long(d)}.`);
        }
        return fail('operation must be add, diff or weekday.');
      }
      case 'world_clock': {
        const tz = text(args.timezone, 'timezone', 60);
        try {
          const s = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(new Date());
          return ok(`${tz}: ${s}`);
        } catch {
          return fail(`"${tz}" is not a valid IANA timezone (e.g. Asia/Tokyo, America/New_York).`);
        }
      }
      case 'random_pick': {
        switch (args.kind) {
          case 'coin': return ok(randInt(2) ? 'Heads' : 'Tails');
          case 'dice': {
            const sides = Math.min(1000, Math.max(2, Math.round(Number(args.sides) || 6)));
            const count = Math.min(20, Math.max(1, Math.round(Number(args.count) || 1)));
            const rolls = Array.from({ length: count }, () => randInt(sides) + 1);
            return ok(`Rolled ${count}d${sides}: ${rolls.join(', ')}${count > 1 ? ` (total ${rolls.reduce((a, b) => a + b, 0)})` : ''}`);
          }
          case 'number': {
            const lo = Math.round(Number(args.min));
            const hi = Math.round(Number(args.max));
            if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi - lo > 4_000_000_000) return fail('Give a valid min and max.');
            return ok(`Random number between ${lo} and ${hi}: ${lo + randInt(hi - lo + 1)}`);
          }
          case 'pick': {
            const opts = Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === 'string' && !!o.trim()).slice(0, 100) : [];
            if (opts.length < 2) return fail('Give at least two options.');
            return ok(`Picked: ${opts[randInt(opts.length)]}`);
          }
          default: return fail('kind must be dice, coin, number or pick.');
        }
      }
      case 'generate_password': {
        const length = Math.min(64, Math.max(8, Math.round(Number(args.length) || 20)));
        const symbols = args.symbols !== false;
        const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', ...(symbols ? ['!@#$%^&*()-_=+?'] : [])];
        const all = sets.join('');
        const chars = sets.map((s) => s[randInt(s.length)]);
        while (chars.length < length) chars.push(all[randInt(all.length)]);
        for (let i = chars.length - 1; i > 0; i--) {
          const j = randInt(i + 1);
          [chars[i], chars[j]] = [chars[j], chars[i]];
        }
        return ok(`Generated a ${length}-character password: ${chars.join('')}\n(Created locally in the browser; remind the user to store it in a password manager.)`);
      }
      case 'open_maps': {
        const q = text(args.query, 'query', 200);
        const origin = optText(args.origin, 200);
        const mode = ['driving', 'walking', 'transit', 'bicycling'].includes(String(args.mode)) ? String(args.mode) : '';
        const url = origin || mode
          ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}${origin ? `&origin=${encodeURIComponent(origin)}` : ''}&travelmode=${mode || 'driving'}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
        return openTab(url, `Google Maps for "${q}"`);
      }
      case 'search_youtube': {
        const q = text(args.query, 'query', 200);
        return openTab(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, `YouTube results for "${q}"`);
      }
      case 'whatsapp_message': {
        const msg = text(args.text, 'text', 2000);
        const phone = optText(args.phone, 20).replace(/[^\d]/g, '');
        if (phone && (phone.length < 8 || phone.length > 15)) return fail('Phone must be 8-15 digits including country code.');
        return openTab(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, 'WhatsApp with the message pre-filled (the user taps send)');
      }
      case 'make_qr_code': {
        const t = text(args.text, 'text', 1000);
        return openTab(`https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=12&data=${encodeURIComponent(t)}`, 'the QR code image (generated by api.qrserver.com)');
      }
      default:
        return null;
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'tool failed.');
  }
}
