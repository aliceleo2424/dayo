-- Soniox normal-room allocation draft. Not applied. No voice, transcript or credentials.
-- Existing bookings/profiles/pilot allocations and their policies are untouched.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $preflight$ begin
 if to_regclass('public.soniox_session_allocations') is not null or
    to_regprocedure('public.dayo_soniox_session_allocation(text,uuid,uuid,uuid,text,timestamptz,text,numeric)') is not null then
  raise exception 'soniox_session_objects_exist_do_not_replay';
 end if;
 if to_regclass('public.bookings') is null or to_regclass('public.profiles') is null or
    to_regprocedure('public.get_room_session_state(uuid)') is null then
  raise exception 'soniox_session_prerequisites_missing';
 end if;
end $preflight$;
create table public.soniox_session_allocations(
 id uuid primary key,
 booking_id uuid references public.bookings(id) on delete set null,
 actor_id uuid references public.profiles(id) on delete set null,
 participant_role text not null check(participant_role in ('learner','partner')),
 state text not null check(state in ('reserved','issued','failed')),
 max_seconds integer not null check(max_seconds between 1 and 1500),
 reserved_usd numeric(8,4) not null check(reserved_usd=0.1000),
 created_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 credential_expires_at timestamptz,
 failure_code text check(failure_code in ('provider_unavailable','provider_timeout','invalid_grant','confirmation_unavailable')),
 unique(booking_id,actor_id),
 check((state='reserved' and finished_at is null and credential_expires_at is null and failure_code is null) or
       (state='issued' and finished_at is not null and credential_expires_at is not null and failure_code is null) or
       (state='failed' and finished_at is not null and credential_expires_at is null and failure_code is not null))
);
create index soniox_session_budget_month on public.soniox_session_allocations(created_at);
alter table public.soniox_session_allocations enable row level security;
revoke all on public.soniox_session_allocations from public,anon,authenticated,service_role;
-- Server verifies the real JWT and get_room_session_state BEFORE this service-only RPC.
create function public.dayo_soniox_session_allocation(
 p_action text,p_booking_id uuid,p_actor_id uuid,p_request_id uuid default null,
 p_outcome text default null,p_expires_at timestamptz default null,
 p_failure_code text default null,p_budget_usd numeric default 2
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype;a public.soniox_session_allocations%rowtype;
 r text;t timestamptz:=clock_timestamp();used numeric;duration integer;
begin
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception 'booking_not_found' using errcode='42501';end if;
 if p_actor_id=b.learner_id then r:='learner';elsif p_actor_id=b.partner_user_id then r:='partner';
 else raise exception 'not_booking_participant' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_actor_id) then
  raise exception 'not_booking_participant' using errcode='42501';end if;
 if b.status<>'confirmed' or b.scheduled_at is null or t>=b.scheduled_at+interval '25 minutes' then
  raise exception 'session_not_active' using errcode='42501';end if;
 if p_action='state' then
  if p_request_id is not null or p_outcome is not null or p_expires_at is not null or p_failure_code is not null then
   raise exception 'invalid_request';end if;
  select * into a from public.soniox_session_allocations where booking_id=p_booking_id and actor_id=p_actor_id;
  return jsonb_build_object('role',r,'available',not found,'state',coalesce(a.state,'available'));
 elsif p_action='reserve' then
  if p_request_id is null or p_outcome is not null or p_expires_at is not null or p_failure_code is not null or
     p_budget_usd is null or p_budget_usd<=0 or p_budget_usd>2 then raise exception 'invalid_request';end if;
  if t<b.scheduled_at then raise exception 'session_not_started' using errcode='42501';end if;
  -- One lock covers all workers/users and the whole fixed $2 project budget.
  perform pg_advisory_xact_lock(hashtextextended('dayo-soniox-monthly-budget',0));
  select * into a from public.soniox_session_allocations where booking_id=p_booking_id and actor_id=p_actor_id;
  if found then return jsonb_build_object('reserved',false,'error','session_allocation_used','state',a.state);end if;
  select coalesce(sum(reserved_usd),0) into used from public.soniox_session_allocations
   where created_at>=date_trunc('month',t at time zone 'UTC') at time zone 'UTC';
  if used+0.1000>p_budget_usd then return jsonb_build_object('reserved',false,'error','project_budget_exhausted');end if;
  duration:=least(1500,floor(extract(epoch from b.scheduled_at+interval '25 minutes'-t))::integer);
  if duration<1 then raise exception 'session_not_active' using errcode='42501';end if;
  insert into public.soniox_session_allocations(id,booking_id,actor_id,participant_role,state,max_seconds,reserved_usd,created_at)
   values(p_request_id,p_booking_id,p_actor_id,r,'reserved',duration,0.1000,t);
  return jsonb_build_object('reserved',true,'reservation_id',p_request_id,'role',r,'max_seconds',duration,'state','reserved');
 elsif p_action='finish' then
  if p_request_id is null or p_outcome is null or p_outcome not in ('issued','failed') or
   (p_outcome='issued' and (p_failure_code is not null or p_expires_at is null or p_expires_at<=t or p_expires_at>t+interval '65 seconds')) or
   (p_outcome='failed' and (p_expires_at is not null or p_failure_code is null or p_failure_code not in ('provider_unavailable','provider_timeout','invalid_grant','confirmation_unavailable'))) then
   raise exception 'invalid_request';end if;
  update public.soniox_session_allocations set state=p_outcome,finished_at=t,credential_expires_at=p_expires_at,failure_code=p_failure_code
   where id=p_request_id and booking_id=p_booking_id and actor_id=p_actor_id and state='reserved';
  return jsonb_build_object('updated',found);
 end if;
 raise exception 'invalid_request';
end;$$;
revoke all on function public.dayo_soniox_session_allocation(text,uuid,uuid,uuid,text,timestamptz,text,numeric) from public,anon,authenticated;
grant execute on function public.dayo_soniox_session_allocation(text,uuid,uuid,uuid,text,timestamptz,text,numeric) to service_role;
comment on table public.soniox_session_allocations is 'Per-booking Soniox issuance and conservative monthly budget reservations. No tokens/audio/transcripts. Failed grants never refund reserved budget.';
commit;