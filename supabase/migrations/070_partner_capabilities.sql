-- Admin-verified partner conversation capabilities for a future Smart Booking rollout.
-- Do not infer or backfill capabilities from free-text profile fields.
begin;

create table public.partner_capabilities (
  partner_id uuid primary key references public.profiles(id) on delete restrict,
  conversation_languages text[] not null default '{}'::text[],
  korean_support_level text,
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint partner_capabilities_languages_valid check (
    pg_catalog.cardinality(conversation_languages) <= 4
    and pg_catalog.array_position(conversation_languages, null) is null
    and conversation_languages <@ array['en', 'es', 'fr', 'ko']::text[]
  ),
  constraint partner_capabilities_korean_support_valid check (
    korean_support_level is null
    or korean_support_level in ('none', 'basic', 'conversational', 'fluent')
  )
);

create index partner_capabilities_korean_support_idx
  on public.partner_capabilities (korean_support_level);

alter table public.partner_capabilities enable row level security;
-- No client table policies. Admin RPCs below are the only browser read/write path.
revoke all on table public.partner_capabilities from public, anon, authenticated;

create function public.get_admin_partner_capabilities(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_languages text[];
  v_level text;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_partner_id is null then
    raise exception 'A partner is required.' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = p_partner_id and role = 'partner';
  if not found then
    raise exception 'Partner profile not found.' using errcode = 'P0002';
  end if;

  select c.conversation_languages, c.korean_support_level
    into v_languages, v_level
    from public.partner_capabilities c
   where c.partner_id = p_partner_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'conversation_languages', coalesce(v_languages, '{}'::text[]),
    'korean_support_level', v_level,
    'configured', pg_catalog.cardinality(coalesce(v_languages, '{}'::text[])) > 0
      and v_level is not null
  );
end;
$$;

create function public.admin_set_partner_capabilities(
  p_partner_id uuid,
  p_conversation_languages text[],
  p_korean_support_level text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_languages text[];
begin
  if v_actor_id is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_partner_id is null then
    raise exception 'A partner is required.' using errcode = '22023';
  end if;
  if p_conversation_languages is null
     or pg_catalog.cardinality(p_conversation_languages) = 0
     or pg_catalog.cardinality(p_conversation_languages) > 4
     or pg_catalog.array_position(p_conversation_languages, null) is not null
     or not (p_conversation_languages <@ array['en', 'es', 'fr', 'ko']::text[]) then
    raise exception 'Invalid conversation languages.' using errcode = '22023';
  end if;
  if p_korean_support_level is not null
     and p_korean_support_level not in ('none', 'basic', 'conversational', 'fluent') then
    raise exception 'Invalid Korean support level.' using errcode = '22023';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.unnest(p_conversation_languages) as u(language_code))
     <> (select pg_catalog.count(distinct u.language_code)
           from pg_catalog.unnest(p_conversation_languages) as u(language_code)) then
    raise exception 'Duplicate conversation language.' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_partner_id and role = 'partner' for update;
  if not found then
    raise exception 'Partner profile not found.' using errcode = 'P0002';
  end if;

  v_languages := p_conversation_languages;
  insert into public.partner_capabilities (
    partner_id, conversation_languages, korean_support_level, updated_by
  ) values (
    p_partner_id, v_languages, p_korean_support_level, v_actor_id
  )
  on conflict (partner_id) do update
    set conversation_languages = excluded.conversation_languages,
        korean_support_level = excluded.korean_support_level,
        updated_at = pg_catalog.now(),
        updated_by = excluded.updated_by;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'conversation_languages', v_languages,
    'korean_support_level', p_korean_support_level,
    'configured', p_korean_support_level is not null
  );
end;
$$;

-- Keep every existing 063 field and identity behavior; add only approved
-- booking-filter data. Missing capability rows remain visibly unconfigured.
create or replace function public.list_public_partner_profiles()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    'conversation_languages', c.conversation_languages,
    'korean_support_level', c.korean_support_level
  )
  from public.profiles p
  left join public.partner_capabilities c on c.partner_id = p.id
  where auth.uid() is not null
    and p.role = 'partner';
$$;

revoke all on function public.get_admin_partner_capabilities(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_set_partner_capabilities(uuid, text[], text)
  from public, anon, authenticated;
revoke all on function public.list_public_partner_profiles()
  from public, anon, authenticated;

grant execute on function public.get_admin_partner_capabilities(uuid)
  to authenticated;
grant execute on function public.admin_set_partner_capabilities(uuid, text[], text)
  to authenticated;
grant execute on function public.list_public_partner_profiles()
  to authenticated;

notify pgrst, 'reload schema';
commit;
