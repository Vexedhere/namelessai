-- Persistent, atomic AI rate limiting shared by all Vercel serverless instances.
-- Run this file once in Supabase Dashboard -> SQL Editor before enabling public chat.

create table if not exists public.ai_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

create index if not exists ai_rate_limits_window_idx
  on public.ai_rate_limits (window_started_at);

alter table public.ai_rate_limits enable row level security;
revoke all on public.ai_rate_limits from anon, authenticated, public;

create or replace function public.consume_ai_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz;
  v_count integer;
begin
  if p_bucket_key is null or length(p_bucket_key) <> 64
     or p_window_seconds < 1 or p_window_seconds > 86400
     or p_max_requests < 1 then
    raise exception 'Invalid rate-limit arguments';
  end if;

  insert into public.ai_rate_limits (bucket_key, window_started_at, request_count)
  values (p_bucket_key, now(), 1)
  on conflict (bucket_key) do update
    set window_started_at = case
          when public.ai_rate_limits.window_started_at
               + make_interval(secs => p_window_seconds) <= now()
          then now()
          else public.ai_rate_limits.window_started_at
        end,
        request_count = case
          when public.ai_rate_limits.window_started_at
               + make_interval(secs => p_window_seconds) <= now()
          then 1
          else public.ai_rate_limits.request_count + 1
        end
  returning window_started_at, request_count into v_started, v_count;

  -- Opportunistic cleanup keeps this table bounded without requiring pg_cron.
  delete from public.ai_rate_limits
   where window_started_at < now() - interval '2 days';

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_ai_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_rate_limit(text, integer, integer) to service_role;
