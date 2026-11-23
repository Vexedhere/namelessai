// Tool catalogue shared by the server (sent to the model) and the client (which runs most of them).
// Keep descriptions precise: they are the only "documentation" the model gets.

import { MORE_TOOL_DEFS, MORE_TOOL_LABELS, SERVER_TOOLS_MORE } from './toolDefsMore';

export type ToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

/** Tools that run on the server (need secrets, or a network the browser can't reach). */
export const SERVER_TOOLS = new Set(['get_weather', ...SERVER_TOOLS_MORE]);

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'number', description, ...extra });

const BASE_TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'set_alarm',
      description:
        'Set an alarm or reminder that rings on the user\'s device at a clock time. Use for "wake me at 7", "remind me at 5pm to call mom", etc. ' +
        'Give either `time` (24h HH:MM, in the user\'s local time) or `in_minutes`. If `date` is omitted, the next occurrence of that time is used.',
      parameters: {
        type: 'object',
        properties: {
          time: str('Local clock time in 24-hour HH:MM, e.g. "07:30" or "17:00".', { pattern: '^([01]?\\d|2[0-3]):[0-5]\\d$' }),
          date: str('Optional local date YYYY-MM-DD. Omit for the next time that clock time occurs.'),
          in_minutes: num('Alternative to `time`: ring this many minutes from now.', { minimum: 1, maximum: 10080 }),
          label: str('What the alarm is for, e.g. "Call mom". Spoken and shown when it rings.'),
          repeat: str('How often to repeat. Default "none".', { enum: ['none', 'daily', 'weekdays'] }),
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_timer',
      description: 'Start a countdown timer ("timer for 10 minutes", "30 second timer"). Rings when it reaches zero.',
      parameters: {
        type: 'object',
        properties: {
          minutes: num('Whole or fractional minutes.', { minimum: 0 }),
          seconds: num('Extra seconds (added to minutes).', { minimum: 0 }),
          label: str('Optional label, e.g. "Pasta".'),
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_alarms',
      description: 'List the active alarms and timers (ids, labels and times). Call before cancelling if you do not know the id.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_alarm',
      description: 'Cancel an alarm or timer by id, or pass `all: true` to cancel everything.',
      parameters: {
        type: 'object',
        properties: { id: str('Alarm id from list_alarms or set_alarm.'), all: { type: 'boolean', description: 'Cancel every alarm and timer.' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description:
        'Draft and send an email on the user\'s behalf. The user always reviews and confirms before anything is sent, so write the complete, polished email. ' +
        '`to` may be an email address or the name of a saved contact. If you do not have an address and no contact matches, ask the user for it instead of guessing. ' +
        'Write the body in the first person as the user and sign off with their name when known.',
      parameters: {
        type: 'object',
        properties: {
          to: str('Recipient email address, or the name of a saved contact.'),
          subject: str('Concise subject line.'),
          body: str('Plain-text email body, with greeting and sign-off.'),
        },
        required: ['to', 'subject', 'body'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_contact',
      description: 'Remember a person\'s email address so the user can later say "email Rahul". Overwrites an existing contact with the same name.',
      parameters: {
        type: 'object',
        properties: { name: str('Contact name, e.g. "Rahul".'), email: str('Their email address.') },
        required: ['name', 'email'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_contact',
      description: 'Look up saved contacts by (partial) name. Returns matching names and emails.',
      parameters: { type: 'object', properties: { name: str('Name or part of a name.') }, required: ['name'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_note',
      description: 'Save a short note or to-do item for the user ("note that...", "add milk to my list").',
      parameters: {
        type: 'object',
        properties: { text: str('The note text.'), list: str('Optional list name, e.g. "shopping". Default "notes".') },
        required: ['text'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'Read back saved notes, optionally for one list.',
      parameters: { type: 'object', properties: { list: str('Optional list name.') }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Current weather and a 3-day forecast for a city or place name.',
      parameters: {
        type: 'object',
        properties: { location: str('City or place, e.g. "Pune" or "Paris, France".') },
        required: ['location'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'The user\'s exact current local date, time and timezone. Use whenever the answer depends on "now".',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate an arithmetic expression exactly (+ - * / ^ % parentheses, sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil, pi, e). Prefer this over mental math.',
      parameters: { type: 'object', properties: { expression: str('e.g. "(1250 * 1.18) / 12"') }, required: ['expression'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_website',
      description: 'Open an https:// web page in a new browser tab for the user.',
      parameters: { type: 'object', properties: { url: str('Full https:// URL.') }, required: ['url'], additionalProperties: false },
    },
  },
];

export const TOOL_DEFS: ToolDef[] = [...BASE_TOOL_DEFS, ...MORE_TOOL_DEFS];

export const TOOL_NAMES = new Set(TOOL_DEFS.map((t) => t.function.name));

/** Short human labels for the tool chips in the chat. */
export const TOOL_LABELS: Record<string, string> = {
  ...MORE_TOOL_LABELS,
  set_alarm: 'Setting alarm',
  set_timer: 'Starting timer',
  list_alarms: 'Checking alarms',
  cancel_alarm: 'Cancelling alarm',
  send_email: 'Drafting email',
  save_contact: 'Saving contact',
  find_contact: 'Looking up contact',
  save_note: 'Saving note',
  list_notes: 'Reading notes',
  get_weather: 'Checking weather',
  get_current_time: 'Checking the time',
  calculate: 'Calculating',
  open_website: 'Opening website',
};

export function agentSystemPrompt(opts: {
  tools: boolean;
  nowIso: string;
  timeZone: string;
  userName?: string;
  userEmail?: string;
  voice: boolean;
}) {
  const lines: string[] = [];
  if (opts.tools) {
    lines.push(
      'You are an AGENT: you can take actions for the user with tools. Use a tool whenever the user asks for something a tool does (alarms, timers, email, notes, tasks, memory, web research, news, currency/crypto/stock prices, files, calendar events, maps, calculations, conversions, opening sites); never claim you did something you did not do with a tool.',
      'For research or anything recent/uncertain: web_search first, then read_webpage on the best result if you need detail, and name your sources. For multi-step requests, plan briefly, chain the tools you need, and then summarise what you did.',
      'Use `remember` when the user shares a lasting fact or preference worth keeping, and use the stored memory (shown below, if any) to personalise answers. Never store passwords or other secrets.',
      `The user's current local time is ${opts.nowIso} (timezone ${opts.timeZone}). Convert relative times ("tomorrow 6am", "in an hour") yourself: for alarms prefer \`in_minutes\` for short offsets, otherwise pass \`time\` (24h HH:MM) and \`date\`.`,
      'If a required detail is missing (an email address, which alarm to cancel), ask one short question instead of guessing.',
      'send_email only creates a draft; the user confirms before it is sent. After calling it, wait for the tool result and then tell the user plainly what happened (sent, cancelled, or opened in their mail app).',
      'After tools finish, confirm the outcome in one or two short sentences.',
    );
    if (opts.userName) lines.push(`The user's name is ${opts.userName}${opts.userEmail ? ` (${opts.userEmail})` : ''}; use it to sign emails.`);
  }
  if (opts.voice) {
    lines.push(
      'VOICE MODE: your reply will be read aloud by text-to-speech. Speak naturally in short sentences. No Markdown, no bullet lists, no code blocks, no emoji, no URLs read out letter by letter. Keep answers brief unless asked for detail.',
    );
  }
  return lines.join('\n');
}
