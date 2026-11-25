# Nameless Labs AI

Premium dark-glass chat workspace (390 switchable colour themes) (Next.js 14 · Tailwind · OpenRouter) with six model tiers,
live streaming replies, Markdown + code rendering, chat history and a mobile-friendly layout.

## Deploy on Vercel

1. Push this folder to GitHub and import it in Vercel (framework: Next.js is auto-detected).
2. **Project → Settings → Environment Variables** → add `OPENROUTER_API_KEY` (all environments).
3. Redeploy. Done.

## Supabase login (Google · GitHub · Email) — project `nzaelikbjumaidaombmp`

1. **Env vars** (Vercel + `.env.local`): `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon/publishable key from
   Supabase → Project Settings → API. (`NEXT_PUBLIC_SUPABASE_URL` already defaults to your project.)
2. **Auth → URL Configuration**: set *Site URL* to your Vercel URL and add it (plus `http://localhost:3000`)
   to *Redirect URLs*.
3. **Auth → Providers**: enable Google and GitHub (paste each provider's client ID/secret; use the
   callback URL `https://nzaelikbjumaidaombmp.supabase.co/auth/v1/callback` in the Google/GitHub consoles) and Email.
4. **SQL Editor**: run `supabase/schema.sql` once. It creates the `chats` table with Row Level Security so
   each user can only read/write their own chats.

Guests see "Guest" in the sidebar and keep chats on-device. After login the sidebar shows the user's name and
profile picture, chats sync to the cloud, and any guest chats are carried over.

## Team / company knowledge

`lib/team.ts` holds the leadership list (Chethan – Main Founder · Vijay – CEO · Kedar – CMO / MD). It is injected into every
model's system prompt, so "who is the CEO / founder / CMO?" is answered correctly on all tiers. Add people by adding a line to `TEAM`.

## More agent tools

| Say | Tool |
|---|---|
| "Add send invoice to my tasks" · "what's on my to-do list" · "mark invoice done" | `manage_tasks` (this browser) |
| "2500 USD in INR" | `convert_currency` (ECB rates via Frankfurter) |
| "5 km in miles" · "98.6 F to C" | `convert_units` |
| "Time in Tokyo" | `world_time` |
| "Who is Alan Turing" | `wikipedia_summary` |
| "Define ephemeral" | `define_word` |
| "Read https://… and summarise" | `read_webpage` (public pages only; private/internal addresses blocked) |
| "Search the web for …" | `web_search` (needs `TAVILY_API_KEY`) |
| "Strong 20 char password" · "roll two dice" · "pick pizza or burgers" | `generate_password`, `random_pick` |
| "Switch to the Ember theme" · "copy that" | `set_theme`, `copy_to_clipboard` |

| "EMI for 20 lakh at 9% for 15 years" · "SIP of 5000 for 10 years" · "18% GST on 4500" | `finance_calc` |
| "Days until 2027-01-26" · "what weekday is 2026-12-25" | `date_calc` |
| "Spent 450 on lunch" · "how much did I spend this month" | `manage_expenses` |
| "Log gym" · "what's my reading streak" | `track_habit` |
| "Bookmark this link under reading" | `manage_bookmarks` |
| "25 minute focus session on the pitch deck" | `start_focus_session` |
| "Word count / base64 / SHA-256 of …" | `text_tools` |
| "#8b5cf6 as rgb" | `color_convert` |
| "News about AI" · "bitcoin price" · "facts about Japan" · "holidays in India" | `get_news`, `get_crypto_price`, `country_info`, `public_holidays` |

## Modes

Pick a working mode from the header (Senior Engineer, Writer, Tutor, Analyst, Marketing Lead, Startup Coach, Brief). Edit or add modes in `lib/personas.ts`.

## Themes

Aurora (default), Ember, Emerald, Ocean, Rose — pick from the colour dot in the header, or ask the AI. The palette is a set of CSS variables
in `app/globals.css`; Tailwind's `cyan-*` scale points at them (see `tailwind.config.js`), so add a theme by adding one `html[data-theme=…]`
block there plus an entry in `lib/theme.ts`.

## Run locally

```bash
npm install
cp .env.example .env.local   # then paste your OpenRouter key
npm run dev                  # http://localhost:3000
```

## Model tiers

| Tier | OpenRouter slug (default) |
|---|---|
| NamelessAI (Custom Fine-Tuned) | `qwen/qwen-2.5-72b-instruct` (or your `CUSTOM_MODEL_URL`) |
| Pulse 5.5 Nano | `meta-llama/llama-3.2-3b-instruct` |
| Lyric 5.5 Flash | `google/gemini-2.5-flash` |
| Vega 5.5 Mini | `openai/gpt-4o-mini` |
| Aether 5.5 Pro | `anthropic/claude-sonnet-5.5` |
| Quasar 5.5 Apex | `deepseek/deepseek-r1-0528` |

