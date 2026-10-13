-- Local review draft. Apply once only after explicit approval.
-- No credentials/audio/transcripts; no change to existing policies or reports.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $preflight$ begin
 if to_regclass('public.soniox_owner_pilot_allocations') is not null or
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='dayo_soniox_pilot_allocation') then
  raise exception 'Soniox pilot objects already exist: do not replay or reset';
 end if;
 if to_regprocedure('auth.uid()') is null or to_regclass('public.profiles') is null or
    not exists(select 1 from public.profiles where id='85d0f35c-2af3-4170-8cbe-5d40a7706d25' and role in ('user','learner')) or
    not exists(select 1 from public.profiles where id='1bc0eab5-9399-4da8-a90c-145ab0c4409d' and role='partner') then
  raise exception 'Verified owner identity/profile prerequisites missing';
 end if;
end $preflight$;

-- Exactly two fixed slots. No FK: deleting a profile cannot reset the cap or
-- block ordinary account deletion. A deleted profile cannot use the RPC.
create table public.soniox_owner_pilot_allocations (
 slot smallint primary key check(slot in (1,2)),
 owner_id uuid not null unique,
 participant_role text not null,
 state text not null default 'available' check(state in ('available','reserved','issued','failed')),
 reservation_id uuid unique,
 reserved_at timestamptz,
 finished_at timestamptz,
 credential_expires_at timestamptz,
 failure_code text check(failure_code in ('provider_timeout','provider_unavailable','invalid_grant','confirmation_unavailable')),
 check((slot=1 and owner_id='85d0f35c-2af3-4170-8cbe-5d40a7706d25' and participant_role='learner') or
       (slot=2 and owner_id='1bc0eab5-9399-4da8-a90c-145ab0c4409d' and participant_role='partner')),
 check((state='available' and reservation_id is null and reserved_at is null and finished_at is null and credential_expires_at is null and failure_code is null) or
       (state='reserved' and reservation_id is not null and reserved_at is not null and finished_at is null and credential_expires_at is null and failure_code is null) or
       (state='issued' and reservation_id is not null and reserved_at is not null and finished_at is not null and credential_expires_at is not null and failure_code is null) or
       (state='failed' and reservation_id is not null and reserved_at is not null and finished_at is not null and credential_expires_at is null and failure_code is not null))
);
alter table public.soniox_owner_pilot_allocations enable row level security;
-- Metadata-only, RPC-only. No direct client/service-role table privileges.
revoke all on public.soniox_owner_pilot_allocations from public,anon,authenticated,service_role;
insert into public.soniox_owner_pilot_allocations(slot,owner_id,participant_role) values
 (1,'85d0f35c-2af3-4170-8cbe-5d40a7706d25','learner'),
 (2,'1bc0eab5-9399-4da8-a90c-145ab0c4409d','partner');

create function public.dayo_soniox_pilot_allocation(
 p_action text, p_reservation_id uuid default null, p_outcome text default null,
 p_expires_at timestamptz default null, p_failure_code text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a public.soniox_owner_pilot_allocations%rowtype;
        changed integer:=0; t timestamptz:=clock_timestamp();
begin
 if u is null then raise exception 'pilot_owner_required' using errcode='42501'; end if;
 select * into a from public.soniox_owner_pilot_allocations where owner_id=u;
 if not found or not exists(select 1 from public.profiles p where p.id=u and
    ((a.participant_role='learner' and p.role in ('user','learner')) or
     (a.participant_role='partner' and p.role='partner'))) then
  raise exception 'pilot_owner_required' using errcode='42501';
 end if;
 if p_action='state' then
  if p_reservation_id is not null or p_outcome is not null or p_expires_at is not null or p_failure_code is not null then
   raise exception 'invalid_pilot_request' using errcode='22023';
  end if;
  return jsonb_build_object('role',a.participant_role,'state',a.state,'available',a.state='available');
 elsif p_action='reserve' then
  if p_reservation_id is null or p_outcome is not null or p_expires_at is not null or p_failure_code is not null then
   raise exception 'invalid_pilot_request' using errcode='22023';
  end if;
  -- UPDATE takes a row lock; the available predicate is rechecked after a
  -- concurrent winner commits. Only ONE caller receives reserved=true.
  update public.soniox_owner_pilot_allocations set state='reserved',
   reservation_id=p_reservation_id,reserved_at=t
   where owner_id=u and state='available' returning * into a;
  get diagnostics changed=row_count;
  if changed=1 then
   return jsonb_build_object('reserved',true,'reservation_id',a.reservation_id,'role',a.participant_role,'state',a.state);
  end if;
  return jsonb_build_object('reserved',false,'error','allocation_consumed');
 elsif p_action='finish' then
  if p_reservation_id is null or p_outcome is null or p_outcome not in ('issued','failed') or
     (p_outcome='issued' and (p_failure_code is not null or p_expires_at is null or p_expires_at<=t or p_expires_at>t+interval '65 seconds')) or
     (p_outcome='failed' and (p_expires_at is not null or p_failure_code is null or p_failure_code not in ('provider_timeout','provider_unavailable','invalid_grant','confirmation_unavailable'))) then
   raise exception 'invalid_pilot_request' using errcode='22023';
  end if;
  update public.soniox_owner_pilot_allocations set state=p_outcome,finished_at=t,
   credential_expires_at=p_expires_at,failure_code=p_failure_code
   where owner_id=u and reservation_id=p_reservation_id and state='reserved';
  get diagnostics changed=row_count;
  return jsonb_build_object('updated',changed=1);
 end if;
 -- No reset, delete, expiry refund, release, replacement or extra pilot ID.
 raise exception 'invalid_pilot_action' using errcode='22023';
end;$$;
revoke all on function public.dayo_soniox_pilot_allocation(text,uuid,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.dayo_soniox_pilot_allocation(text,uuid,text,timestamptz,text) to authenticated;
comment on table public.soniox_owner_pilot_allocations is
 'Two owner-only, permanently consumed pilot reservations. No keys, audio or transcripts. Never reseed to recover failed attempts.';
commit;
