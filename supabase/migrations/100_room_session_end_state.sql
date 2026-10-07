-- SESSIONEND-01 approved standalone participant read RPC; no settlement changes.
-- Reuses existing authenticated RPC-authored session_events; no new table/column/policy or settlement writes.
begin;
do $preflight$
begin
  if to_regclass('public.session_events') is null or to_regclass('public.bookings') is null
    or to_regprocedure('public.log_session_event(uuid,uuid,text,jsonb)') is null then
    raise exception 'Missing canonical booking/session event contract';
  end if;
  if to_regprocedure('public.get_room_session_state(uuid)') is not null then
    raise exception 'get_room_session_state already exists: review rather than replace';
  end if;
end;$preflight$;
create function public.get_room_session_state(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  u uuid := auth.uid(); b public.bookings%rowtype; e public.session_events%rowtype;
  participant_role text; ended boolean;
begin
  if u is null then return jsonb_build_object('success',false,'code','unauthorized'); end if;
  select * into b from public.bookings where id=p_booking_id;
  if not found or (u is distinct from b.learner_id and u is distinct from b.partner_user_id) then
    return jsonb_build_object('success',false,'code','not_booking_participant');
  end if;
  participant_role := case when u=b.learner_id then 'learner' else 'partner' end;
  select * into e from public.session_events s
   where s.booking_id=b.id and s.event_type='session_ended'
     and s.payload->>'reason' in ('normal','personal','tech_issue')
     and ((s.actor_user_id=b.learner_id and s.payload->>'role'='learner')
       or (s.actor_user_id=b.partner_user_id and s.payload->>'role'='partner'))
   order by s.created_at,s.id limit 1;
  ended := e.id is not null or b.ended_at is not null or b.status='completed';
  return jsonb_build_object('success',true,'booking_id',b.id,'participant_id',u,'role',participant_role,
    'session_ended',ended,'ended_at',coalesce(e.created_at,b.ended_at),
    'source',case when e.id is not null then 'session_event' when ended then 'booking' else null end,
    'end_event_id',md5('dayo:session_ended:v1:'||b.id::text||':'||u::text)::uuid);
end;$$;
revoke all on function public.get_room_session_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_room_session_state(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
