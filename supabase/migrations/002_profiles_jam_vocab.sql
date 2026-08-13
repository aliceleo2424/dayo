-- Jam rewards + review vocab notebook on profiles
alter table public.profiles
  add column if not exists jam_count integer not null default 0;

alter table public.profiles
  add column if not exists review_vocab jsonb not null default '[]'::jsonb;
