-- One-shot welcome email flag for new signups

alter table public.profiles
  add column if not exists welcome_email_sent boolean not null default false;

create index if not exists profiles_welcome_email_sent_idx
  on public.profiles (welcome_email_sent);
