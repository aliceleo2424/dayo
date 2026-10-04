-- Self-declared operational details; never change approved roles or verified capabilities.
begin;
create table public.partner_profile_details (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid unique not null references public.profiles(id) on delete restrict,
  location_status text check (location_status in ('korea','overseas')),
  visa_type text check (visa_type in ('D-2','D-4','F-series','Other visa','not_applicable_overseas')),
  native_languages text[],
  other_languages jsonb not null default '[]'::jsonb check (jsonb_typeof(other_languages) = 'array'),
  session_languages text[],
  korean_level text check (korean_level in ('none','basic','conversational','advanced','native')),
  availability_periods text[],
  weekly_session_capacity text check (weekly_session_capacity in ('1-2','3-5','6-10','10+')),
  partner_guide_acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_profile_completion_required check (completed_at is null or (
    location_status is not null and visa_type is not null and korean_level is not null
    and weekly_session_capacity is not null and partner_guide_acknowledged_at is not null
    and coalesce(cardinality(native_languages),0) > 0
    and coalesce(cardinality(session_languages),0) > 0
    and coalesce(cardinality(availability_periods),0) > 0))
);
comment on table public.partner_profile_details is 'Partner self-declared details, separate from profiles and admin-verified partner_capabilities.';
alter table public.partner_profile_details enable row level security;
revoke all on public.partner_profile_details from public, anon, authenticated;
grant select on public.partner_profile_details to authenticated;
create policy partner_profile_details_read on public.partner_profile_details for select to authenticated
  using (public.dayo_is_admin() or (partner_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'partner')));

-- Only this RPC writes. The caller cannot provide an identity, completion date or approval role.
create function public.save_partner_profile_completion(p_details jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_location text; v_visa text; v_korean text; v_capacity text;
  v_native text[]; v_session text[]; v_availability text[];
  v_other jsonb; v_entry jsonb; v_language text; v_level text;
  v_seen text[] := '{}'::text[];
  v_result public.partner_profile_details;
begin
  if v_uid is null then raise exception 'Partner access required.' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = v_uid and role = 'partner' for share;
  if not found then raise exception 'Partner access required.' using errcode = '42501'; end if;
  if p_details is null or jsonb_typeof(p_details) is distinct from 'object'
    or p_details -> 'guide_acknowledged' is distinct from 'true'::jsonb then
    raise exception 'Read and acknowledge the DayO Partner Guide.' using errcode = '22023';
  end if;
  v_location := p_details ->> 'location_status'; v_visa := p_details ->> 'visa_type';
  v_korean := p_details ->> 'korean_level'; v_capacity := p_details ->> 'weekly_session_capacity';
  if v_location is null or v_location not in ('korea','overseas')
    or v_visa is null or (v_location = 'korea' and v_visa not in ('D-2','D-4','F-series','Other visa'))
    or (v_location = 'overseas' and v_visa <> 'not_applicable_overseas')
    or v_korean is null or v_korean not in ('none','basic','conversational','advanced','native')
    or v_capacity is null or v_capacity not in ('1-2','3-5','6-10','10+') then
    raise exception 'Complete location, visa, Korean level and weekly capacity.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_details -> 'native_languages') is distinct from 'array'
    or jsonb_typeof(p_details -> 'session_languages') is distinct from 'array'
    or jsonb_typeof(p_details -> 'availability_periods') is distinct from 'array'
    or jsonb_typeof(p_details -> 'other_languages') is distinct from 'array' then
    raise exception 'Invalid language or availability selections.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_details -> 'native_languages') x where jsonb_typeof(x) <> 'string')
    or exists (select 1 from jsonb_array_elements(p_details -> 'session_languages') x where jsonb_typeof(x) <> 'string')
    or exists (select 1 from jsonb_array_elements(p_details -> 'availability_periods') x where jsonb_typeof(x) <> 'string') then
    raise exception 'Selections must be text.' using errcode = '22023';
  end if;
  select array_agg(btrim(value)) into v_native from jsonb_array_elements_text(p_details -> 'native_languages');
  select array_agg(btrim(value)) into v_session from jsonb_array_elements_text(p_details -> 'session_languages');
  select array_agg(value) into v_availability from jsonb_array_elements_text(p_details -> 'availability_periods');
  if coalesce(cardinality(v_native),0) not between 1 and 14
    or coalesce(cardinality(v_session),0) not between 1 and 28
    or coalesce(cardinality(v_availability),0) not between 1 and 10
    or exists (select 1 from unnest(v_native || v_session) l where l is null or length(l) not between 1 and 100)
    or cardinality(v_native) <> (select count(distinct lower(l)) from unnest(v_native) l)
    or cardinality(v_session) <> (select count(distinct lower(l)) from unnest(v_session) l)
    or cardinality(v_availability) <> (select count(distinct l) from unnest(v_availability) l)
    or not (v_availability <@ array['weekday_early_morning','weekday_morning','weekday_afternoon','weekday_evening','weekday_late_night',
      'weekend_early_morning','weekend_morning','weekend_afternoon','weekend_evening','weekend_late_night']::text[]) then
    raise exception 'Choose valid, distinct languages and KST availability.' using errcode = '22023';
  end if;
  v_other := p_details -> 'other_languages';
  if jsonb_array_length(v_other) > 14 then raise exception 'Too many other languages.' using errcode = '22023'; end if;
  for v_entry in select value from jsonb_array_elements(v_other) loop
    v_language := btrim(v_entry ->> 'language'); v_level := v_entry ->> 'level';
    if jsonb_typeof(v_entry) <> 'object' or jsonb_typeof(v_entry -> 'language') is distinct from 'string'
      or v_language is null or length(v_language) not between 1 and 100
      or v_level is null or v_level not in ('basic','conversational','fluent','native')
      or lower(v_language) = any(v_seen)
      or exists (select 1 from unnest(v_native) l where lower(l) = lower(v_language)) then
      raise exception 'Invalid other language proficiency.' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen,lower(v_language));
  end loop;
  if exists (select 1 from unnest(v_session) l where not (l = any(v_native)) and not exists (
    select 1 from jsonb_array_elements(v_other) o where btrim(o ->> 'language') = l and o ->> 'level' in ('fluent','native'))) then
    raise exception 'Session languages must be native or fluent.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('language',btrim(o ->> 'language'),'level',o ->> 'level')),'[]'::jsonb)
    into v_other from jsonb_array_elements(v_other) o;
  insert into public.partner_profile_details(partner_id,location_status,visa_type,native_languages,other_languages,
    session_languages,korean_level,availability_periods,weekly_session_capacity,partner_guide_acknowledged_at,completed_at)
  values(v_uid,v_location,v_visa,v_native,v_other,v_session,v_korean,v_availability,v_capacity,now(),now())
  on conflict (partner_id) do update set location_status = excluded.location_status, visa_type = excluded.visa_type,
    native_languages = excluded.native_languages, other_languages = excluded.other_languages,
    session_languages = excluded.session_languages, korean_level = excluded.korean_level,
    availability_periods = excluded.availability_periods, weekly_session_capacity = excluded.weekly_session_capacity,
    partner_guide_acknowledged_at = coalesce(partner_profile_details.partner_guide_acknowledged_at,excluded.partner_guide_acknowledged_at),
    completed_at = coalesce(partner_profile_details.completed_at,excluded.completed_at), updated_at = now()
  returning * into v_result;
  return to_jsonb(v_result);
end;
$$;
revoke all on function public.save_partner_profile_completion(jsonb) from public, anon, authenticated;
grant execute on function public.save_partner_profile_completion(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
