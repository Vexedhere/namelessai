// Tool catalogue shared by the server (sent to the model) and the client (which runs most of them).
// Keep descriptions precise: they are the only "documentation" the model gets.

import { HUE_NAMES, STYLE_NAMES, THEME_COUNT } from './theme';

export type ToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

/** Tools that run on the server (need secrets, or a network the browser can't reach). */
export const SERVER_TOOLS = new Set(['get_weather', 'wikipedia_summary', 'define_word', 'convert_currency', 'read_webpage', 'web_search', 'get_crypto_price', 'country_info', 'get_news', 'public_holidays']);

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'number', description, ...extra });

export const TOOL_DEFS: ToolDef[] = [
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

  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information, news, prices or facts you are unsure about. Returns short result snippets with links. Follow up with read_webpage for detail.',
      parameters: { type: 'object', properties: { query: str('Search query.') }, required: ['query'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_webpage',
      description: 'Fetch a public web page (http/https) and return its readable text so you can summarise or answer questions about it.',
      parameters: { type: 'object', properties: { url: str('Full URL of the page.') }, required: ['url'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia_summary',
      description: 'Look up a person, place, company, concept or event on Wikipedia and return a short factual summary.',
      parameters: { type: 'object', properties: { topic: str('What to look up, e.g. "Alan Turing".') }, required: ['topic'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'define_word',
      description: 'Dictionary definition, part of speech and example for an English word.',
      parameters: { type: 'object', properties: { word: str('The word to define.') }, required: ['word'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'convert_currency',
      description: 'Convert an amount between currencies using the latest reference exchange rates (ECB). Use 3-letter codes such as USD, INR, EUR.',
      parameters: {
        type: 'object',
        properties: { amount: num('Amount to convert.'), from: str('Source currency code, e.g. "USD".'), to: str('Target currency code, e.g. "INR".') },
        required: ['amount', 'from', 'to'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'convert_units',
      description: 'Convert between units of length, mass, volume, temperature, speed, area, data size or time (e.g. 5 km to mi, 98.6 f to c, 2 gb to mb).',
      parameters: {
        type: 'object',
        properties: { value: num('Number to convert.'), from: str('Unit to convert from.'), to: str('Unit to convert to.') },
        required: ['value', 'from', 'to'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'world_time',
      description: 'Current date and time in another city or IANA timezone (e.g. "Tokyo", "New York", "Europe/London"). Use for "what time is it in …" and for scheduling across timezones.',
      parameters: { type: 'object', properties: { place: str('City name or IANA timezone.') }, required: ['place'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_tasks',
      description: 'Manage the user\'s to-do list: add a task, list tasks, mark one done, remove one, or clear finished ones. Prefer this over save_note for actionable to-dos.',
      parameters: {
        type: 'object',
        properties: {
          action: str('What to do.', { enum: ['add', 'list', 'complete', 'remove', 'clear_done'] }),
          text: str('Task text (for add), or part of the task text to match (for complete/remove).'),
          id: str('Task id from list (for complete/remove).'),
          due: str('Optional due date/time as free text, e.g. "Friday 5pm" (for add).'),
          priority: str('Optional priority (for add).', { enum: ['low', 'normal', 'high'] }),
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_password',
      description: 'Generate a strong random password or passphrase locally in the browser.',
      parameters: {
        type: 'object',
        properties: {
          length: num('Characters (8–64). Default 16.', { minimum: 8, maximum: 64 }),
          symbols: { type: 'boolean', description: 'Include symbols. Default true.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'random_pick',
      description: 'Roll dice, flip a coin, pick a random number in a range, or choose randomly among options. Uses secure randomness.',
      parameters: {
        type: 'object',
        properties: {
          kind: str('What to do.', { enum: ['dice', 'coin', 'number', 'choice'] }),
          sides: num('Dice sides (default 6).', { minimum: 2, maximum: 1000 }),
          count: num('How many dice/flips (default 1).', { minimum: 1, maximum: 20 }),
          min: num('Lower bound for kind "number".'),
          max: num('Upper bound for kind "number".'),
          options: { type: 'array', items: { type: 'string' }, description: 'Options for kind "choice".' },
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_pdf',
      description: 'Create a PDF document (report, notes, resume, letter, summary, study guide…) and deliver it: saved into the user\'s connected desktop folder if there is one, otherwise downloaded. Write the full content yourself in simple Markdown (# headings, - bullets, 1. lists, > quotes, ``` code, tables with |). Latin scripts only.',
      parameters: { type: 'object', properties: { title: str('Document title.'), content: str('Full document body in Markdown (do not repeat the title as a heading).'), filename: str('Optional file name without extension.') }, required: ['title', 'content'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and folders inside the desktop folder the user connected (Desktop button in the header). Fails if none is connected.',
      parameters: { type: 'object', properties: { path: str('Sub-folder path, empty for the top level.') }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text-based file (txt, md, csv, json, code…) from the connected desktop folder. Only when the user asks.',
      parameters: { type: 'object', properties: { path: str('File path relative to the connected folder.') }, required: ['path'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_file',
      description: 'Save a text file (notes, code, csv, markdown…) into the connected desktop folder. Never overwrites: an existing name gets "(1)" added. Downloads instead if no folder is connected.',
      parameters: { type: 'object', properties: { path: str('File name or relative path, e.g. "notes/todo.md".'), content: str('File contents.') }, required: ['path', 'content'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'system_info',
      description: 'Read basic info about the user\'s computer/browser: platform, browser, CPU threads, memory, screen, battery, network, time zone, connected folder.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'app_control',
      description: 'Control this app on the user\'s behalf: new_chat, open_sidebar, close_sidebar, set_model (value = model name), set_persona (value = mode name), actions_on, actions_off, rename_ai, sign_in, export_chat_pdf. This cannot control other browser tabs or other programs; to open a website use open_website.',
      parameters: { type: 'object', properties: { action: str('The action.', { enum: ['new_chat', 'open_sidebar', 'close_sidebar', 'set_model', 'set_persona', 'actions_on', 'actions_off', 'rename_ai', 'sign_in', 'export_chat_pdf'] }), value: str('Model or mode name for set_model / set_persona.') }, required: ['action'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_theme',
      description: `Change the app's colour theme. There are ${THEME_COUNT} themes: a colour (${HUE_NAMES.join(', ')}) plus an optional style (${STYLE_NAMES.join(', ')}), e.g. "Ruby Midnight" or "Azure Neon". A bare colour uses its Classic style. "random" picks one.`,
      parameters: { type: 'object', properties: { theme: str('Theme name, e.g. "ruby midnight", "ocean", "violet classic" or "random".') }, required: ['theme'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'copy_to_clipboard',
      description: 'Copy text (a draft, code, a password, a summary) to the user\'s clipboard.',
      parameters: { type: 'object', properties: { text: str('Text to copy.') }, required: ['text'], additionalProperties: false },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_news',
      description: 'Latest news headlines, optionally about a topic (e.g. "AI", "cricket", "Hyderabad"). Returns headlines with sources and links.',
      parameters: { type: 'object', properties: { topic: str('Optional topic. Omit for top headlines.') }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto_price',
      description: 'Live price and 24h change of a cryptocurrency in USD and INR (e.g. "bitcoin", "ETH").',
      parameters: { type: 'object', properties: { coin: str('Coin name or symbol.') }, required: ['coin'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'country_info',
      description: 'Facts about a country: capital, population, region, currency, languages, timezones, calling code.',
      parameters: { type: 'object', properties: { country: str('Country name.') }, required: ['country'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'public_holidays',
      description: 'Upcoming public holidays for a country (2-letter ISO code such as IN, US, GB) in a given year.',
      parameters: { type: 'object', properties: { country_code: str('ISO 3166 alpha-2 code, e.g. "IN".'), year: num('Year, default current.') }, required: ['country_code'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'date_calc',
      description: 'Date arithmetic: days between two dates, add/subtract days, weekday of a date, or days until a date. Dates are YYYY-MM-DD. Always use this instead of counting days yourself.',
      parameters: {
        type: 'object',
        properties: {
          action: str('Operation.', { enum: ['diff', 'add', 'weekday', 'until'] }),
          from: str('Start date for diff (default today).'),
          to: str('End date for diff.'),
          date: str('Date for add / weekday / until (add defaults to today).'),
          days: num('Days to add (negative to subtract).'),
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'text_tools',
      description: 'Utilities on a piece of text: word/character stats, case conversion, slugify, reverse, sort/dedupe lines, URL-encode, Base64 encode/decode, SHA-256 hash.',
      parameters: {
        type: 'object',
        properties: {
          action: str('Operation.', { enum: ['stats', 'upper', 'lower', 'title', 'reverse', 'slug', 'sort_lines', 'dedupe_lines', 'url_encode', 'base64_encode', 'base64_decode', 'sha256'] }),
          text: str('The text to process.', { maxLength: 50000 }),
        },
        required: ['action', 'text'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance_calc',
      description:
        'Money maths: EMI for a loan (principal, annual_rate %, years), SIP / monthly investment growth (monthly, annual_rate, years), compound interest (principal, annual_rate, years, times_per_year), GST/tax (amount, rate, inclusive), tip & split (amount, percent, people), percent change (from, to), discount (amount, percent).',
      parameters: {
        type: 'object',
        properties: {
          kind: str('Calculation.', { enum: ['emi', 'sip', 'compound', 'gst', 'tip', 'percent_change', 'discount'] }),
          principal: num('Loan or investment amount.'), monthly: num('Monthly investment.'), annual_rate: num('Annual rate in percent.'), years: num('Duration in years.'),
          times_per_year: num('Compounding frequency.'), amount: num('Base amount.'), rate: num('Tax rate in percent (default 18).'), inclusive: { type: 'boolean', description: 'Amount already includes tax.' },
          percent: num('Percent for tip/discount.'), people: num('Number of people to split between.'), from: num('Old value.'), to: num('New value.'),
        },
        required: ['kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_expenses',
      description: 'Personal expense tracker: log a spend, list recent ones, summarise by category for today/week/month/all, or remove an entry.',
      parameters: {
        type: 'object',
        properties: {
          action: str('Operation.', { enum: ['add', 'list', 'summary', 'remove'] }),
          amount: num('Amount spent (for add).'), category: str('Category such as food, travel, rent.'), note: str('Short note.'),
          date: str('YYYY-MM-DD, default today.'), period: str('Summary window.', { enum: ['today', 'week', 'month', 'all'] }), id: str('Expense id (for remove).'),
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_bookmarks',
      description: 'Save, list or remove web bookmarks, optionally tagged ("save this link under reading").',
      parameters: {
        type: 'object',
        properties: {
          action: str('Operation.', { enum: ['add', 'list', 'remove'] }),
          url: str('Link (for add).'), title: str('Title (for add) or title text to match (for remove).'), tag: str('Optional tag / folder.'), id: str('Bookmark id (for remove).'),
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'track_habit',
      description: 'Habit tracker with streaks: log a habit as done today, check status / streaks, list all habits, or stop tracking one.',
      parameters: {
        type: 'object',
        properties: { action: str('Operation.', { enum: ['log', 'status', 'list', 'remove'] }), habit: str('Habit name, e.g. "gym", "reading".') },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'color_convert',
      description: 'Convert a colour between HEX, RGB and HSL and report contrast against white and black. Input like "#8b5cf6", "rgb(139,92,246)" or "hsl(258,90%,66%)".',
      parameters: { type: 'object', properties: { color: str('Colour value.') }, required: ['color'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_focus_session',
      description: 'Start a Pomodoro-style focus session: a work timer followed by an automatic break timer.',
      parameters: {
        type: 'object',
        properties: { minutes: num('Work minutes (default 25).', { minimum: 1, maximum: 180 }), break_minutes: num('Break minutes (default 5, 0 for none).', { minimum: 0, maximum: 60 }), label: str('What you are focusing on.') },
        additionalProperties: false,
      },
    },
  },
];

export const TOOL_NAMES = new Set(TOOL_DEFS.map((t) => t.function.name));

/** Short human labels for the tool chips in the chat. */
export const TOOL_LABELS: Record<string, string> = {
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
  web_search: 'Searching the web',
  read_webpage: 'Reading page',
  wikipedia_summary: 'Looking up Wikipedia',
  define_word: 'Defining word',
  convert_currency: 'Converting currency',
  convert_units: 'Converting units',
  world_time: 'Checking world time',
  manage_tasks: 'Updating tasks',
  generate_password: 'Generating password',
  random_pick: 'Picking randomly',
  set_theme: 'Changing theme',
  generate_pdf: 'Creating PDF',
  list_files: 'Listing files',
  read_file: 'Reading file',
  save_file: 'Saving file',
  system_info: 'Checking system',
  app_control: 'Controlling the app',
  copy_to_clipboard: 'Copying to clipboard',
  get_news: 'Fetching headlines',
  get_crypto_price: 'Checking crypto price',
  country_info: 'Looking up country',
  public_holidays: 'Checking holidays',
  date_calc: 'Calculating dates',
  text_tools: 'Processing text',
  finance_calc: 'Running the numbers',
  manage_expenses: 'Updating expenses',
  manage_bookmarks: 'Updating bookmarks',
  track_habit: 'Updating habit',
  color_convert: 'Converting colour',
  start_focus_session: 'Starting focus session',
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
      'You are an agent: you can take actions for the user with tools. Use a tool whenever the user asks for something a tool does (alarms, timers, email, notes, to-do tasks, contacts, weather, maths, unit and currency conversion, dates, loans/investments/tax maths, expense tracking, habits, bookmarks, focus timers, text utilities, colours, news, crypto prices, country facts, holidays, world time, dictionary, Wikipedia, web search / reading pages, passwords, random picks, theme changes, clipboard, opening a site); never claim you did something you did not do with a tool.',
      'For multi-part requests, chain tools yourself (e.g. look up the weather, then set a reminder about the umbrella, then summarise) instead of asking the user to do each step. For facts that may have changed recently (news, prices, "latest"), search first and answer from the results, naming the source. Do not guess exchange rates, weather or times: use the tools.',
      'Questions about who founded or runs Nameless Labs / Mythical Studios are answered from the COMPANY & TEAM section of your instructions, not from tools.',
      `The user's current local time is ${opts.nowIso} (timezone ${opts.timeZone}). Convert relative times ("tomorrow 6am", "in an hour") yourself: for alarms prefer \`in_minutes\` for short offsets, otherwise pass \`time\` (24h HH:MM) and \`date\`.`,
      'If a required detail is missing (an email address, which alarm to cancel), ask one short question instead of guessing.',
      'send_email only creates a draft; the user confirms before it is sent. After calling it, wait for the tool result and then tell the user plainly what happened (sent, cancelled, or opened in their mail app).',
      'DESKTOP & FILES: generate_pdf makes real PDFs (write the whole document yourself). list_files / read_file / save_file only work inside the single folder the user connected with the Desktop button; if it is not connected, say so and tell them to click it. You can read system_info and use app_control to operate this app (new chat, model, mode, sidebar, export). You can NOT control the operating system, other programs, or other browser tabs (only open new ones with open_website); never claim you did.',
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