OpenRouter retires and renames models. If a tier ever errors with "model not found", set e.g.
`MODEL_AETHER_PRO=<new-slug>` in Vercel – no code change needed (see `.env.example`).

## Agent actions + voice

NamelessAI can *do* things, not just chat. Ask in text or by voice (mic button, bottom right):

| Say | What happens |
|---|---|
| "Wake me at 6:30" · "remind me at 5pm to call mom" · "every weekday at 7" | alarm on your device (rings + notification + spoken) |
| "Timer for 10 minutes" | countdown timer |
| "Email Rahul about tomorrow's meeting being moved to 3" | AI writes the email → **you review/edit → Send** |
| "Save Rahul's email as rahul@x.com" | contact book (this browser) |
| "Note: renew domain" · "what's on my shopping list?" | notes/lists (this browser) |
| "Weather in Pune" · "what's 18% of 2450" · "open github.com" | weather (Open-Meteo), exact maths, open a tab |

**Voice mode** is hands-free: it listens, sends when you stop talking, speaks the answer sentence-by-sentence
while it streams, then listens again. Tap the orb to skip speech, ✕ or Esc to leave. Uses the browser's built-in
speech recognition + synthesis (Chrome, Edge, Safari; no key needed; language picker included).
For emails in voice mode it reads the draft back and waits for "send" / "cancel".

How it works: `/api/chat` forwards tool schemas to the model (OpenAI-style function calling via OpenRouter) and
streams NDJSON events (`text`, `tool_calls`). `app/page.tsx` runs the loop: execute tools → send results back →
repeat (max 6 steps). Alarms/notes/contacts/maths run in the browser (`lib/clientTools.ts`); weather and email
run on the server (`app/api/tools/route.ts`).

**Safety:** emails are never sent without an explicit confirmation click/voice "send"; only signed-in users can send;
sender identity is transparent ("sent on behalf of …", Reply-To = the user); rate-limited; no tool can read your
files or inbox.

**Limits to know**
- Alarms live in the browser: they ring while the page is open in a tab (background tab OK, closed tab/phone asleep not).
  True background alarms would need a service worker + Web Push (not included).
- Models that can't call tools (Pulse Nano, Quasar Apex — see `tools:` in `lib/models.ts`) run as plain chat; the
  "Actions" toggle in the header is disabled for them. Flip the flag if your slug supports tools.
- With actions on, the NamelessAI tier goes through OpenRouter (your `CUSTOM_MODEL_URL` endpoint is used when actions are off).
- Set `RESEND_API_KEY` + `EMAIL_FROM` to send directly; otherwise the card opens your mail app with the draft.

### Add your own tool
1. Add a schema to `TOOL_DEFS` (+ a label in `TOOL_LABELS`) in `lib/toolDefs.ts`.
2. Browser-side: add a `case` in `lib/clientTools.ts`. Server-side: add the name to `SERVER_TOOLS` and a handler in `app/api/tools/route.ts`.

## Structure

- `lib/models.ts` – tier names, badges, taglines (edit to rebrand)
- `app/api/chat/route.ts` – validated, streaming OpenRouter proxy with tool calling (key stays server-side)
- `app/api/tools/route.ts` – server tools (email via Resend, weather) · `lib/clientTools.ts` – browser tools
- `lib/voice.ts`, `lib/useVoiceMode.ts` – speech in/out · `lib/alarms.ts`, `components/AlarmRinger.tsx` – alarms
- `components/` – UI building blocks · `app/page.tsx` – chat state & streaming client
- `colab_train_namelessai.py` – fine-tuning script for the custom tier


## v5: accounts, AI naming, 390 themes

**Run `supabase/schema.sql` again** (it now also creates `user_settings`). Without it, sign-in works but settings/data won't save.

- **Name your AI** – a popup on first visit. The name is sent with every message, so the AI introduces itself and answers to it. Click *Rename* on the home screen to change it.
- **Saved to the account, not the device** – signed-in users get chats, AI name, theme, persona, model, voice language, Actions toggle and the AI's tasks / notes / contacts / alarms / expenses / bookmarks / habits stored in Supabase (RLS: each user only sees their own rows). Nothing is written to `localStorage`.
- **Guests are not saved** – a banner and the sidebar say so. Everything lives in memory and is gone on refresh. (The AI name and theme are kept only for the current tab via `sessionStorage`.) Chats made in a tab before signing in are kept and saved to the account on sign-in.
- **Google login** – enable the Google provider in Supabase → Authentication → Providers and add your site URL under URL Configuration.
- **390 themes** – 26 colours × 15 styles (e.g. *Ruby Midnight*, *Azure Neon*), searchable in the header picker. The AI can switch them too: "set the theme to violet noir", "random theme".
