-- Soniox: owner-approved reconnection (max 3 credentials per participant per booking)
-- and a content-free stop report so the next failure can be diagnosed.
-- No voice, transcript or credential is stored. Budget ledger semantics are unchanged:
-- every reservation still reserves $0.10 against the fixed monthly cap.
-- Apply once after 113. Re-running is refused by the preflight.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $preflight$ begin
 if to_regclass('public.soniox_session_allocations') is null or
    to_regprocedure('public.dayo_soniox_session_allocation(text,uuid,uuid,uuid,text,timestamptz,text,numeric)') is null then
  raise exception 'soniox_113_missing';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public'
   and table_name='soniox_session_allocations' and column_name='client_stop_code') then
  raise exception 'soniox_115_already_applied_do_not_replay';
 end if;
end $preflight$;

-- Drop only the one-per-participant unique constraint from 113.
do $drop_unique$ declare c text; begin
 select con.conname into c from pg_constraint con
  where con.conrelid='public.soniox_session_allocations'::regclass and con.contype='u'
    and (select array_agg(att.attname::text order by att.attname) from unnest(con.conkey) k
         join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k)=array['actor_id','booking_id'];
 if c is null then raise exception 'soniox_unique_constraint_not_found'; end if;
 execute format('alter table public.soniox_session_allocations drop constraint %I',c);
end $drop_unique$;
create index soniox_session_allocations_booking_actor on public.soniox_session_allocations(booking_id,actor_id);

alter table public.soniox_session_allocations
 add column client_stop_code text check(client_stop_code ~ '^[a-z0-9_]{1,80}$'),
 add column client_audio_frames integer check(client_audio_frames>=0),
 add column client_nonsilent_frames integer check(client_nonsilent_frames>=0),
 add column client_finals integer check(client_finals>=0),
 add column client_messages integer check(client_messages>=0),
 add column client_capture_mode text check(client_capture_mode in ('recorder','worklet')),
 add column client_reported_at timestamptz;

create or replace function public.dayo_soniox_session_allocation(
 p_action text,p_booking_id uuid,p_actor_id uuid,p_request_id uuid default null,
 p_outcome text default null,p_expires_at timestamptz default null,
 p_failure_code text default null,p_budget_usd numeric default 2
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype;a public.soniox_session_allocations%rowtype;
 r text;t timestamptz:=clock_timestamp();used numeric;duration integer;n integer;rep jsonb;
 max_starts constant integer:=3;
begin
 select * into b from public.bookings where id=p_booking_id;
 if not found then raise exception 'booking_not_found' using errcode='42501';end if;
 if p_actor_id=b.learner_id then r:='learner';elsif p_actor_id=b.partner_user_id then r:='partner';
 else raise exception 'not_booking_participant' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_actor_id) then
  raise exception 'not_booking_participant' using errcode='42501';end if;
 -- Content-free status report (latest wins): allowed after the session window so the final stop is kept.
 if p_action='report' then
  if p_request_id is null or p_expires_at is not null or p_failure_code is null or
     p_failure_code !~ '^[a-z0-9_]{1,80}$' or p_outcome is null or length(p_outcome)>200 then
   raise exception 'invalid_request';end if;
  begin rep:=p_outcome::jsonb; exception when others then raise exception 'invalid_request'; end;
  update public.soniox_session_allocations set client_stop_code=p_failure_code,
   client_audio_frames=greatest(0,least(2000000000,coalesce((rep->>'audioFrames')::bigint,0)))::integer,
   client_nonsilent_frames=greatest(0,least(2000000000,coalesce((rep->>'nonSilentFrames')::bigint,0)))::integer,
   client_finals=greatest(0,least(2000000000,coalesce((rep->>'finals')::bigint,0)))::integer,
   client_messages=greatest(0,least(2000000000,coalesce((rep->>'messages')::bigint,0)))::integer,
   client_capture_mode=case when rep->>'mode' in ('recorder','worklet') then rep->>'mode' else null end,
   client_reported_at=t
   where id=p_request_id and booking_id=p_booking_id and actor_id=p_actor_id and state='issued';
  return jsonb_build_object('updated',found);
 end if;
 if b.status<>'confirmed' or b.scheduled_at is null or t>=b.scheduled_at+interval '25 minutes' then
  raise exception 'session_not_active' using errcode='42501';end if;
 if p_action='state' then
  if p_request_id is not null or p_outcome is not null or p_expires_at is not null or p_failure_code is not null then
   raise exception 'invalid_request';end if;
  select count(*) into n from public.soniox_session_allocations where booking_id=p_booking_id and actor_id=p_actor_id;
  select * into a from public.soniox_session_allocations where booking_id=p_booking_id and actor_id=p_actor_id order by created_at desc limit 1;
  return jsonb_build_object('role',r,'available',n<max_starts,'state',case when n<max_starts then 'available' else coalesce(a.state,'available') end,'attemptsLeft',greatest(0,max_starts-n));
 elsif p_action='reserve' then
  if p_request_id is null or p_outcome is not null or p_expires_at is not null or p_failure_code is not null or
     p_budget_usd is null or p_budget_usd<=0 or p_budget_usd>2 then raise exception 'invalid_request';end if;
  if t<b.scheduled_at then raise exception 'session_not_started' using errcode='42501';end if;
  -- One lock covers all workers/users and the whole fixed $2 project budget.
  perform pg_advisory_xact_lock(hashtextextended('dayo-soniox-monthly-budget',0));
  select count(*) into n from public.soniox_session_allocations where booking_id=p_booking_id and actor_id=p_actor_id;
  if n>=max_starts then return jsonb_build_object('reserved',false,'error','session_allocation_used','state','exhausted');end if;
  -- A credential being minted right now (e.g. two tabs) must not double-spend.
  if exists(select 1 from public.soniox_session_allocations where booking_id=p_booking_id and actor_id=p_actor_id
     and state='reserved' and created_at>t-interval '30 seconds') then
   return jsonb_build_object('reserved',false,'error','allocation_in_progress','state','reserved');end if;
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
comment on table public.soniox_session_allocations is 'Per-booking Soniox issuance (max 3 per participant per booking) and conservative monthly budget reservations. Content-free client stop reports. No tokens/audio/transcripts. Failed grants never refund reserved budget.';
commit;
