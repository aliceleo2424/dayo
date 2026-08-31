-- Session report cards + profile display fields (nickname / point_balance)
alter table public.profiles
  add column if not exists nickname text;

alter table public.profiles
  add column if not exists point_balance integer not null default 0;

update public.profiles
set nickname = coalesce(nullif(nickname, ''), user_name, split_part(coalesce(email, 'DayO'), '@', 1))
where nickname is null or nickname = '';

create table if not exists public.session_reports (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  partner_name text,
  spoken_sentence text,
  keyword text,
  illust_url text,
  partner_comment text,
  stamp text,
  created_at timestamptz not null default now()
);

create index if not exists session_reports_learner_id_idx
  on public.session_reports (learner_id);

create index if not exists session_reports_created_at_idx
  on public.session_reports (created_at desc);

alter table public.session_reports enable row level security;

drop policy if exists "session_reports_select_all" on public.session_reports;
create policy "session_reports_select_all"
  on public.session_reports for select
  using (true);

drop policy if exists "session_reports_insert_all" on public.session_reports;
create policy "session_reports_insert_all"
  on public.session_reports for insert
  with check (true);
