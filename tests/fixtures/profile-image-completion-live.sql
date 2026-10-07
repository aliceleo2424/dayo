CREATE OR REPLACE FUNCTION public.save_partner_profile_completion(p_details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_location text; v_visa text; v_korean text; v_capacity text;
  v_country text; v_city text; v_city_other text; v_has_location boolean;
  v_native text[]; v_session text[];
  v_other jsonb; v_entry jsonb; v_language text; v_level text;
  v_seen text[] := '{}'::text[];
  v_result public.partner_profile_details;
  v_existing public.partner_profile_details;
begin
  if v_uid is null then raise exception 'Partner access required.' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = v_uid and role = 'partner' for update;
  if not found then raise exception 'Partner access required.' using errcode = '42501'; end if;
  -- Serialize per partner before checking stored, server-owned values.
  if p_details is null or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'Invalid profile details.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_details) k where k not in (
    'location_status','visa_type','country','city','korea_city_other',
    'native_languages','other_languages','session_languages','korean_level',
    'weekly_session_capacity','guide_acknowledged')) then
    raise exception 'Unsupported or protected profile field.' using errcode = '42501';
  end if;
  select * into v_existing from public.partner_profile_details where partner_id=v_uid for update;
  if v_existing.visa_type is not null then
    if (p_details ? 'visa_type' and (p_details->>'visa_type') is distinct from v_existing.visa_type)
      or (p_details ? 'location_status' and (p_details->>'location_status') is distinct from v_existing.location_status) then
      raise exception 'Visa and location type cannot be changed by self-edit.' using errcode = '42501';
    end if;
    -- Initial onboarding may declare visa; once stored it is not client-editable.
    p_details := p_details || jsonb_build_object('visa_type',v_existing.visa_type,'location_status',v_existing.location_status);
  end if;
  if v_existing.partner_guide_acknowledged_at is not null and not (p_details ? 'guide_acknowledged') then
    p_details := p_details || jsonb_build_object('guide_acknowledged',true);
  end if;
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
$function$
;
