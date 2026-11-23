// Additional agent tools (research, memory, tasks, finance, files, utilities).
// Merged into TOOL_DEFS by lib/toolDefs.ts. Server-side ones are listed in SERVER_TOOLS_MORE.

import type { ToolDef } from './toolDefs';

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'number', description, ...extra });
const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const tool = (name: string, description: string, parameters: Record<string, unknown>): ToolDef => ({
  type: 'function',
  function: { name, description, parameters },
});

/** Tools that run on the server (public APIs, or need secrets / server networking). */
export const SERVER_TOOLS_MORE = ['web_search', 'read_webpage', 'get_news', 'convert_currency', 'crypto_price', 'stock_quote', 'define_word'];

export const MORE_TOOL_DEFS: ToolDef[] = [
  // ── research ──────────────────────────────────────────────────────────────
  tool(
    'web_search',
    'Search the web for current information, facts, people, prices or anything you are unsure about. Returns titles, links and snippets. Follow up with read_webpage on the best link when you need the details. Cite the source names in your answer.',
    obj({ query: str('Search query, a few focused keywords.'), max_results: num('1-8, default 5.', { minimum: 1, maximum: 8 }) }, ['query']),
  ),
  tool(
    'read_webpage',
    'Fetch a public web page and return its readable text (up to ~8000 characters). Use after web_search or when the user gives a link to summarise.',
    obj({ url: str('Full https:// URL.') }, ['url']),
  ),
  tool(
    'get_news',
    'Latest news headlines on a topic (or top headlines when no topic is given), with source and date.',
    obj({ topic: str('Optional topic, e.g. "AI", "IPL", "Hyderabad".'), country: str('Optional 2-letter country code for the edition, default "IN".') }),
  ),
  tool(
    'define_word',
    'Dictionary definition, part of speech and example for an English word.',
    obj({ word: str('One English word.') }, ['word']),
  ),

  // ── money & markets ───────────────────────────────────────────────────────
  tool(
    'convert_currency',
    'Convert an amount between currencies using live reference rates (ECB). Currency codes like USD, INR, EUR, GBP, AED.',
    obj({ amount: num('Amount to convert.'), from: str('Source currency code, e.g. "USD".'), to: str('Target currency code, e.g. "INR".') }, ['amount', 'from', 'to']),
  ),
  tool(
    'crypto_price',
    'Live cryptocurrency price in USD and INR with 24h change (CoinGecko). Accepts names or tickers like bitcoin, btc, eth, solana.',
    obj({ coin: str('Coin name or ticker.') }, ['coin']),
  ),
  tool(
    'stock_quote',
    'Latest share price for a stock ticker (best effort). Indian stocks use .NS (NSE) or .BO (BSE), e.g. "RELIANCE.NS"; US stocks like "AAPL". Not financial advice.',
    obj({ symbol: str('Ticker symbol.') }, ['symbol']),
  ),
  tool(
    'log_expense',
    'Record an expense (or income with a negative amount) in the user\'s on-device expense tracker.',
    obj(
      {
        amount: num('Amount spent (positive) or received (negative).'),
        category: str('Category such as food, travel, bills, shopping.'),
        note: str('Optional short description.'),
        date: str('Optional YYYY-MM-DD, default today.'),
      },
      ['amount', 'category'],
    ),
  ),
  tool(
    'expense_report',
    'Summarise tracked expenses: total and per-category, for a period.',
    obj({ period: str('Time window. Default "month".', { enum: ['today', 'week', 'month', 'all'] }) }),
  ),

  // ── memory ────────────────────────────────────────────────────────────────
  tool(
    'remember',
    'Store a lasting fact or preference about the user so you remember it in future chats (name of their dog, preferred language, work, goals). Only store things the user wants remembered; never store passwords or secrets.',
    obj({ fact: str('The fact, written as a short sentence.'), category: str('Optional: "preference", "person", "work", "personal", ...') }, ['fact']),
  ),
  tool('recall', 'Search the user\'s stored memories. Leave query empty to list them all.', obj({ query: str('Optional keyword.') })),
  tool(
    'forget',
    'Delete stored memories by id, by matching text, or all of them.',
    obj({ id: str('Memory id.'), match: str('Delete memories containing this text.'), all: { type: 'boolean', description: 'Delete every memory.' } }),
  ),

  // ── tasks ─────────────────────────────────────────────────────────────────
  tool(
    'add_task',
    'Add an item to the user\'s to-do list with optional due date and priority.',
    obj(
      {
        text: str('The task.'),
        due: str('Optional due date YYYY-MM-DD.'),
        priority: str('Priority, default "normal".', { enum: ['low', 'normal', 'high'] }),
      },
      ['text'],
    ),
  ),
  tool('list_tasks', 'Show the to-do list (open tasks by default).', obj({ status: str('Which tasks. Default "open".', { enum: ['open', 'done', 'all'] }) })),
  tool('complete_task', 'Mark a task as done, by id or by matching text.', obj({ id: str('Task id.'), match: str('Part of the task text.') })),
  tool('delete_task', 'Delete a task by id or matching text, or clear all finished tasks with `done_only`.', obj({ id: str('Task id.'), match: str('Part of the task text.'), done_only: { type: 'boolean', description: 'Remove all completed tasks.' } })),
  tool('delete_note', 'Delete notes: all notes in a list, or notes containing some text.', obj({ list: str('List name.'), match: str('Text to match.') })),

  // ── files & calendar ──────────────────────────────────────────────────────
  tool(
    'create_file',
    'Create a downloadable file for the user from text you generate (a .txt, .md, .csv, .json, .html, .ics, code file, resume, report...). The browser downloads it. Put the COMPLETE content in `content`.',
    obj(
      {
        filename: str('File name with extension, e.g. "plan.md" or "budget.csv".'),
        content: str('Full file content.'),
      },
      ['filename', 'content'],
    ),
  ),
  tool(
    'create_calendar_event',
    'Create a calendar event as an .ics file the user can open in Google/Apple/Outlook calendar. Times are the user\'s local time.',
    obj(
      {
        title: str('Event title.'),
        start: str('Local start time as YYYY-MM-DDTHH:MM.'),
        duration_minutes: num('Length in minutes, default 60.', { minimum: 5, maximum: 1440 }),
        location: str('Optional location.'),
        description: str('Optional notes.'),
        reminder_minutes: num('Optional reminder this many minutes before.', { minimum: 0, maximum: 10080 }),
      },
      ['title', 'start'],
    ),
  ),
  tool('copy_to_clipboard', 'Copy text to the user\'s clipboard.', obj({ text: str('Text to copy.') }, ['text'])),

  // ── utilities ─────────────────────────────────────────────────────────────
  tool(
    'convert_units',
    'Convert between units: length (km, mi, m, ft, in, cm), mass (kg, lb, g, oz), volume (l, ml, gal, cup), speed (kmh, mph, ms), temperature (c, f, k), data (kb, mb, gb, tb), area (sqm, sqft, acre, ha).',
    obj({ value: num('Number to convert.'), from: str('Unit, e.g. "km".'), to: str('Unit, e.g. "mi".') }, ['value', 'from', 'to']),
  ),
  tool(
    'date_math',
    'Date arithmetic. operation "add": add days/weeks/months/years to a date (default today). operation "diff": days/weeks between two dates. operation "weekday": day of the week for a date.',
    obj(
      {
        operation: str('Which calculation.', { enum: ['add', 'diff', 'weekday'] }),
        date: str('Start date YYYY-MM-DD (default today).'),
        to: str('End date YYYY-MM-DD for "diff".'),
        days: num('Days to add (may be negative).'),
        weeks: num('Weeks to add.'),
        months: num('Months to add.'),
        years: num('Years to add.'),
      },
      ['operation'],
    ),
  ),
  tool(
    'world_clock',
    'Current local time in another place. Pass an IANA timezone like "Asia/Tokyo", "America/New_York", "Europe/London", "Asia/Dubai".',
    obj({ timezone: str('IANA timezone name.') }, ['timezone']),
  ),
  tool(
    'random_pick',
    'True-random helper: roll dice, flip a coin, random number in a range, or pick one item from a list.',
    obj({
      kind: str('What to do.', { enum: ['dice', 'coin', 'number', 'pick'] }),
      sides: num('Dice sides, default 6.', { minimum: 2, maximum: 1000 }),
      count: num('How many dice, default 1.', { minimum: 1, maximum: 20 }),
      min: num('Minimum for "number".'),
      max: num('Maximum for "number".'),
      options: { type: 'array', items: { type: 'string' }, description: 'Items for "pick".' },
    }, ['kind']),
  ),
  tool(
    'generate_password',
    'Generate a strong random password in the browser (never sent anywhere). Shown to the user in the tool result.',
    obj({ length: num('Characters, 8-64, default 20.', { minimum: 8, maximum: 64 }), symbols: { type: 'boolean', description: 'Include symbols. Default true.' } }),
  ),
  tool(
    'open_maps',
    'Open Google Maps for a place search or for directions.',
    obj({
      query: str('Place to search for, or the destination for directions.'),
      origin: str('Optional start point for directions. Omit to use the current location.'),
      mode: str('Travel mode for directions, default "driving".', { enum: ['driving', 'walking', 'transit', 'bicycling'] }),
    }, ['query']),
  ),
  tool('search_youtube', 'Open YouTube search results (songs, tutorials, videos) in a new tab.', obj({ query: str('What to search for.') }, ['query'])),
  tool(
    'whatsapp_message',
    'Open WhatsApp with a pre-filled message. The user presses send themselves. Phone number in international format without + (e.g. 919876543210); omit to let the user pick the contact.',
    obj({ text: str('Message text.'), phone: str('Optional phone number, digits only with country code.') }, ['text']),
  ),
  tool('make_qr_code', 'Generate a QR code image for text or a link and open it in a new tab.', obj({ text: str('Text or URL to encode.') }, ['text'])),
];

export const MORE_TOOL_LABELS: Record<string, string> = {
  web_search: 'Searching the web',
  read_webpage: 'Reading page',
  get_news: 'Fetching news',
  define_word: 'Looking up word',
  convert_currency: 'Converting currency',
  crypto_price: 'Checking crypto price',
  stock_quote: 'Checking stock price',
  log_expense: 'Logging expense',
  expense_report: 'Summarising expenses',
  remember: 'Saving to memory',
  recall: 'Checking memory',
  forget: 'Updating memory',
  add_task: 'Adding task',
  list_tasks: 'Reading tasks',
  complete_task: 'Completing task',
  delete_task: 'Deleting task',
  delete_note: 'Deleting note',
  create_file: 'Creating file',
  create_calendar_event: 'Creating calendar event',
  copy_to_clipboard: 'Copying to clipboard',
  convert_units: 'Converting units',
  date_math: 'Doing date maths',
  world_clock: 'Checking world clock',
  random_pick: 'Picking randomly',
  generate_password: 'Generating password',
  open_maps: 'Opening Maps',
  search_youtube: 'Opening YouTube',
  whatsapp_message: 'Preparing WhatsApp',
  make_qr_code: 'Making QR code',
};
