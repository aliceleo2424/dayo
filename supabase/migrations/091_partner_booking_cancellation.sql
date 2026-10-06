-- 091: Partner cancellation, immutable lifecycle history and future reward offsets.
-- Apply this migration alone after exact live contract preflight.
-- Approved policy: 6000P debt, offset only against FUTURE normal session rewards.
-- Existing point balances are never debited and never become negative.
begin;

do $preflight$
begin
  if exists (
    select 1 from (values
      ('cancel_my_booking','e7a7c6e9e6b711a84409d7e912fa74e5','{postgres=X/postgres,authenticated=X/postgres}'),
      ('claim_booking_notification','be49b1fe8a2df7b1e2cc6df38143c506','{postgres=X/postgres,service_role=X/postgres}'),
      ('complete_session_and_reward_partner','f1b86a29078a2a4ca4b281de3e259091','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
      ('enqueue_booking_notification','eec10c377c75fea77852186adda41beb','{postgres=X/postgres}'),
      ('refund_booking_ticket','c920d130cde7434a9c0d7fddf72fcebe','{postgres=X/postgres}')
    ) expected(name,hash,acl)
    left join pg_catalog.pg_proc p on p.proname=expected.name and p.pronamespace='public'::regnamespace
    where p.oid is null or md5(pg_get_functiondef(p.oid)) is distinct from expected.hash
      or pg_get_userbyid(p.proowner)<>'postgres' or not p.prosecdef
      or p.proacl::text is distinct from expected.acl
      or p.proconfig is distinct from array['search_path=""']::text[]
  ) then raise exception 'Live cancellation/reward/outbox contract drift; repeat read-only preflight'; end if;
  if to_regprocedure('public.cancel_my_booking(uuid)') is null
    or to_regprocedure('public.refresh_ticket_balance_cache(uuid)') is null
    or to_regprocedure('public.dayo_is_admin()') is null
    or to_regclass('public.partner_session_rewards') is null
    or to_regclass('public.booking_notification_log') is null then
    raise exception 'Existing cancellation, ticket, reward and notification contracts required';
  end if;
  -- History snapshots use the real booking creation timestamp, never an invented one.
  if not exists(select 1 from pg_catalog.pg_attribute
    where attrelid='public.bookings'::regclass and attname='created_at'
      and atttypid='timestamptz'::regtype and not attisdropped) then
    raise exception 'Booking created_at timestamptz contract required';
  end if;
end;
$preflight$;

create table public.partner_booking_cancellations (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  cancelled_by text not null default 'partner' check (cancelled_by='partner'),
  partner_id uuid not null references public.profiles(id) on delete restrict,
  reason_code text not null check (reason_code in ('schedule_change','health','school_exam','technical','personal','other')),
  reason_text text check (reason_text is null or (length(reason_text) between 1 and 300 and reason_text=btrim(reason_text))),
  cancelled_at timestamptz not null,
  hours_before_session numeric not null check (hours_before_session > 0),
  late_cancel boolean not null,
  penalty_amount integer not null check (penalty_amount >= 0),
  ticket_refunded boolean not null check (ticket_refunded),
  slot_reopened boolean not null check (slot_reopened),
  check (late_cancel = (hours_before_session < 6)),
  check ((late_cancel and penalty_amount > 0) or (not late_cancel and penalty_amount=0)),
  check ((reason_code='other' and reason_text is not null) or (reason_code<>'other' and reason_text is null))
);
create index partner_booking_cancellations_partner_time_idx on public.partner_booking_cancellations(partner_id,cancelled_at desc);
create table public.partner_cancellation_penalties (
  booking_id uuid primary key references public.partner_booking_cancellations(booking_id) on delete restrict,
  partner_id uuid not null references public.profiles(id) on delete restrict,
  penalty_type text not null default 'late_cancellation' check (penalty_type='late_cancellation'),
  penalty_amount integer not null check (penalty_amount > 0),
  reason_code text not null check (reason_code in ('schedule_change','health','school_exam','technical','personal','other')),
  created_at timestamptz not null,
  idempotency_key text not null unique check (idempotency_key='partner_late_cancel:' || booking_id::text)
);
create table public.partner_cancellation_penalty_offsets (
  reward_booking_id uuid not null references public.partner_session_rewards(booking_id) on delete restrict,
  penalty_booking_id uuid not null references public.partner_cancellation_penalties(booking_id) on delete restrict,
  partner_id uuid not null references public.profiles(id) on delete restrict,
  offset_amount integer not null check (offset_amount between 1 and 6000),
  created_at timestamptz not null,
  primary key(reward_booking_id,penalty_booking_id)
);
create index partner_cancellation_penalty_offsets_penalty_idx on public.partner_cancellation_penalty_offsets(penalty_booking_id);
alter table public.partner_cancellation_penalty_offsets enable row level security;
revoke all on public.partner_cancellation_penalty_offsets from public,anon,authenticated,service_role;

-- Detailed reasons are never available through participant table SELECT.
alter table public.partner_booking_cancellations enable row level security;
alter table public.partner_cancellation_penalties enable row level security;
revoke all on public.partner_booking_cancellations, public.partner_cancellation_penalties from public,anon,authenticated,service_role;

create function public.dayo_immutable_partner_cancellation() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Cancellation audit events are immutable' using errcode='23514'; end;
$$;
revoke all on function public.dayo_immutable_partner_cancellation() from public,anon,authenticated,service_role;
create trigger immutable_partner_cancellation before update or delete on public.partner_booking_cancellations
  for each row execute function public.dayo_immutable_partner_cancellation();
create trigger immutable_partner_penalty before update or delete on public.partner_cancellation_penalties
  for each row execute function public.dayo_immutable_partner_cancellation();

create trigger immutable_partner_penalty_offset before update or delete on public.partner_cancellation_penalty_offsets
  for each row execute function public.dayo_immutable_partner_cancellation();

-- Booking lifecycle history is distinct from Room/session telemetry.
-- Only partner_cancelled is written now. Other canonical types reserve future use;
-- their idempotency keys may identify multiple reschedules/technical incidents.
-- Cancellation facts remain in the immutable detail ledger, linked below.
create table public.booking_lifecycle_events (
  event_id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  event_type text not null check (event_type in ('user_cancelled','partner_cancelled',
    'partner_no_show','user_no_show','technical_issue','rescheduled','completed')),
  idempotency_key text not null unique,
  learner_id uuid not null references public.profiles(id) on delete restrict,
  partner_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  cancelled_by text check (cancelled_by in ('user','partner','admin','system')),
  booking_created_at timestamptz not null,
  scheduled_at timestamptz not null,
  occurred_at timestamptz not null,
  language text,
  slot_id uuid references public.availability_slots(id) on delete restrict,
  cancellation_booking_id uuid references public.partner_booking_cancellations(booking_id) on delete restrict,
  refunded_allocation_id uuid references public.ticket_allocations(id) on delete restrict,
  refunded_ticket_lot_id uuid references public.ticket_lots(id) on delete restrict,
  compensation_ticket_count integer not null default 0 check (compensation_ticket_count>=0),
  penalty_ledger_booking_id uuid references public.partner_cancellation_penalties(booking_id) on delete restrict,
  penalty_status_at_event text check (penalty_status_at_event in ('none','pending_offset','offset','waived')),
  user_notification_key text,
  partner_notification_key text,
  created_at timestamptz not null default clock_timestamp(),
  check (event_type<>'partner_cancelled' or (
    idempotency_key='partner_cancelled:' || booking_id::text
    and cancelled_by is not null and cancelled_by='partner' and actor_user_id is not null and actor_user_id=partner_id
    and cancellation_booking_id is not null and cancellation_booking_id=booking_id
    and slot_id is not null and refunded_allocation_id is not null and refunded_ticket_lot_id is not null
    and compensation_ticket_count=0 and occurred_at<scheduled_at
    and penalty_status_at_event is not null
    and ((penalty_ledger_booking_id is null and penalty_status_at_event='none')
      or (penalty_ledger_booking_id is not null and penalty_ledger_booking_id=booking_id and penalty_status_at_event='pending_offset'))
    and user_notification_key is not null and user_notification_key='booking_cancelled:' || booking_id::text || ':learner'
    and partner_notification_key is not null and partner_notification_key='booking_cancelled:' || booking_id::text || ':partner'
  ))
);
create unique index booking_lifecycle_partner_cancel_once_idx
  on public.booking_lifecycle_events(booking_id,event_type) where event_type='partner_cancelled';
create index booking_lifecycle_booking_time_idx on public.booking_lifecycle_events(booking_id,occurred_at,event_id);
create index booking_lifecycle_partner_time_idx on public.booking_lifecycle_events(partner_id,occurred_at,event_type);
alter table public.booking_lifecycle_events enable row level security;
revoke all on public.booking_lifecycle_events from public,anon,authenticated,service_role;
create trigger immutable_booking_lifecycle_event before update or delete on public.booking_lifecycle_events
  for each row execute function public.dayo_immutable_partner_cancellation();
create trigger immutable_booking_lifecycle_truncate before truncate on public.booking_lifecycle_events
  for each statement execute function public.dayo_immutable_partner_cancellation();

create function public.dayo_partner_cancellation_policy() returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('enabled',true,'late_penalty_amount',6000,'settlement_mode','future_reward_offset')
$$;
revoke all on function public.dayo_partner_cancellation_policy() from public,anon,authenticated,service_role;

-- Isolated boundary helper: exactly six hours is early for PARTNER cancellation.
create function public.dayo_partner_cancellation_is_late(p_start timestamptz,p_now timestamptz)
returns boolean language sql immutable set search_path='' as $$ select p_start < p_now + interval '6 hours' $$;
revoke all on function public.dayo_partner_cancellation_is_late(timestamptz,timestamptz) from public,anon,authenticated,service_role;

create function public.get_my_partner_cancellation_preview(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_booking public.bookings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_policy jsonb := public.dayo_partner_cancellation_policy();
  v_name text;
  v_late boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='partner') then
    raise exception 'Partner access required' using errcode='42501';
  end if;
  select * into v_booking from public.bookings where id=p_booking_id and partner_user_id=auth.uid();
  if not found then raise exception 'Partner booking access required' using errcode='42501'; end if;
  -- Preserve the original fact; never synthesize a missing booking creation time.
  if v_booking.created_at is null then
    raise exception 'Booking creation timestamp is missing; cancellation was not performed'
      using errcode='23514', hint='booking_created_at_missing';
  end if;
  if v_booking.status is distinct from 'confirmed' or v_booking.scheduled_at is null or v_booking.scheduled_at<=v_now
    or v_booking.ended_at is not null or v_booking.completed_at is not null then
    raise exception 'Only future confirmed bookings can be cancelled' using errcode='23514';
  end if;
  select nickname into v_name from public.profiles where id=v_booking.learner_id;
  if v_name is null or length(v_name)>80 or v_name ~ '[@[:cntrl:]]' then v_name:='DayO User'; end if;
  v_late:=public.dayo_partner_cancellation_is_late(v_booking.scheduled_at,v_now);
  return jsonb_build_object('booking_id',p_booking_id,'scheduled_at',v_booking.scheduled_at,
    'learner_nickname',v_name,'remaining_seconds',extract(epoch from (v_booking.scheduled_at-v_now)),
    'late_cancel',v_late,'penalty_amount',case when v_late then v_policy->'late_penalty_amount' else '0'::jsonb end,
    'enabled',coalesce((v_policy->>'enabled')::boolean,false));
end;
$$;
revoke all on function public.get_my_partner_cancellation_preview(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_partner_cancellation_preview(uuid) to authenticated;

create function public.cancel_my_partner_booking(p_booking_id uuid,p_reason_code text,p_reason_text text default null,p_accept_late_penalty boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_booking public.bookings%rowtype;
  v_slot public.availability_slots%rowtype;
  v_allocation public.ticket_allocations%rowtype;
  v_lot public.ticket_lots%rowtype;
  v_event public.partner_booking_cancellations%rowtype;
  v_now timestamptz;
  v_late boolean;
  v_amount integer;
  v_reason text;
  v_policy jsonb:=public.dayo_partner_cancellation_policy();
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor and role='partner') then
    raise exception 'Partner access required' using errcode='42501';
  end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_booking.partner_user_id is distinct from v_actor then
    raise exception 'Partner booking access required' using errcode='42501';
  end if;
  -- Preserve the original fact; never synthesize a missing booking creation time.
  if v_booking.created_at is null then
    raise exception 'Booking creation timestamp is missing; cancellation was not performed'
      using errcode='23514', hint='booking_created_at_missing';
  end if;
  select * into v_allocation from public.ticket_allocations where booking_id=p_booking_id for update;
  if not found or v_allocation.quantity is distinct from 1 or v_booking.ticket_deducted is distinct from true then
    raise exception 'Booking ticket allocation is inconsistent' using errcode='23514';
  end if;
  select * into v_lot from public.ticket_lots where id=v_allocation.ticket_lot_id;
  if not found or v_lot.user_id is distinct from v_booking.learner_id then
    raise exception 'Original ticket owner mismatch' using errcode='23514';
  end if;
  if v_booking.status='cancelled' then
    select * into v_event from public.partner_booking_cancellations where booking_id=p_booking_id;
    if not found or v_event.partner_id is distinct from v_actor or v_booking.ticket_refunded is distinct from true
      or v_booking.partner_rewarded is distinct from false or v_allocation.refunded_at is distinct from v_event.cancelled_at
      or v_allocation.refund_reason is distinct from v_booking.end_reason
      or v_booking.end_reason is distinct from (case when v_event.late_cancel then 'partner_cancelled_late' else 'partner_cancelled_early' end)
      or v_booking.ended_at is distinct from v_event.cancelled_at or v_booking.completed_at is not null
      or (v_event.late_cancel and not exists(select 1 from public.partner_cancellation_penalties p
        where p.booking_id=p_booking_id and p.partner_id=v_actor and p.penalty_amount=v_event.penalty_amount))
      or (not v_event.late_cancel and exists(select 1 from public.partner_cancellation_penalties where booking_id=p_booking_id))
      or not exists(select 1 from public.booking_lifecycle_events h where h.booking_id=p_booking_id
        and h.event_type='partner_cancelled' and h.cancellation_booking_id=p_booking_id
        and h.partner_id=v_actor and h.learner_id=v_booking.learner_id
        and h.scheduled_at=v_booking.scheduled_at and h.booking_created_at=v_booking.created_at
        and h.occurred_at=v_event.cancelled_at and h.slot_id=v_booking.slot_id
        and h.refunded_allocation_id=v_allocation.id and h.refunded_ticket_lot_id=v_lot.id
        and h.penalty_ledger_booking_id is not distinct from (case when v_event.late_cancel then p_booking_id else null end)) then
      raise exception 'Cancelled booking audit/refund state is inconsistent' using errcode='23514';
    end if;
    return jsonb_build_object('success',true,'already_cancelled',true,'ticket_refunded',true,
      'late_cancel',v_event.late_cancel,'penalty_amount',v_event.penalty_amount);
  end if;
  if not coalesce((v_policy->>'enabled')::boolean,false) then
    return jsonb_build_object('success',false,'code','partner_cancellation_policy_pending');
  end if;
  -- Server-owned amount and future-reward settlement; callers cannot supply points.
  if p_reason_code is null or p_reason_code not in ('schedule_change','health','school_exam','technical','personal','other') then
    raise exception 'Invalid cancellation reason' using errcode='22023';
  end if;
  v_reason:=nullif(btrim(regexp_replace(coalesce(p_reason_text,''),'[[:cntrl:]]','','g')),'');
  if p_reason_code='other' and (v_reason is null or length(v_reason)>300) then
    raise exception 'Other reason must contain 1 to 300 characters' using errcode='22023';
  end if;
  if p_reason_code<>'other' and v_reason is not null then
    raise exception 'Detailed text is only accepted for other' using errcode='22023';
  end if;
  if v_booking.status is distinct from 'confirmed' or v_booking.partner_id is distinct from v_actor
    or v_booking.slot_id is null or v_booking.scheduled_at is null
    or v_booking.ticket_refunded is distinct from false or v_booking.partner_rewarded is distinct from false
    or v_booking.ended_at is not null or v_booking.completed_at is not null
    or nullif(btrim(v_booking.end_reason),'') is not null
    or v_allocation.refunded_at is not null or v_allocation.refund_reason is not null
    or exists(select 1 from public.partner_session_rewards where booking_id=p_booking_id) then
    raise exception 'Only unended confirmed bookings can be cancelled' using errcode='23514';
  end if;
  select * into v_slot from public.availability_slots where id=v_booking.slot_id for update;
  if not found or v_slot.status is distinct from 'booked' or v_slot.partner_id is distinct from v_actor
    or v_slot.slot_time is null or v_slot.slot_time like 'weekly:%'
    or exists(select 1 from public.bookings b where b.slot_id=v_booking.slot_id and b.id<>p_booking_id and b.status='confirmed') then
    raise exception 'Concrete booking slot is inconsistent' using errcode='23514';
  end if;
  -- Preserve canonical lot writer lock order: profile before lot.
  perform 1 from public.profiles where id=v_booking.learner_id for update;
  if not found then raise exception 'Learner profile required' using errcode='23514'; end if;
  select * into v_lot from public.ticket_lots where id=v_allocation.ticket_lot_id for update;
  if not found or v_lot.user_id is distinct from v_booking.learner_id or v_lot.quantity_remaining>=v_lot.quantity_issued then
    raise exception 'Original ticket lot cannot be restored' using errcode='23514';
  end if;
  v_now:=clock_timestamp();
  if v_booking.scheduled_at<=v_now then raise exception 'Past booking cannot be cancelled' using errcode='23514'; end if;
  v_late:=public.dayo_partner_cancellation_is_late(v_booking.scheduled_at,v_now);
  if v_late and p_accept_late_penalty is distinct from true then
    return jsonb_build_object('success',false,'code','late_penalty_confirmation_required');
  end if;
  v_amount:=case when v_late then (v_policy->>'late_penalty_amount')::integer else 0 end;
  if v_late and (v_amount is null or v_amount<=0) then
    raise exception 'Late penalty policy is not approved' using errcode='23514';
  end if;
  update public.ticket_lots set quantity_remaining=quantity_remaining+1,updated_at=v_now
    where id=v_lot.id and quantity_remaining<quantity_issued;
  if not found then raise exception 'Ticket lot changed during cancellation' using errcode='40001'; end if;
  update public.ticket_allocations set refunded_at=v_now,
    refund_reason=case when v_late then 'partner_cancelled_late' else 'partner_cancelled_early' end
    where id=v_allocation.id and refunded_at is null;
  if not found then raise exception 'Allocation changed during cancellation' using errcode='40001'; end if;
  perform public.refresh_ticket_balance_cache(v_booking.learner_id);
  insert into public.partner_booking_cancellations(booking_id,cancelled_by,partner_id,reason_code,reason_text,cancelled_at,
    hours_before_session,late_cancel,penalty_amount,ticket_refunded,slot_reopened)
  values(p_booking_id,'partner',v_actor,p_reason_code,v_reason,v_now,
    extract(epoch from (v_booking.scheduled_at-v_now))/3600,v_late,v_amount,true,true);
  if v_late then
    insert into public.partner_cancellation_penalties(booking_id,partner_id,penalty_amount,reason_code,created_at,idempotency_key)
      values(p_booking_id,v_actor,v_amount,p_reason_code,v_now,'partner_late_cancel:' || p_booking_id::text);
  end if;
  insert into public.booking_lifecycle_events(booking_id,event_type,idempotency_key,learner_id,partner_id,
    actor_user_id,cancelled_by,booking_created_at,scheduled_at,occurred_at,language,slot_id,cancellation_booking_id,
    refunded_allocation_id,refunded_ticket_lot_id,compensation_ticket_count,penalty_ledger_booking_id,
    penalty_status_at_event,user_notification_key,partner_notification_key)
  values(p_booking_id,'partner_cancelled','partner_cancelled:' || p_booking_id::text,v_booking.learner_id,v_actor,
    v_actor,'partner',v_booking.created_at,v_booking.scheduled_at,v_now,v_booking.language,v_booking.slot_id,p_booking_id,
    v_allocation.id,v_lot.id,0,case when v_late then p_booking_id else null end,
    case when v_late then 'pending_offset' else 'none' end,
    'booking_cancelled:' || p_booking_id::text || ':learner','booking_cancelled:' || p_booking_id::text || ':partner');
  -- Event is recorded BEFORE status update so the existing outbox trigger can
  -- build a private-text-free snapshot in the same committed transaction.
  update public.bookings set status='cancelled',ticket_refunded=true,partner_rewarded=false,
    end_reason=case when v_late then 'partner_cancelled_late' else 'partner_cancelled_early' end,
    ended_at=v_now,updated_at=v_now where id=p_booking_id and status='confirmed' and ticket_refunded=false and partner_rewarded=false;
  if not found then raise exception 'Booking changed during cancellation' using errcode='40001'; end if;
  update public.availability_slots set status='available',updated_at=v_now
    where id=v_booking.slot_id and partner_id=v_actor and status='booked';
  if not found then raise exception 'Slot changed during cancellation' using errcode='40001'; end if;
  return jsonb_build_object('success',true,'already_cancelled',false,'ticket_refunded',true,
    'late_cancel',v_late,'penalty_amount',v_amount);
end;
$$;
revoke all on function public.cancel_my_partner_booking(uuid,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cancel_my_partner_booking(uuid,text,text,boolean) to authenticated;

create function public.apply_partner_cancellation_reward_offsets(p_booking_id uuid,p_partner_id uuid,p_reward_amount integer)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_penalty record;
  v_offset integer:=0;
  v_remaining integer;
  v_used integer;
  v_take integer;
begin
  if p_reward_amount is distinct from 6000 or not exists(
    select 1 from public.partner_session_rewards r join public.bookings b on b.id=r.booking_id
    where r.booking_id=p_booking_id and r.partner_id=p_partner_id and r.reward_amount=p_reward_amount
      and b.partner_user_id=p_partner_id and b.status in ('confirmed','completed')
      and b.end_reason='normal' and b.ended_at is not null) then
    raise exception 'Canonical normal session reward required' using errcode='23514';
  end if;
  -- Same canonical profile lock serializes simultaneous rewards for a partner.
  perform 1 from public.profiles where id=p_partner_id and role='partner' for update;
  if not found then raise exception 'Partner profile required' using errcode='23514'; end if;
  select coalesce(sum(offset_amount),0)::integer into v_offset from public.partner_cancellation_penalty_offsets
    where reward_booking_id=p_booking_id;
  if v_offset>p_reward_amount then raise exception 'Reward offset exceeds reward' using errcode='23514'; end if;
  if v_offset>0 then return v_offset; end if;
  v_remaining:=p_reward_amount;
  for v_penalty in select p.* from public.partner_cancellation_penalties p
    where p.partner_id=p_partner_id
      -- Existing/historical rewards cannot settle a penalty assessed afterwards.
      and p.created_at <= (select created_at from public.partner_session_rewards where booking_id=p_booking_id)
    order by p.created_at,p.booking_id for update
  loop
    select coalesce(sum(offset_amount),0)::integer into v_used from public.partner_cancellation_penalty_offsets
      where penalty_booking_id=v_penalty.booking_id;
    if v_used>v_penalty.penalty_amount then raise exception 'Penalty offset exceeds assessment' using errcode='23514'; end if;
    v_take:=least(v_remaining,v_penalty.penalty_amount-v_used);
    if v_take>0 then
      insert into public.partner_cancellation_penalty_offsets(reward_booking_id,penalty_booking_id,partner_id,offset_amount,created_at)
        values(p_booking_id,v_penalty.booking_id,p_partner_id,v_take,clock_timestamp());
      v_offset:=v_offset+v_take;v_remaining:=v_remaining-v_take;
    end if;
    exit when v_remaining=0;
  end loop;
  return v_offset;
end;
$$;
revoke all on function public.apply_partner_cancellation_reward_offsets(uuid,uuid,integer) from public,anon,authenticated,service_role;

-- Internal read-only projection: immutable facts + current append-only settlement
-- and outbox delivery state. Never exposes email, contact info or delivery payload.
create function public.dayo_booking_lifecycle_history(p_booking_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object(
    'timezone','Asia/Seoul',
    'cancelled_at',case when h.event_type='partner_cancelled' then h.occurred_at else null end,
    'seconds_before_session',extract(epoch from (h.scheduled_at-h.occurred_at)),
    'hours_before_session',extract(epoch from (h.scheduled_at-h.occurred_at))/3600,
    'reason_code',c.reason_code,'reason_text',c.reason_text,'late_cancel',c.late_cancel,
    'penalty_amount',c.penalty_amount,'penalty_idempotency_key',p.idempotency_key,
    'penalty_offset_amount',coalesce(o.offset_amount,0),
    'penalty_remaining_amount',greatest(coalesce(p.penalty_amount,0)-coalesce(o.offset_amount,0),0),
    'penalty_status',case when p.booking_id is null then 'none'
      when coalesce(o.offset_amount,0)>=p.penalty_amount then 'offset' else 'pending_offset' end,
    'penalty_offsets',coalesce(o.offsets,'[]'::jsonb),
    'ticket_refunded',c.ticket_refunded,'slot_reopened',c.slot_reopened,
    'notifications',jsonb_build_array(
      jsonb_build_object('recipient_role','learner','event_key',h.user_notification_key,
        'status',coalesce(un.status,'not_enqueued'),'attempts',coalesce(un.attempts,0),'sent_at',un.sent_at),
      jsonb_build_object('recipient_role','partner','event_key',h.partner_notification_key,
        'status',coalesce(pn.status,'not_enqueued'),'attempts',coalesce(pn.attempts,0),'sent_at',pn.sent_at))
    ) order by h.occurred_at,h.event_id),'[]'::jsonb)
  from public.booking_lifecycle_events h
  left join public.partner_booking_cancellations c on c.booking_id=h.cancellation_booking_id
  left join public.partner_cancellation_penalties p on p.booking_id=h.penalty_ledger_booking_id
  left join lateral (select sum(x.offset_amount)::integer offset_amount,
    jsonb_agg(jsonb_build_object('reward_booking_id',x.reward_booking_id,'offset_amount',x.offset_amount,
      'created_at',x.created_at) order by x.created_at,x.reward_booking_id) offsets
    from public.partner_cancellation_penalty_offsets x where x.penalty_booking_id=p.booking_id) o on true
  left join public.booking_notification_log un on un.event_key=h.user_notification_key
  left join public.booking_notification_log pn on pn.event_key=h.partner_notification_key
  where h.booking_id=p_booking_id
$$;
revoke all on function public.dayo_booking_lifecycle_history(uuid) from public,anon,authenticated,service_role;

create function public.get_admin_booking_lifecycle_history(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.dayo_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object('booking_id',p_booking_id,'events',public.dayo_booking_lifecycle_history(p_booking_id));
end;
$$;
revoke all on function public.get_admin_booking_lifecycle_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_booking_lifecycle_history(uuid) to authenticated;

create function public.get_admin_partner_cancellation(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.dayo_is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  return (select e from jsonb_array_elements(public.dayo_booking_lifecycle_history(p_booking_id)) e
    where e->>'event_type'='partner_cancelled' limit 1);
end;
$$;
revoke all on function public.get_admin_partner_cancellation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_partner_cancellation(uuid) to authenticated;

-- Only the partner who submitted the cancellation may read their detailed reason.
-- A learner/booking counterpart has no access to this private history RPC.
create function public.get_my_partner_cancellation_history(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='partner')
    or not exists(select 1 from public.booking_lifecycle_events
      where booking_id=p_booking_id and event_type='partner_cancelled' and partner_id=auth.uid()) then
    raise exception 'Partner cancellation owner access required' using errcode='42501';
  end if;
  return (select e from jsonb_array_elements(public.dayo_booking_lifecycle_history(p_booking_id)) e
    where e->>'event_type'='partner_cancelled' limit 1);
end;
$$;
revoke all on function public.get_my_partner_cancellation_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_partner_cancellation_history(uuid) to authenticated;

create or replace function public.enqueue_booking_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event text;
  v_snapshot jsonb;
  v_cancellation public.partner_booking_cancellations%rowtype;
begin
  if old.status = 'pending' and new.status = 'confirmed' and new.ticket_deducted is true then
    v_event := 'booking_confirmed';
  elsif old.status = 'confirmed' and new.status = 'cancelled'
    and new.end_reason in ('user_cancelled_early', 'user_cancelled_late', 'partner_cancelled_early', 'partner_cancelled_late') then
    v_event := 'booking_cancelled';
  else
    return new;
  end if;
  if new.learner_id is null or new.partner_user_id is null or new.scheduled_at is null then
    raise exception 'Incomplete booking notification identity';
  end if;
  v_snapshot := pg_catalog.jsonb_build_object(
    'learner_id', new.learner_id, 'partner_user_id', new.partner_user_id,
    'scheduled_at', new.scheduled_at, 'language', new.language,
    'end_reason', new.end_reason, 'ticket_refunded', new.ticket_refunded,
    'partner_rewarded', new.partner_rewarded
  );
  if new.end_reason in ('partner_cancelled_early','partner_cancelled_late') then
    select * into v_cancellation from public.partner_booking_cancellations where booking_id=new.id;
    if not found or v_cancellation.partner_id is distinct from new.partner_user_id then
      raise exception 'Partner cancellation audit required';
    end if;
    -- Learner sees only a generic reason. No recipient gets detailed reason_text.
    v_snapshot:=v_snapshot || jsonb_build_object('cancelled_by','partner',
      'late_cancel',v_cancellation.late_cancel,'penalty_amount',v_cancellation.penalty_amount);
  end if;
  insert into public.booking_notification_log(event_key, booking_id, event_type, recipient_role, recipient_user_id, snapshot)
  values (v_event || ':' || new.id::text || ':partner', new.id, v_event, 'partner', new.partner_user_id, case when v_cancellation.booking_id is not null then v_snapshot || jsonb_build_object('reason_code',v_cancellation.reason_code) else v_snapshot end)
  on conflict (booking_id, event_type, recipient_role) do nothing;
  if v_event = 'booking_confirmed' or v_cancellation.booking_id is not null then
    insert into public.booking_notification_log(event_key, booking_id, event_type, recipient_role, recipient_user_id, snapshot)
    values (v_event || ':' || new.id::text || ':learner', new.id, v_event, 'learner', new.learner_id, case when v_cancellation.booking_id is not null then v_snapshot || jsonb_build_object('public_reason',case when v_cancellation.reason_code='schedule_change' then 'schedule_change' else 'partner_circumstances' end) else v_snapshot end)
    on conflict (booking_id, event_type, recipient_role) do nothing;
  end if;
  return new;
exception when others then
  -- Notification enqueue failures must not roll back booking/ticket/cancellation.
  -- Monitor this code in database logs; no email or token is included.
  raise warning 'DAYO_BOOKING_NOTIFICATION_ENQUEUE_FAILED SQLSTATE=%', sqlstate;
  return new;
end;
$$;
revoke all on function public.enqueue_booking_notification() from public, anon, authenticated, service_role;

-- Recover a failed best-effort enqueue from the immutable committed event.
-- The existing retry worker calls claim; no new scheduler or historical backfill.
create function public.requeue_partner_cancellation_notifications(p_booking_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_row record; v_snapshot jsonb;
begin
  for v_row in select e.*,h.learner_id,h.partner_id partner_user_id,h.scheduled_at,h.language,b.end_reason
    from public.partner_booking_cancellations e join public.bookings b on b.id=e.booking_id
    join public.booking_lifecycle_events h on h.cancellation_booking_id=e.booking_id and h.event_type='partner_cancelled'
    where (p_booking_id is null or e.booking_id=p_booking_id)
      and b.status='cancelled' and b.ticket_refunded is true and b.partner_rewarded is false
      and b.partner_user_id=e.partner_id and b.learner_id=h.learner_id and h.partner_id=e.partner_id
      and h.occurred_at=e.cancelled_at and b.ended_at=e.cancelled_at
      and b.end_reason=(case when e.late_cancel then 'partner_cancelled_late' else 'partner_cancelled_early' end)
      and (select count(*) from public.booking_notification_log n where n.booking_id=e.booking_id and n.event_type='booking_cancelled')<2
    order by e.cancelled_at,e.booking_id limit 100
  loop
    v_snapshot:=jsonb_build_object('learner_id',v_row.learner_id,'partner_user_id',v_row.partner_user_id,
      'scheduled_at',v_row.scheduled_at,'language',v_row.language,'end_reason',v_row.end_reason,
      'ticket_refunded',true,'partner_rewarded',false,'cancelled_by','partner',
      'late_cancel',v_row.late_cancel,'penalty_amount',v_row.penalty_amount);
    insert into public.booking_notification_log(event_key,booking_id,event_type,recipient_role,recipient_user_id,snapshot,status,last_error,created_at)
    select 'booking_cancelled:' || v_row.booking_id::text || ':' || recipient.role,v_row.booking_id,'booking_cancelled',recipient.role,recipient.uid,
      v_snapshot || recipient.safe_reason,
      case when v_row.cancelled_at < clock_timestamp()-interval '23 hours' then 'needs_review' else 'pending' end,
      case when v_row.cancelled_at < clock_timestamp()-interval '23 hours' then 'enqueue_recovery_delayed' else null end,v_row.cancelled_at
    from (values
      ('partner',v_row.partner_user_id,jsonb_build_object('reason_code',v_row.reason_code)),
      ('learner',v_row.learner_id,jsonb_build_object('public_reason',case when v_row.reason_code='schedule_change' then 'schedule_change' else 'partner_circumstances' end))
    ) recipient(role,uid,safe_reason)
    on conflict(booking_id,event_type,recipient_role) do nothing;
  end loop;
end;
$$;
revoke all on function public.requeue_partner_cancellation_notifications(uuid) from public,anon,authenticated,service_role;

create or replace function public.claim_booking_notification(p_booking_id uuid default null, p_event_type text default null)
returns setof public.booking_notification_log
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
begin
  if p_event_type is null or p_event_type='booking_cancelled' then
    perform public.requeue_partner_cancellation_notifications(p_booking_id);
  end if;
  -- Both scoped participant delivery and a server-only retry worker use this lock.
  update public.booking_notification_log n set status = 'needs_review', last_error = 'retry_limit_or_window_expired', lease_token = null, lease_until = null
    where (p_booking_id is null or n.booking_id = p_booking_id)
      and (p_event_type is null or n.event_type = p_event_type)
      and n.status in ('pending', 'failed', 'sending')
      and (n.lease_until is null or n.lease_until < pg_catalog.now())
      and (n.attempts >= 10 or n.first_attempt_at <= pg_catalog.now() - interval '23 hours');
  update public.booking_notification_log n set status = 'skipped', last_error = 'event_superseded', lease_token = null, lease_until = null
    from public.bookings b
    where n.booking_id = b.id
      and (p_booking_id is null or n.booking_id = p_booking_id)
      and (p_event_type is null or n.event_type = p_event_type)
      and n.status in ('pending', 'failed', 'sending')
      and (n.lease_until is null or n.lease_until < pg_catalog.now())
      and (b.learner_id::text is distinct from n.snapshot->>'learner_id'
        or b.partner_user_id::text is distinct from n.snapshot->>'partner_user_id'
        or (n.event_type = 'booking_confirmed' and (b.status is distinct from 'confirmed' or b.ticket_deducted is distinct from true))
        or (n.event_type = 'booking_cancelled' and (b.status is distinct from 'cancelled' or not coalesce(b.end_reason in ('user_cancelled_early', 'user_cancelled_late', 'partner_cancelled_early', 'partner_cancelled_late'), false))));
  select n.event_key into v_key from public.booking_notification_log n
    where (p_booking_id is null or n.booking_id = p_booking_id)
      and (p_event_type is null or n.event_type = p_event_type)
      and n.status in ('pending', 'failed', 'sending')
      and n.next_attempt_at <= pg_catalog.now()
      and (n.lease_until is null or n.lease_until < pg_catalog.now())
    order by n.created_at, n.event_key
    limit 1 for update skip locked;
  if v_key is null then return; end if;
  return query update public.booking_notification_log n
    set status = 'sending', attempts = n.attempts + 1, lease_token = pg_catalog.gen_random_uuid(), lease_until = pg_catalog.now() + interval '2 minutes'
    where n.event_key = v_key returning n.*;
end;
$$;
revoke all on function public.claim_booking_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_booking_notification(uuid, text) to service_role;


CREATE OR REPLACE FUNCTION public.complete_session_and_reward_partner(p_booking_id uuid, p_partner_user_id uuid, p_reward_amount integer DEFAULT 6000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_booking_partner_id uuid;
  v_booking_status text;
  v_scheduled_at timestamptz;
  v_partner_rewarded boolean;
  v_end_reason text;
  v_ended_at timestamptz;
  v_profile_role text;
  v_points integer;
  v_ledger_partner_id uuid;
  v_ledger_amount integer;
  v_has_partner_media boolean := false;
  v_reward_amount constant integer := 6000;
  v_penalty_offset integer := 0;
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'unauthorized',
      'message', '濡쒓렇?몄씠 ?꾩슂?⑸땲??'
    );
  end if;

  if p_booking_id is null
     or p_partner_user_id is null
     or p_partner_user_id is distinct from v_actor_id then
    return jsonb_build_object(
      'success', false,
      'code', 'partner_identity_mismatch',
      'message', '?뚰듃??蹂몄씤留?蹂댁긽??諛쏆쓣 ???덉뒿?덈떎.'
    );
  end if;

  select
    bookings.partner_user_id,
    bookings.status,
    bookings.scheduled_at,
    bookings.partner_rewarded,
    bookings.end_reason,
    bookings.ended_at
  into
    v_booking_partner_id,
    v_booking_status,
    v_scheduled_at,
    v_partner_rewarded,
    v_end_reason,
    v_ended_at
  from public.bookings
  where bookings.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'booking_not_found',
      'message', '?ㅼ젣 ?덉빟 ID瑜?李얠쓣 ???놁뒿?덈떎.'
    );
  end if;

  if v_booking_partner_id is null
     or v_booking_partner_id is distinct from v_actor_id then
    return jsonb_build_object(
      'success', false,
      'code', 'booking_partner_mismatch',
      'message', '?덉빟???뚰듃???뺣낫媛 ?쇱튂?섏? ?딆뒿?덈떎.'
    );
  end if;

  select profiles.role, coalesce(profiles.point_balance, 0)
  into v_profile_role, v_points
  from public.profiles
  where profiles.id = v_actor_id;

  if not found or v_profile_role is distinct from 'partner' then
    return jsonb_build_object(
      'success', false,
      'code', 'partner_profile_required',
      'message', '?뚰듃???꾨줈?꾩쓣 李얠쓣 ???놁뒿?덈떎.'
    );
  end if;

  select rewards.partner_id, rewards.reward_amount
  into v_ledger_partner_id, v_ledger_amount
  from public.partner_session_rewards as rewards
  where rewards.booking_id = p_booking_id;

  if v_ledger_partner_id is not null
     and v_ledger_partner_id is distinct from v_actor_id then
    return jsonb_build_object(
      'success', false,
      'code', 'reward_state_conflict',
      'needs_review', true,
      'message', '蹂댁긽 湲곕줉 ?뺤씤???꾩슂?⑸땲??'
    );
  end if;

  -- NULL is outside the canonical NOT NULL contract. Never infer that it is
  -- unpaid, because the historical reward state cannot be proven safely.
  if v_partner_rewarded is null then
    return jsonb_build_object(
      'success', false,
      'code', 'reward_state_conflict',
      'needs_review', true,
      'evidence', 'booking_reward_flag_null',
      'message', '?덉빟??partner_rewarded ?곹깭媛 鍮꾩뼱 ?덉뼱 蹂댁긽 ?щ? ?뺤씤???꾩슂?⑸땲??'
    );
  end if;

  -- A true flag without a ledger is a legacy reward completed before 071.
  if v_partner_rewarded is true and v_ledger_partner_id is null then
    return jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'legacy_reward', true,
      'reward_amount', v_reward_amount,
      'rewarded_points', v_reward_amount,
      'updated_points', coalesce(v_points, 0),
      'booking_status', 'completed'
    );
  end if;

  select coalesce(sum(offset_amount),0)::integer into v_penalty_offset
    from public.partner_cancellation_penalty_offsets where reward_booking_id=p_booking_id;

  -- A true flag with the assigned partner's ledger is normal idempotency.
  if v_partner_rewarded is true and v_ledger_partner_id is not null then
    return jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'legacy_reward', false,
      'reward_amount', v_ledger_amount,
      'rewarded_points', v_ledger_amount - v_penalty_offset,
      'penalty_offset', v_penalty_offset,
      'gross_reward_amount', v_ledger_amount,
      'updated_points', coalesce(v_points, 0),
      'booking_status', 'completed'
    );
  end if;

  -- A ledger without the committed booking flag is ambiguous. It may reflect
  -- a manual or partial write, so neither retry payment nor repair the flag.
  if v_partner_rewarded is false and v_ledger_partner_id is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'reward_state_conflict',
      'needs_review', true,
      'evidence', 'ledger_present_booking_flag_false',
      'message', '蹂댁긽 ledger媛 ?덉?留??덉빟??partner_rewarded媛 false?낅땲?? ?ㅼ젣 ?ъ씤??吏湲??щ?瑜??뺤씤??二쇱꽭??'
    );
  end if;

  if v_booking_status <> 'confirmed'
     and not (v_booking_status = 'completed' and v_end_reason = 'normal') then
    return jsonb_build_object(
      'success', false,
      'code', 'booking_not_rewardable',
      'message', '蹂댁긽?????덈뒗 ?덉빟 ?곹깭媛 ?꾨떃?덈떎.'
    );
  end if;

  if v_scheduled_at is null or now() < v_scheduled_at + interval '25 minutes' then
    return jsonb_build_object(
      'success', false,
      'code', 'session_in_progress',
      'message', '?쇱씠釉?????쒓컙??醫낅즺???꾩뿉 蹂댁긽諛쏆쓣 ???덉뒿?덈떎.'
    );
  end if;

  if v_end_reason is distinct from 'normal' or v_ended_at is null then
    return jsonb_build_object(
      'success', false,
      'code', 'evidence_insufficient',
      'needs_review', true,
      'evidence', 'learner_normal_completion_missing',
      'message', '?숈뒿?먯쓽 ?뺤긽 ?꾨즺 湲곕줉???뺤씤?????놁뒿?덈떎.'
    );
  end if;

  select exists (
    select 1
    from public.session_events as events
    where events.booking_id = p_booking_id
      and events.actor_user_id = v_actor_id
      and events.event_type = 'media_connected'
  ) into v_has_partner_media;

  if not v_has_partner_media then
    return jsonb_build_object(
      'success', false,
      'code', 'evidence_insufficient',
      'needs_review', true,
      'evidence', 'partner_media_connected_missing',
      'message', '?뚰듃?덉쓽 ?몄뀡 李몄뿬 湲곕줉???뺤씤?????놁뒿?덈떎.'
    );
  end if;

  -- p_reward_amount remains in the signature for compatibility only.
  -- The client cannot influence the server-owned reward amount.
  select profiles.point_balance
  into v_points
  from public.profiles
  where profiles.id = v_actor_id
    and profiles.role = 'partner'
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'partner_profile_required',
      'message', '?뚰듃???꾨줈?꾩쓣 李얠쓣 ???놁뒿?덈떎.'
    );
  end if;

  insert into public.partner_session_rewards (
    booking_id,
    partner_id,
    reward_amount
  ) values (
    p_booking_id,
    v_actor_id,
    v_reward_amount
  );

  v_penalty_offset := public.apply_partner_cancellation_reward_offsets(p_booking_id,v_actor_id,v_reward_amount);

  update public.profiles
  set point_balance = coalesce(point_balance, 0) + v_reward_amount - v_penalty_offset,
      updated_at = now()
  where id = v_actor_id
    and role = 'partner'
  returning point_balance into v_points;

  if not found then
    raise exception 'Partner profile state changed while rewarding the session.'
      using errcode = '40001';
  end if;

  update public.bookings
  set status = 'completed',
      partner_rewarded = true,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_booking_id
    and partner_user_id = v_actor_id
    and partner_rewarded is false;

  if not found then
    raise exception 'Booking reward state changed while completing the session.'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'success', true,
    'already_rewarded', false,
    'legacy_reward', false,
    'reward_amount', v_reward_amount,
    'rewarded_points', v_reward_amount - v_penalty_offset,
    'penalty_offset', v_penalty_offset,
    'gross_reward_amount', v_reward_amount,
    'updated_points', v_points,
    'booking_status', 'completed'
  );
end;
$function$
;

revoke all on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  to authenticated, service_role;


notify pgrst, 'reload schema';
commit;
