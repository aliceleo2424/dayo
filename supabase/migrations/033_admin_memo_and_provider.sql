-- Keep admin member-management columns present and refresh PostgREST's schema cache.
-- Version 033 is used because version 023 already belongs to partner_admin_audit.

alter table public.profiles
  add column if not exists admin_memo text,
  add column if not exists provider text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_provider_idx
  on public.profiles (provider);

comment on column public.profiles.admin_memo is
  'Internal customer-support memo managed by DayO administrators.';

comment on column public.profiles.provider is
  'Authentication provider: email, google, kakao, or null when unknown.';

notify pgrst, 'reload schema';
