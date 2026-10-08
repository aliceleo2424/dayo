-- Talk Card context/presentation only. Production baseline audited 2026-10-08.
-- No table, policy, booking, settlement, or existing function changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
  if md5(pg_get_functiondef('public.get_room_session_state(uuid)'::regprocedure)) <> 'ce32926ba5402738ecd0c16e0707cd26' or
     md5(pg_get_functiondef('public.save_conversation_partner_feedback(uuid,text[],text[],text)'::regprocedure)) <> '92dde179702e9e7974b673b23a41f765' then
    raise exception 'Expected production 100/102 baseline differs';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.session_events'::regclass) or
     (select relacl::text from pg_class where oid='public.session_events'::regclass) <> '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}' or
     (select count(*) from pg_policies where schemaname='public' and tablename='session_events') <> 1 or
     not exists(select 1 from pg_policies where schemaname='public' and tablename='session_events' and policyname='session_events_select_admin'
       and cmd='SELECT' and roles=array['authenticated']::name[] and qual='dayo_is_admin()') then
    raise exception 'Session event RLS/ACL baseline differs';
  end if;
  if md5(pg_get_functiondef('public.log_session_event(uuid,uuid,text,jsonb)'::regprocedure)) <> 'b3a2576d6e28649cef96aef40f64e452' then
    raise exception 'Talk Card logger baseline differs';
  end if;
  if to_regprocedure('public.get_talk_card_context(uuid)') is not null or
     to_regprocedure('public.present_talk_card(uuid,uuid,jsonb)') is not null then
    raise exception 'Talk Card RPC already exists: do not replay';
  end if;
end $$;

