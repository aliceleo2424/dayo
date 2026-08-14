-- Session STT transcripts (run in Supabase SQL editor)
create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  client_key text,
  user_name text,
  email text,
  room_name text,
  transcript jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists session_logs_client_key_idx on public.session_logs (client_key);
create index if not exists session_logs_ended_at_idx on public.session_logs (ended_at desc);

alter table public.session_logs enable row level security;

drop policy if exists "session_logs_select_anon" on public.session_logs;
create policy "session_logs_select_anon"
  on public.session_logs for select
  to anon
  using (true);

drop policy if exists "session_logs_insert_anon" on public.session_logs;
create policy "session_logs_insert_anon"
  on public.session_logs for insert
  to anon
  with check (true);
