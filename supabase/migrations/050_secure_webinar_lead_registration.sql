-- Secure the existing webinar lead table and expose a validated registration RPC.

begin;

alter table public.webinar_applications
  add column if not exists source text not null default 'main_webinar',
  add column if not exists status text not null default 'registered',
  add column if not exists notified boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists interest_language text,
  add column if not exists interest_language_other text;

alter table public.webinar_applications
  alter column phone drop not null;

alter table public.webinar_applications
  drop constraint if exists webinar_applications_interest_language_check;

alter table public.webinar_applications
  add constraint webinar_applications_interest_language_check
  check (
    interest_language is null
    or interest_language in (
      'english',
      'japanese',
      'chinese',
      'french',
      'spanish',
      'other'
    )
  );

create index if not exists webinar_applications_email_normalized_idx
  on public.webinar_applications (lower(btrim(email)));

alter table public.webinar_applications enable row level security;

drop policy if exists "webinar_applications_insert_anon"
  on public.webinar_applications;
drop policy if exists "webinar_applications_insert_authenticated"
  on public.webinar_applications;
drop policy if exists "webinar_applications_select_admin"
  on public.webinar_applications;

revoke all privileges on table public.webinar_applications
  from public, anon, authenticated;

grant select on table public.webinar_applications
  to authenticated;

grant all privileges on table public.webinar_applications
  to service_role;

create policy "webinar_applications_select_admin"
  on public.webinar_applications
  for select
  to authenticated
  using (public.dayo_is_admin());

drop function if exists public.register_webinar_lead(text, text, text);

create or replace function public.register_webinar_lead(
  p_name text,
  p_email text,
  p_interest_language text,
  p_interest_language_other text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_interest_language text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_interest_language, '')));
  v_interest_language_other text := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_interest_language_other, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_existing_id uuid;
begin
  if pg_catalog.length(v_name) < 1 or pg_catalog.length(v_name) > 80 then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_name');
  end if;

  if pg_catalog.length(v_email) < 3
     or pg_catalog.length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_email');
  end if;

  if v_interest_language not in (
    'english',
    'japanese',
    'chinese',
    'french',
    'spanish',
    'other'
  ) then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_interest_language');
  end if;

  if v_interest_language = 'other' then
    if pg_catalog.length(v_interest_language_other) < 1
       or pg_catalog.length(v_interest_language_other) > 80 then
      return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_interest_language_other');
    end if;
  else
    v_interest_language_other := null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));

  select application.id
    into v_existing_id
    from public.webinar_applications as application
   where pg_catalog.lower(pg_catalog.btrim(application.email)) = v_email
   order by application.created_at desc
   limit 1
   for update;

  if v_existing_id is not null then
    -- Return the same success shape without exposing whether an email exists.
    return pg_catalog.jsonb_build_object('success', true);
  end if;

  insert into public.webinar_applications (
    name,
    email,
    webinar_type,
    source,
    status,
    notified,
    interest_language,
    interest_language_other
  ) values (
    v_name,
    v_email,
    'free',
    'main_webinar',
    'registered',
    false,
    v_interest_language,
    v_interest_language_other
  );

  return pg_catalog.jsonb_build_object('success', true);
end;
$$;

revoke all on function public.register_webinar_lead(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.register_webinar_lead(text, text, text, text)
  to anon, authenticated, service_role;

commit;
