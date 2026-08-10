-- DayO profiles table (run in Supabase SQL editor)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  client_key text not null unique,
  user_name text,
  email text,
  ticket_count integer not null default 1,
  streak_count integer not null default 1,
  last_login_date text,
  speech_speed text not null default 'slow',
  preferred_style text not null default 'casual',
  preferred_request text not null default 'praise',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_client_key_idx on public.profiles (client_key);
create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

-- MVP: anon read/write by client_key (tighten when Auth is fully wired)
drop policy if exists "profiles_select_anon" on public.profiles;
create policy "profiles_select_anon"
  on public.profiles for select
  to anon
  using (true);

drop policy if exists "profiles_insert_anon" on public.profiles;
create policy "profiles_insert_anon"
  on public.profiles for insert
  to anon
  with check (true);

drop policy if exists "profiles_update_anon" on public.profiles;
create policy "profiles_update_anon"
  on public.profiles for update
  to anon
  using (true)
  with check (true);
