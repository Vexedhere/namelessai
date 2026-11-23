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

-- Image-generation quota ledger. Limits are enforced by /api/images, server-side.
create table if not exists public.image_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  model text not null default 'configured-provider',
  created_at timestamptz not null default now()
);
create index if not exists image_generations_user_created_idx on public.image_generations (user_id, created_at desc);
alter table public.image_generations enable row level security;
drop policy if exists "image_generations_select_own" on public.image_generations;
create policy "image_generations_select_own" on public.image_generations for select to authenticated using (auth.uid() = user_id);