create function public.get_talk_card_context(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; u uuid:=auth.uid(); last_card jsonb; used_cards jsonb; recent_cards jsonb; interests jsonb;
begin
  if u is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into b from public.bookings where id=p_booking_id;
  if not found or (u is distinct from b.learner_id and u is distinct from b.partner_user_id) then
    raise exception 'not_booking_participant' using errcode='42501';
  end if;
  -- Exact immutable booking snapshot only. No current profile fallback.
  select coalesce(jsonb_agg(k),'[]'::jsonb) into interests
  from jsonb_array_elements_text(case when b.matching_snapshot->>'scoring_version'='1'
    and b.matching_snapshot->'user'->>'schema_version'='1'
    and jsonb_typeof(b.matching_snapshot->'user'->'interests')='array'
    then b.matching_snapshot->'user'->'interests' else '[]'::jsonb end) k
  where k in ('drama','movies','youtube','music','travel','food_cafe','exercise','games','fashion_beauty','pets','books_webtoon','work_school');
  -- Legacy hidden initial renders are not reliable presentation evidence.
  select jsonb_build_object('version',2,'presented',true,'card_id',e.payload->>'card_id',
    'category',e.payload->>'category','group',e.payload->>'group','topic_keys',e.payload->'topic_keys',
    'selection_source',e.payload->>'selection_source','pool_source',e.payload->>'pool_source',
    'order',e.payload->'order','updated_at',e.created_at,'event_id',e.id) into last_card
  from public.session_events e where e.booking_id=b.id and e.actor_user_id=b.partner_user_id
    and e.event_type='talk_card_shown' and e.payload->>'version'='2' and e.payload->>'presented'='true'
  order by case when e.payload->>'order' ~ '^[1-9][0-9]{0,4}$' then (e.payload->>'order')::int else 0 end desc,
    e.created_at desc,e.id desc limit 1;
  select coalesce(jsonb_agg(distinct e.payload->>'card_id'),'[]'::jsonb) into used_cards
  from public.session_events e where e.booking_id=b.id and e.actor_user_id=b.partner_user_id
    and e.event_type='talk_card_shown' and e.payload->>'version'='2' and e.payload->>'presented'='true';
  with previous as (
    select id,partner_user_id from public.bookings
    where learner_id=b.learner_id and id<>b.id and status='completed'
      and not coalesce(is_test_session,false) and scheduled_at<b.scheduled_at
    order by coalesce(ended_at,scheduled_at) desc,id desc limit 3
  ) select coalesce(jsonb_agg(distinct e.payload->>'card_id'),'[]'::jsonb) into recent_cards
  from previous p join public.session_events e on e.booking_id=p.id and e.actor_user_id=p.partner_user_id
  where e.event_type='talk_card_shown' and e.payload->>'version'='2' and e.payload->>'presented'='true';
  return jsonb_build_object('interests',interests,'current',last_card,'used_card_ids',used_cards,'recent_card_ids',recent_cards);
end $$;

create function public.present_talk_card(p_event_id uuid,p_booking_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; u uuid:=auth.uid(); keys jsonb; inserted integer; safe_payload jsonb;
begin
  if u is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into b from public.bookings where id=p_booking_id;
  if not found or u is distinct from b.partner_user_id then
    raise exception 'not_booking_partner' using errcode='42501';
  end if;
  if b.status<>'confirmed' or exists(select 1 from public.session_events e where e.booking_id=b.id and e.event_type='session_ended') then
    raise exception 'session_not_live' using errcode='22023';
  end if;
  if p_event_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096
    or coalesce(p_payload->>'card_id','') !~ '^[a-z][a-z0-9-]{1,119}$'
    or coalesce(p_payload->>'category','') not in ('daily','taste','korea-life','korea-trip','world-trip','culture','food','balance')
    or coalesce(p_payload->>'group','') not in ('auto','daily','travel','food','balance')
    or coalesce(p_payload->>'selection_source','') not in ('primary','related','wildcard','manual','fallback')
    or coalesce(p_payload->>'order','') !~ '^[1-9][0-9]{0,4}$'
    or jsonb_typeof(p_payload->'topic_keys') is distinct from 'array' then
    raise exception 'invalid_talk_card_payload' using errcode='22023';
  end if;
  if jsonb_array_length(p_payload->'topic_keys')>4 or exists (
    select 1 from jsonb_array_elements(p_payload->'topic_keys') k where jsonb_typeof(k)<>'string' or (k#>>'{}') not in
      ('drama','movies','youtube','music','travel','food_cafe','exercise','games','fashion_beauty','pets','books_webtoon','work_school')
  ) then raise exception 'invalid_topic_keys' using errcode='22023'; end if;
  select coalesce(jsonb_agg(distinct k order by k),'[]'::jsonb) into keys from jsonb_array_elements(p_payload->'topic_keys') k;
  safe_payload:=jsonb_build_object('version',2,'presented',true,
    'card_id',p_payload->>'card_id','category',p_payload->>'category','group',p_payload->>'group',
    'topic_keys',keys,'selection_source',p_payload->>'selection_source','order',(p_payload->>'order')::integer,
    'pool_source',case when p_payload->>'pool_source' in ('primary','related','wildcard') then p_payload->>'pool_source' else 'wildcard' end,
    'manual_category',p_payload->>'group'<>'auto','balance_game',p_payload->>'category'='balance');
  insert into public.session_events(id,booking_id,event_type,actor_user_id,payload)
  values(p_event_id,b.id,'talk_card_shown',u,safe_payload) on conflict(id) do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 and not exists(select 1 from public.session_events e where e.id=p_event_id and e.booking_id=b.id
    and e.actor_user_id=u and e.event_type='talk_card_shown' and e.payload=safe_payload) then
    raise exception 'event_identity_conflict' using errcode='22023';
  end if;
  return jsonb_build_object('success',true,'inserted',inserted=1);
end $$;

revoke all on function public.get_talk_card_context(uuid) from public,anon,authenticated,service_role;
revoke all on function public.present_talk_card(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_talk_card_context(uuid) to authenticated;
grant execute on function public.present_talk_card(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
