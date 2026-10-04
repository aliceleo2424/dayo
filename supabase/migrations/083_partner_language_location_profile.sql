-- Additive language/location update. No historical data or approval state is rewritten.
begin;
alter table public.partner_applications
  add column location_status text check (location_status in ('korea','overseas')),
  add column korea_city_other text check (length(btrim(korea_city_other)) between 1 and 100);
alter table public.partner_applications drop constraint partner_applications_visa_type_check;
alter table public.partner_applications add constraint partner_applications_visa_type_check
  check (visa_type in ('D-2','D-4','F-series','Other','Other visa','outside_korea','not_applicable_overseas'));
grant insert (location_status,korea_city_other) on public.partner_applications to anon, authenticated;

-- Retain historical time bands, but new applications no longer collect them.
alter table public.partner_applications alter column availability_periods set default '{}'::text[];
alter table public.partner_applications drop constraint partner_applications_availability_periods_check;
alter table public.partner_applications add constraint partner_applications_availability_periods_check
  check (cardinality(availability_periods) between 0 and 10 and availability_periods <@ array[
    'weekday_early_morning','weekday_morning','weekday_afternoon','weekday_evening','weekday_late_night',
    'weekend_early_morning','weekend_morning','weekend_afternoon','weekend_evening','weekend_late_night']::text[]);
comment on column public.partner_applications.availability_periods is 'Legacy application time bands. Not current availability; new applications omit this field.';
comment on column public.partner_applications.weekly_session_capacity is 'Rough supply-planning estimate only; booking availability comes from availability_slots.';

alter table public.partner_profile_details
  add column country text check (length(btrim(country)) between 1 and 100),
  add column city text check (length(btrim(city)) between 1 and 100),
  add column korea_city_other text check (length(btrim(korea_city_other)) between 1 and 100);
-- 081 already created availability_periods: preserve the column and all historical values.
alter table public.partner_profile_details drop constraint partner_profile_completion_required;
alter table public.partner_profile_details add constraint partner_profile_completion_required check (completed_at is null or (
  location_status is not null and visa_type is not null and korean_level is not null
  and weekly_session_capacity is not null and partner_guide_acknowledged_at is not null
  and coalesce(cardinality(native_languages),0) > 0 and coalesce(cardinality(session_languages),0) > 0));
comment on column public.partner_profile_details.availability_periods is 'Deprecated self-declared time bands, retained for history only. RPC no longer writes this field.';
comment on column public.partner_profile_details.weekly_session_capacity is 'Rough supply-planning estimate only; booking availability comes from availability_slots.';
-- Grants, RLS and first acknowledgement/completion timestamps remain unchanged.

create or replace function public.validate_partner_application_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_upload public.partner_application_uploads%rowtype;
  v_language text;
  v_level text;
begin
  if exists (select 1 from public.partner_applications where lower(trim(email)) = lower(trim(new.email)) and final_status <> 'rejected') then
    raise exception 'An application with this email already exists.' using errcode = '23505';
  end if;
  if new.current_country is null or length(trim(new.current_country)) = 0
    or new.native_languages is null or cardinality(new.native_languages) not between 1 and 14 then
    raise exception 'Location and native languages are required.' using errcode = '23514';
  end if;
  if new.visa_type in ('outside_korea','not_applicable_overseas') and lower(trim(new.current_country)) in ('korea','south korea','republic of korea','한국','대한민국') then
    raise exception 'Overseas applicants must provide their current country.' using errcode = '23514';
  end if;
  -- Older clients without location_status remain valid during the deployment transition.
  if new.location_status is not null then
    if new.current_city is null or length(btrim(new.current_city)) not between 1 and 100
      or (new.location_status = 'korea' and (new.current_country <> 'South Korea' or new.visa_type not in ('D-2','D-4','F-series','Other','Other visa')))
      or (new.location_status = 'overseas' and (new.visa_type <> 'not_applicable_overseas' or lower(btrim(new.current_country)) in ('korea','south korea','republic of korea','한국','대한민국')))
      or (new.korea_city_other is not null and (new.location_status <> 'korea' or new.korea_city_other <> new.current_city)) then
      raise exception 'Invalid country, city or visa for your location.' using errcode = '23514';
    end if;
  end if;
  if exists (select 1 from unnest(new.native_languages) l where l is null or length(trim(l)) not between 1 and 100)
    or cardinality(new.native_languages) <> (select count(distinct lower(trim(l))) from unnest(new.native_languages) l) then
    raise exception 'Invalid native languages.' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(new.other_language_proficiencies) <> 'object' then
    raise exception 'Invalid language proficiency mapping.' using errcode = '23514';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(new.other_language_proficiencies)) > 14 then
    raise exception 'Too many languages.' using errcode = '23514';
  end if;
  for v_language, v_level in select key, value from pg_catalog.jsonb_each_text(new.other_language_proficiencies) loop
    if length(trim(v_language)) not between 1 and 100 or v_level not in ('basic','conversational','fluent','native') or v_level is null
      or exists (select 1 from unnest(new.native_languages) l where lower(trim(l)) = lower(trim(v_language))) then
      raise exception 'Invalid language proficiency.' using errcode = '23514';
    end if;
  end loop;
  if new.partner_languages is null or cardinality(new.partner_languages) not between 1 and 20
    or cardinality(new.partner_languages) <> (select count(distinct lower(trim(l))) from unnest(new.partner_languages) l)
    or exists (select 1 from unnest(new.partner_languages) l where l is null or length(trim(l)) not between 1 and 100 or (not (l = any(new.native_languages)) and coalesce(new.other_language_proficiencies ->> l, '') not in ('conversational','fluent','native'))) then
    raise exception 'Session languages must be native or Conversational or higher.' using errcode = '23514';
  end if;
  if new.acquisition_source not in ('','friend_referral','instagram','facebook_group','university_community','international_student_community','job_board','reddit_discord','google_search','flyer_qr','other')
    or (new.acquisition_source = 'other' and length(trim(new.acquisition_source_other)) = 0) then
    raise exception 'Invalid acquisition source.' using errcode = '23514';
  end if;
  if new.intro_video_language is null or not (new.intro_video_language = any(new.partner_languages)) then
    raise exception 'Video language must be a selected session language.' using errcode = '23514';
  end if;
  select * into v_upload from public.partner_application_uploads where id = new.media_upload_id for update;
  if not found or v_upload.claimed_at is not null or v_upload.created_at < now() - interval '24 hours'
    or new.intro_video_path is distinct from v_upload.video_path then
    raise exception 'Invalid or expired media upload.' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'partner-application-videos' and name = v_upload.video_path) then
    raise exception 'Upload your files before submitting.' using errcode = '23514';
  end if;
  update public.partner_application_uploads set claimed_at = now() where id = v_upload.id;
  -- Keep the existing columns for older admin clients; preserve 077 triage logic.
  new.strongest_language := new.native_languages[1];
  select left(coalesce(string_agg(key || ' (' || value || ')', ', ' order by key), ''),300)
    into new.other_languages from pg_catalog.jsonb_each_text(new.other_language_proficiencies);
  return new;
