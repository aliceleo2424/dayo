-- Snapshot Smart Booking choices and expose a minimal brief only to the
-- partner assigned to a confirmed booking. Existing bookings remain NULL.
begin;

create or replace function public.dayo_valid_conversation_brief(p_brief jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_purpose text;
  v_interest jsonb;
  v_interest_id text;
  v_seen text[] := array[]::text[];
begin
  if p_brief is null then
    return true;
  end if;
  if pg_catalog.jsonb_typeof(p_brief) <> 'object'
     or pg_catalog.octet_length(p_brief::text) > 2048 then
    return false;
  end if;

  for v_key in select pg_catalog.jsonb_object_keys(p_brief) loop
    if v_key not in ('purposes', 'interests', 'chat_style', 'chat_request', 'partner_preference') then
      return false;
    end if;
  end loop;

  if p_brief ? 'purposes' then
    if pg_catalog.jsonb_typeof(p_brief->'purposes') <> 'array' then
      return false;
    end if;
    if pg_catalog.jsonb_array_length(p_brief->'purposes') < 1
       or pg_catalog.jsonb_array_length(p_brief->'purposes') > 4 then
      return false;
    end if;
    for v_purpose in select pg_catalog.jsonb_array_elements_text(p_brief->'purposes') loop
      if v_purpose is null
         or v_purpose not in ('travel', 'opic', 'abroad', 'casual')
         or v_purpose = any(v_seen) then
        return false;
      end if;
      v_seen := pg_catalog.array_append(v_seen, v_purpose);
    end loop;
  end if;

  if p_brief ? 'interests' then
    if pg_catalog.jsonb_typeof(p_brief->'interests') <> 'array' then
      return false;
    end if;
    if pg_catalog.jsonb_array_length(p_brief->'interests') > 4 then
      return false;
    end if;
    v_seen := array[]::text[];
    for v_interest in select pg_catalog.jsonb_array_elements(p_brief->'interests') loop
      if pg_catalog.jsonb_typeof(v_interest) <> 'string' then
        return false;
      end if;
      v_interest_id := v_interest #>> '{}';
      if v_interest_id not in (
        'drama', 'movies', 'youtube', 'music', 'travel', 'food_cafe',
        'exercise', 'games', 'fashion_beauty', 'pets', 'books_webtoon', 'work_school'
      ) or v_interest_id = any(v_seen) then
        return false;
      end if;
      v_seen := pg_catalog.array_append(v_seen, v_interest_id);
    end loop;
  end if;
  if p_brief ? 'chat_style'
     and p_brief->'chat_style' <> 'null'::jsonb
     and (pg_catalog.jsonb_typeof(p_brief->'chat_style') <> 'string'
          or p_brief->>'chat_style' not in ('casual', 'correct', 'interview')) then
    return false;
  end if;
  if p_brief ? 'chat_request'
     and p_brief->'chat_request' <> 'null'::jsonb
     and (pg_catalog.jsonb_typeof(p_brief->'chat_request') <> 'string'
          or p_brief->>'chat_request' not in ('praise', 'gentle', 'encourage')) then
    return false;
  end if;
  if p_brief ? 'partner_preference'
     and p_brief->'partner_preference' <> 'null'::jsonb
     and (pg_catalog.jsonb_typeof(p_brief->'partner_preference') <> 'string'
          or p_brief->>'partner_preference' not in ('slow', 'fast', 'correct', 'korean')) then
    return false;
  end if;
  return true;
end;
$$;

alter table public.bookings
  add column if not exists conversation_brief jsonb;

alter table public.bookings
  drop constraint if exists bookings_conversation_brief_valid;

alter table public.bookings
  add constraint bookings_conversation_brief_valid
  check (public.dayo_valid_conversation_brief(conversation_brief));

grant insert (conversation_brief)
  on table public.bookings
  to authenticated;

create or replace function public.get_partner_booking_brief(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner_id uuid;
  v_language text;
  v_brief jsonb;
  v_nickname text;
  v_email text;
begin
  if auth.uid() is null or p_booking_id is null then
    return null;
  end if;

  select b.learner_id, b.language, b.conversation_brief
    into v_learner_id, v_language, v_brief
  from public.bookings b
  where b.id = p_booking_id
    and b.partner_user_id = auth.uid()
    and b.status = 'confirmed';

  if not found then
    return null;
  end if;

  select p.nickname, p.email
    into v_nickname, v_email
  from public.profiles p
  where p.id = v_learner_id or p.user_id = v_learner_id
  order by case when p.id = v_learner_id then 0 else 1 end
  limit 1;

  v_nickname := nullif(pg_catalog.btrim(v_nickname), '');
  if v_nickname is null
     or pg_catalog.strpos(v_nickname, '@') > 0
     or v_nickname ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (v_email is not null
         and pg_catalog.lower(v_nickname) = pg_catalog.split_part(pg_catalog.lower(v_email), '@', 1)) then
    v_nickname := 'DayO User';
  end if;

  return pg_catalog.jsonb_build_object(
    'learner_display_name', v_nickname,
    'language', v_language,
    'conversation_brief', v_brief
  );
end;
$$;

revoke all on function public.get_partner_booking_brief(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_booking_brief(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
