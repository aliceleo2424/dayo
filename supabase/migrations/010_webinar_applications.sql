-- Live webinar pre-registration (name / phone / email / type)
create table if not exists public.webinar_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  webinar_type text not null default 'free',
  created_at timestamptz not null default now(),
  constraint webinar_applications_type_check
    check (webinar_type in ('free', 'paid'))
);

create index if not exists webinar_applications_created_at_idx
  on public.webinar_applications (created_at desc);

create index if not exists webinar_applications_email_idx
  on public.webinar_applications (email);

alter table public.webinar_applications enable row level security;

grant insert on public.webinar_applications to anon, authenticated;

drop policy if exists "webinar_applications_insert_anon" on public.webinar_applications;
create policy "webinar_applications_insert_anon"
  on public.webinar_applications for insert
  to anon
  with check (true);

drop policy if exists "webinar_applications_insert_authenticated" on public.webinar_applications;
create policy "webinar_applications_insert_authenticated"
  on public.webinar_applications for insert
  to authenticated
  with check (true);
