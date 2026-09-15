-- CS drawer support: ticket ledgers + admin memo + kakao id + order payment fields

alter table public.profiles
  add column if not exists admin_memo text,
  add column if not exists kakao_id text;

alter table public.orders
  add column if not exists payment_method text,
  add column if not exists refund_status text;

create table if not exists public.credit_ledgers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  profile_id uuid,
  delta integer not null,
  balance_after integer,
  reason text,
  source text default 'system',
  created_at timestamptz not null default now()
);

create index if not exists credit_ledgers_user_id_idx
  on public.credit_ledgers (user_id, created_at desc);

create index if not exists credit_ledgers_profile_id_idx
  on public.credit_ledgers (profile_id, created_at desc);

alter table public.credit_ledgers enable row level security;
