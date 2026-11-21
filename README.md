# Nameless Labs AI

Premium dark-glass chat workspace (Next.js 14 · Tailwind · OpenRouter) with six model tiers,
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

## Structure

- `lib/models.ts` – tier names, badges, taglines (edit to rebrand)
- `app/api/chat/route.ts` – validated, streaming OpenRouter proxy (key stays server-side)
- `components/` – UI building blocks · `app/page.tsx` – chat state & streaming client
- `colab_train_namelessai.py` – fine-tuning script for the custom tier
