-- Quiz result lead magnet (email + language/level/score)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  language text,
  level text,
  score integer,
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (email);

alter table public.leads enable row level security;

drop policy if exists "leads_insert_anon" on public.leads;
create policy "leads_insert_anon"
  on public.leads for insert
  to anon
  with check (true);
