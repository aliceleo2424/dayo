-- Alpha eligibility: approved partner role + supported language + concrete slot.
-- Profile session languages are authoritative when non-empty; legacy capabilities
-- are used only when the Profile has no languages. No stored data is rewritten.
-- Apply only after separate production review. 091/092 are reserved elsewhere.
begin;

do $preflight$
begin
  if to_regprocedure('public.list_public_partner_profiles()') is null
    or to_regprocedure('public.list_matching_partner_profiles(text,text)') is null
    or to_regprocedure('public.capture_booking_matching_snapshot()') is null
    or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='partner_profile_details' and column_name='session_languages' and udt_name='_text') then
    raise exception 'alpha_partner_language_contract_missing';
  end if;
end;
$preflight$;

-- Only the currently active booking catalog. Pending languages stay unavailable.
create function public.dayo_canonical_booking_languages(p_languages text[])
returns text[] language sql immutable set search_path='' as $$
  select coalesce(array_agg(language order by first_seen),'{}'::text[])
  from (
    select language,min(position) as first_seen
    from (
      select position,case lower(btrim(value))
        when 'en' then 'en' when 'english' then 'en'
        when 'es' then 'es' when 'spanish' then 'es'
        when 'fr' then 'fr' when 'french' then 'fr'
        when 'ko' then 'ko' when 'korean' then 'ko'
        else null end as language
      from unnest(p_languages) with ordinality as source(value,position)
    ) canonical where language is not null group by language
  ) unique_languages;
$$;

-- Internal resolver shared by public list, matching and confirmation. It exposes
-- no private profile fields and is not directly callable by browser clients.
create function public.dayo_partner_booking_languages(p_partner_id uuid)
returns text[] language sql stable security definer set search_path='' as $$
  select coalesce((
    select public.dayo_canonical_booking_languages(case
      when coalesce(cardinality(d.session_languages),0)>0 then d.session_languages
      else c.conversation_languages end)
    from public.profiles p
    left join public.partner_profile_details d on d.partner_id=p.id
    left join public.partner_capabilities c on c.partner_id=p.id
    where p.id=p_partner_id and p.role='partner'
  ),'{}'::text[]);
$$;
revoke all on function public.dayo_canonical_booking_languages(text[]) from public,anon,authenticated,service_role;
revoke all on function public.dayo_partner_booking_languages(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.list_public_partner_profiles()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'id', p.id,
    'user_id', p.id,
    'nickname', case
      when nullif(pg_catalog.btrim(p.nickname), '') is null
        or pg_catalog.strpos(p.nickname, '@') > 0
        or pg_catalog.strpos(p.nickname, '+') > 0
        or p.nickname ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (p.email is not null and pg_catalog.lower(pg_catalog.btrim(p.nickname)) =
            pg_catalog.split_part(pg_catalog.lower(p.email), '@', 1))
      then 'DayO Partner'
      else pg_catalog.btrim(p.nickname)
    end,
    'avatar_url', pg_catalog.to_jsonb(p)->>'avatar_url',
    'bio', pg_catalog.to_jsonb(p)->>'bio',
    'conversation_languages', public.dayo_partner_booking_languages(p.id),
    'korean_support_level', c.korean_support_level
  )
  from public.profiles p
  left join public.partner_capabilities c on c.partner_id = p.id
  where auth.uid() is not null
    and p.role = 'partner';
$function$;

create or replace function public.list_matching_partner_profiles(p_language text,p_korean_support_preference text)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_language is null or p_language not in ('en','es','fr','ko') or p_korean_support_preference is null or p_korean_support_preference not in ('required','any') then
    raise exception 'Choose language and Korean support.' using errcode='22023';
  end if;
  -- Retain the existing RPC input contract. Help and preferences are not filters.
  return query select p.value || jsonb_build_object('conversation_preferences',d.conversation_preferences)
    from public.list_public_partner_profiles() p(value)
    left join public.partner_profile_details d on d.partner_id=(p.value->>'id')::uuid
    where p.value->'conversation_languages' ? p_language;
end $$;

create or replace function public.capture_booking_matching_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare pref jsonb; languages text[];
begin
  if tg_op='INSERT' then
    -- Never trust a client-supplied score/snapshot (including privileged entry paths).
    new.matching_snapshot:=null;
    return new;
  end if;
  if new.matching_snapshot is distinct from old.matching_snapshot then
    raise exception 'Matching snapshot is server-owned.' using errcode='42501';
  end if;
  if old.matching_snapshot is not null and (new.conversation_brief is distinct from old.conversation_brief or new.language is distinct from old.language or new.learner_id is distinct from old.learner_id or new.partner_id is distinct from old.partner_id) then
    raise exception 'Confirmed matching choices are immutable.' using errcode='42501';
  end if;
  if old.status='pending' and new.status='confirmed' and new.conversation_brief ? 'schema_version' then
    if auth.uid() is distinct from new.learner_id or not new.ticket_deducted or
       not coalesce(public.dayo_booking_preferences_v1_valid(new.conversation_brief),false) then
      raise exception 'Canonical participant confirmation required.' using errcode='42501';
    end if;
    if new.language is null or new.language not in ('en','es','fr','ko') or not exists(select 1 from public.profiles where id=new.partner_id and role='partner' for share) then
      raise exception 'Partner no longer eligible.' using errcode='23514';
    end if;
    -- Lock existing language sources through confirmation, without changing them.
    perform 1 from public.partner_profile_details where partner_id=new.partner_id for share;
    perform 1 from public.partner_capabilities where partner_id=new.partner_id for share;
    languages:=public.dayo_partner_booking_languages(new.partner_id);
    if not coalesce(new.language=any(languages),false) then
      raise exception 'Partner language mismatch.' using errcode='23514';
    end if;
    -- Alpha: Korean support remains in conversation_brief/matching_snapshot,
    -- but never excludes a language-and-slot eligible Partner.
    select conversation_preferences into pref from public.partner_profile_details where partner_id=new.partner_id for share;
    new.matching_snapshot:=public.dayo_matching_snapshot_v1(new.language,new.conversation_brief,pref);
  end if;
  return new;
end $$;

-- CREATE OR REPLACE preserves existing public RPC grants and trigger attachment.
-- Availability, cutoff, ticket deduction, collision guards and snapshot immutability
-- stay in their existing functions/triggers, unchanged.
notify pgrst,'reload schema';
commit;
