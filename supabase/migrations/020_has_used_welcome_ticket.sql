-- Track whether the first-session 9,900 KRW trial has already been used.

alter table public.profiles
  add column if not exists has_used_welcome_ticket boolean not null default false;
