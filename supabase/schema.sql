-- Run once in Supabase → SQL Editor (project nzaelikbjumaidaombmp).
-- Creates per-user cloud chat history protected by Row Level Security.

create table if not exists public.chats (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'New chat',
  model       text not null default 'nameless-ai',
  messages    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists chats_user_updated_idx on public.chats (user_id, updated_at desc);

alter table public.chats enable row level security;

drop policy if exists "chats_select_own" on public.chats;
drop policy if exists "chats_insert_own" on public.chats;
drop policy if exists "chats_update_own" on public.chats;
drop policy if exists "chats_delete_own" on public.chats;

create policy "chats_select_own" on public.chats for select to authenticated using (auth.uid() = user_id);
create policy "chats_insert_own" on public.chats for insert to authenticated with check (auth.uid() = user_id);
create policy "chats_update_own" on public.chats for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chats_delete_own" on public.chats for delete to authenticated using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-account settings + personal data (AI name, theme, persona, model, voice, and the
-- AI's tasks / notes / contacts / alarms / expenses / bookmarks / habits).
-- Run this once too. Everything is private to the signed-in user via Row Level Security.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ai_name     text,
  theme       text,
  persona     text,
  model       text,
  voice_lang  text,
  agent       boolean,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "settings_select_own" on public.user_settings;
drop policy if exists "settings_insert_own" on public.user_settings;
drop policy if exists "settings_update_own" on public.user_settings;
drop policy if exists "settings_delete_own" on public.user_settings;

create policy "settings_select_own" on public.user_settings for select to authenticated using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings for insert to authenticated with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.user_settings for delete to authenticated using (auth.uid() = user_id);