end;
$$;

create or replace function public.save_partner_profile_completion(p_details jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_location text; v_visa text; v_korean text; v_capacity text;
  v_country text; v_city text; v_city_other text; v_has_location boolean;
  v_native text[]; v_session text[];
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
  -- Do not rewrite completed legacy rows or require them to complete again.
  -- New clients send country/city. Old 081 clients omit both during rollout.
  v_has_location := p_details ? 'country' or p_details ? 'city';
  if v_has_location then
    v_country := btrim(p_details ->> 'country'); v_city := btrim(p_details ->> 'city');
    v_city_other := nullif(btrim(p_details ->> 'korea_city_other'),'');
    if v_country is null or length(v_country) not between 1 and 100
      or v_city is null or length(v_city) not between 1 and 100
      or (v_location = 'korea' and v_country <> 'South Korea')
      or (v_location = 'overseas' and lower(v_country) in ('korea','south korea','republic of korea','한국','대한민국'))
      or (v_city_other is not null and (v_location <> 'korea' or v_city_other <> v_city)) then
      raise exception 'Complete a valid country and city for your location.' using errcode = '22023';
    end if;
  end if;
  if jsonb_typeof(p_details -> 'native_languages') is distinct from 'array'
    or jsonb_typeof(p_details -> 'session_languages') is distinct from 'array'
    or jsonb_typeof(p_details -> 'other_languages') is distinct from 'array' then
    raise exception 'Invalid language selections.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_details -> 'native_languages') x where jsonb_typeof(x) <> 'string')
    or exists (select 1 from jsonb_array_elements(p_details -> 'session_languages') x where jsonb_typeof(x) <> 'string') then
    raise exception 'Selections must be text.' using errcode = '22023';
  end if;
  select array_agg(btrim(value)) into v_native from jsonb_array_elements_text(p_details -> 'native_languages');
  select array_agg(btrim(value)) into v_session from jsonb_array_elements_text(p_details -> 'session_languages');
  if coalesce(cardinality(v_native),0) not between 1 and 14
    or coalesce(cardinality(v_session),0) not between 1 and 28
    or exists (select 1 from unnest(v_native || v_session) l where l is null or length(l) not between 1 and 100)
    or cardinality(v_native) <> (select count(distinct lower(l)) from unnest(v_native) l)
    or cardinality(v_session) <> (select count(distinct lower(l)) from unnest(v_session) l) then
    raise exception 'Choose valid, distinct languages.' using errcode = '22023';
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
    select 1 from jsonb_array_elements(v_other) o where btrim(o ->> 'language') = l and o ->> 'level' in ('conversational','fluent','native'))) then
    raise exception 'Session languages must be native or Conversational or higher.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('language',btrim(o ->> 'language'),'level',o ->> 'level')),'[]'::jsonb)
    into v_other from jsonb_array_elements(v_other) o;
  insert into public.partner_profile_details(partner_id,location_status,visa_type,country,city,korea_city_other,native_languages,other_languages,
    session_languages,korean_level,weekly_session_capacity,partner_guide_acknowledged_at,completed_at)
  values(v_uid,v_location,v_visa,v_country,v_city,v_city_other,v_native,v_other,v_session,v_korean,v_capacity,now(),now())
  on conflict (partner_id) do update set location_status = excluded.location_status, visa_type = excluded.visa_type,
    country = case when v_has_location then excluded.country else case when excluded.location_status = partner_profile_details.location_status then partner_profile_details.country else null end end,
    city = case when v_has_location then excluded.city else case when excluded.location_status = partner_profile_details.location_status then partner_profile_details.city else null end end,
    korea_city_other = case when v_has_location then excluded.korea_city_other else case when excluded.location_status = partner_profile_details.location_status then partner_profile_details.korea_city_other else null end end,
    native_languages = excluded.native_languages, other_languages = excluded.other_languages,
    session_languages = excluded.session_languages, korean_level = excluded.korean_level,
    weekly_session_capacity = excluded.weekly_session_capacity,
    partner_guide_acknowledged_at = coalesce(partner_profile_details.partner_guide_acknowledged_at,excluded.partner_guide_acknowledged_at),
    completed_at = coalesce(partner_profile_details.completed_at,excluded.completed_at), updated_at = now()
  returning * into v_result;
  return to_jsonb(v_result);
end;
$$;

notify pgrst, 'reload schema';
commit;
