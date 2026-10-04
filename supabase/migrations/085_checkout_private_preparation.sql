-- Checkout private contact/preference preparation only.
-- 073 contact_phone remains an unapplied legacy draft; never execute both.
-- Independent of Profiles Security; no profiles/Auth/payment contract changes.
begin;
do $$
begin
  if to_regclass('public.user_contact_info') is not null
     or to_regclass('public.user_conversation_preferences') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in ('checkout_interests_valid','checkout_private_touch')) then
    raise exception 'checkout preflight mismatch: object already exists; stop without modifying it';
  end if;
end $$;

create function public.checkout_interests_valid(text[], text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select $1 is not null
    and cardinality($1) + case when $2 is null then 0 else 1 end <= 4
    and $1 <@ array['drama','movies','youtube','music','travel','food_cafe','exercise','games',
      'fashion_beauty','pets','books_webtoon','work_school']::text[]
    and (select count(distinct item) from unnest($1) item) = cardinality($1)
    and ($2 is null or (char_length($2) between 1 and 40 and $2 = btrim($2)));
$$;
revoke all on function public.checkout_interests_valid(text[],text) from public,anon,authenticated;
grant execute on function public.checkout_interests_valid(text[],text) to authenticated,service_role;

create function public.checkout_private_touch()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end;
$$;
revoke all on function public.checkout_private_touch() from public,anon,authenticated;

create table public.user_contact_info (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contact_email text not null check (char_length(contact_email) <= 254 and contact_email = btrim(contact_email)
    and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  mobile_phone text not null check (mobile_phone ~ '^010[0-9]{8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_conversation_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  interests text[] not null default '{}',
  other_interest text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_interests_check check (public.checkout_interests_valid(interests,other_interest))
);
create trigger checkout_contact_touch before insert or update on public.user_contact_info
  for each row execute function public.checkout_private_touch();
create trigger checkout_preferences_touch before insert or update on public.user_conversation_preferences
  for each row execute function public.checkout_private_touch();

alter table public.user_contact_info enable row level security;
alter table public.user_conversation_preferences enable row level security;
revoke all on public.user_contact_info,public.user_conversation_preferences from public,anon,authenticated,service_role;
grant select on public.user_contact_info,public.user_conversation_preferences to authenticated,service_role;
grant insert (user_id,contact_email,mobile_phone),update (user_id,contact_email,mobile_phone)
  on public.user_contact_info to authenticated;
grant insert (user_id,interests,other_interest),update (user_id,interests,other_interest)
  on public.user_conversation_preferences to authenticated;

create policy checkout_contact_own_select on public.user_contact_info for select to authenticated
  using (user_id = (select auth.uid()));
create policy checkout_contact_own_insert on public.user_contact_info for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy checkout_contact_own_update on public.user_contact_info for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy checkout_preferences_own_select on public.user_conversation_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy checkout_preferences_own_insert on public.user_conversation_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy checkout_preferences_own_update on public.user_conversation_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

notify pgrst,'reload schema';
commit;
