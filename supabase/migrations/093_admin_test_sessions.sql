-- Admin-only real room QA. No production application without approval.
-- Rebased on deployed 091 Partner cancellation (2026-10-06 read-only audit).
-- 092 is Partner Report ownership; this 093 does not replace report merge RPCs.
-- Existing rows remain non-test. Exact production function drift guards remain.
begin;
-- Refuse to overwrite changes made after the read-only production audit.
do $preflight$ begin
  if to_regclass('public.partner_booking_cancellations') is null
    or to_regclass('public.partner_cancellation_penalties') is null
    or to_regclass('public.partner_cancellation_penalty_offsets') is null
    or to_regclass('public.booking_lifecycle_events') is null
    or to_regprocedure('public.apply_partner_cancellation_reward_offsets(uuid,uuid,integer)') is null
    or to_regprocedure('public.requeue_partner_cancellation_notifications(uuid)') is null then
    raise exception 'Deployed 091 cancellation contract required before 093.';
  end if;
  if md5(pg_get_functiondef('public.apply_partner_cancellation_reward_offsets(uuid,uuid,integer)'::regprocedure)) <> 'debe05b1e8a0031ab902daa3f379421e'
    or md5(pg_get_functiondef('public.requeue_partner_cancellation_notifications(uuid)'::regprocedure)) <> '5177eb89c16d397222a4435ba65d1034' then
    raise exception 'Production 091 helper drift. Re-audit before applying 093.';
  end if;
  if md5(pg_get_functiondef('public.cancel_my_booking(uuid)'::regprocedure)) <> 'e7a7c6e9e6b711a84409d7e912fa74e5' then raise exception 'Production function drift: cancel_my_booking. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.claim_booking_notification(uuid,text)'::regprocedure)) <> '83c5dbe9c0b847a164504c66f1b7c80b' then raise exception 'Production function drift: claim_booking_notification. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.complete_learner_session(uuid,text)'::regprocedure)) <> 'aec9f3305da6cee502383a6dbe7898c2' then raise exception 'Production function drift: complete_learner_session. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.complete_session_and_reward_partner(uuid,uuid,integer)'::regprocedure)) <> '49cd57f4d92fa513bcaf354925e89542' then raise exception 'Production function drift: complete_session_and_reward_partner. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.deduct_ticket_and_confirm_booking(uuid,uuid)'::regprocedure)) <> '24abf9abab920277efc9a5e00ea9e3e8' then raise exception 'Production function drift: deduct_ticket_and_confirm_booking. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.enforce_booking_four_hour_minimum()'::regprocedure)) <> '3811ae2a54a188080f159c0fe71def3a' then raise exception 'Production function drift: enforce_booking_four_hour_minimum. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.enforce_booking_monthly_window()'::regprocedure)) <> '0fff11479c84116b7f0a4bf65825a29e' then raise exception 'Production function drift: enforce_booking_monthly_window. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.enqueue_booking_notification()'::regprocedure)) <> '63059b8baa71be460bccff347e6df882' then raise exception 'Production function drift: enqueue_booking_notification. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.get_booking_calendar_slots(uuid[])'::regprocedure)) <> '5d3c4f8f7688adf11312f0b9220e6650' then raise exception 'Production function drift: get_booking_calendar_slots. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.get_partner_monthly_schedule()'::regprocedure)) <> '683cac0acecdf9e35218729bd93722e4' then raise exception 'Production function drift: get_partner_monthly_schedule. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.refresh_partner_monthly_slots(uuid,boolean,date)'::regprocedure)) <> '2e60f821404470be0253204c624e1e75' then raise exception 'Production function drift: refresh_partner_monthly_slots. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.refund_booking_ticket(uuid,text)'::regprocedure)) <> 'c920d130cde7434a9c0d7fddf72fcebe' then raise exception 'Production function drift: refund_booking_ticket. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.resolve_tech_issue_report(uuid,boolean,boolean,text)'::regprocedure)) <> '0267f0bf64ae3e8fb10e7663ee6aa697' then raise exception 'Production function drift: resolve_tech_issue_report. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.sync_confirmed_booking_preferences()'::regprocedure)) <> 'f708421b5f81c9cb2a2e1b0461fdd474' then raise exception 'Production function drift: sync_confirmed_booking_preferences. Re-audit before applying 093.';end if;
  if md5(pg_get_functiondef('public.get_admin_partner_availability(uuid)'::regprocedure)) <> '6702cfa3368c7218422378373b433be1' then raise exception 'Production function drift: get_admin_partner_availability. Re-audit before applying 093.';end if;
end;$preflight$;
alter table public.bookings add column is_test_session boolean not null default false;
comment on column public.bookings.is_test_session is 'Admin QA booking: no tickets, rewards, customer email, capacity or business metrics.';
alter table public.bookings add constraint bookings_test_no_financial_effects check (
  not is_test_session or (slot_id is null and ticket_deducted is false
    and ticket_refunded is false and partner_rewarded is false));

create function public.guard_test_session_booking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' and new.is_test_session and not public.dayo_is_admin() then
    raise exception 'Only administrators can create test sessions.' using errcode='42501';
  end if;
  if TG_OP='UPDATE' and new.is_test_session is distinct from old.is_test_session then
    raise exception 'The test-session flag is immutable.' using errcode='42501';
  end if;
  return new;
end;$$;
create trigger aaa_guard_test_session_booking before insert or update on public.bookings
for each row execute function public.guard_test_session_booking();
revoke all on function public.guard_test_session_booking() from public,anon,authenticated;

create function public.guard_test_session_ledger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.bookings where id=new.booking_id and is_test_session) then
    raise exception 'Test sessions cannot allocate tickets or rewards.' using errcode='23514';
  end if;
  return new;
end;$$;
create trigger guard_test_ticket_allocation before insert or update on public.ticket_allocations
for each row execute function public.guard_test_session_ledger();
create trigger guard_test_partner_reward before insert or update on public.partner_session_rewards
for each row execute function public.guard_test_session_ledger();
revoke all on function public.guard_test_session_ledger() from public,anon,authenticated;

create function public.admin_create_test_session(p_user_id uuid,p_partner_id uuid,
  p_language text,p_scheduled_at timestamptz,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user public.profiles%rowtype;v_partner public.profiles%rowtype;v_booking public.bookings%rowtype;
begin
  if not public.dayo_is_admin() then raise exception 'Admin access required.' using errcode='42501';end if;
  if p_request_id is null or p_user_id is null or p_partner_id is null or p_user_id=p_partner_id
    or p_language is null or p_language not in ('en','es','fr','ko') or p_scheduled_at is null then
    raise exception 'Invalid test session fields.' using errcode='22023';end if;
  -- Stable request UUID makes network retries exactly-once, including concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,92));
  select * into v_booking from public.bookings where id=p_request_id;
  if found then
    if not v_booking.is_test_session or v_booking.learner_id is distinct from p_user_id
      or v_booking.partner_user_id is distinct from p_partner_id or v_booking.language is distinct from p_language
      or v_booking.scheduled_at is distinct from p_scheduled_at then
      raise exception 'Request ID already belongs to another booking.' using errcode='23505';end if;
    return jsonb_build_object('success',true,'booking',to_jsonb(v_booking),'duration_minutes',30);
  end if;
  if p_scheduled_at<clock_timestamp() or p_scheduled_at>clock_timestamp()+interval '30 days' then
    raise exception 'Choose a future start within 30 days.' using errcode='22023';end if;
  select * into v_user from public.profiles where id=p_user_id and role in ('user','learner');
  if not found then raise exception 'User profile required.' using errcode='22023';end if;
  select * into v_partner from public.profiles where id=p_partner_id and role='partner';
  if not found then raise exception 'Partner profile required.' using errcode='22023';end if;
  insert into public.bookings(id,learner_id,partner_id,partner_user_id,partner_name,
    language,scheduled_at,status,is_test_session,ticket_deducted,ticket_refunded,partner_rewarded)
  values(p_request_id,p_user_id,p_partner_id,p_partner_id,
    coalesce(nullif(v_partner.nickname,''),nullif(v_partner.user_name,''),'DayO Partner'),
    p_language,p_scheduled_at,'confirmed',true,false,false,false) returning * into v_booking;
  return jsonb_build_object('success',true,'booking',to_jsonb(v_booking),'duration_minutes',30);
end;$$;
revoke all on function public.admin_create_test_session(uuid,uuid,text,timestamptz,uuid) from public,anon;
grant execute on function public.admin_create_test_session(uuid,uuid,text,timestamptz,uuid) to authenticated;

-- Private helper called only from existing authenticated RPCs. Normal room timing remains.
create function public.finish_test_session(p_booking_id uuid,p_action text,p_end_reason text default 'normal')
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype;u uuid:=auth.uid();r text;
begin
  select * into b from public.bookings where id=p_booking_id and is_test_session for update;
  if not found or u is null then raise exception 'Test booking participant required.' using errcode='42501';end if;
  if p_action in ('learner','cancel','confirm') and b.learner_id is distinct from u then
    raise exception 'User booking access required.' using errcode='42501';end if;
  if p_action='refund' and b.learner_id is distinct from u and b.partner_user_id is distinct from u then
    raise exception 'Booking participant access required.' using errcode='42501';end if;
  if p_action='partner' and (b.partner_user_id is distinct from u or not exists
    (select 1 from public.profiles where id=u and role='partner')) then
    raise exception 'Partner booking access required.' using errcode='42501';end if;
  if p_action in ('confirm','refund') then
    return jsonb_build_object('success',true,'is_test_session',true,'refunded',false,
      'ticket_deducted',false,'partner_rewarded',false,'booking_status',b.status);
  end if;
  if p_action='cancel' then
    if b.status='cancelled' and b.end_reason='test_cancelled' then
      return jsonb_build_object('success',true,'already_cancelled',true,'is_test_session',true,'ticket_refunded',false,'partner_rewarded',false);end if;
    if b.status<>'confirmed' or b.scheduled_at<=now() then raise exception 'Only future confirmed bookings can be cancelled.';end if;
    update public.bookings set status='cancelled',end_reason='test_cancelled',ended_at=now(),updated_at=now() where id=b.id;
    return jsonb_build_object('success',true,'is_test_session',true,'ticket_refunded',false,'partner_rewarded',false);
  end if;
  if b.status not in ('confirmed','completed') or (b.status='completed' and b.end_reason<>'normal') then
    raise exception 'Booking cannot be completed.' using errcode='22023';end if;
  if b.scheduled_at is null or now()<b.scheduled_at+interval '25 minutes' then
    return jsonb_build_object('success',false,'code','session_in_progress');end if;
  if p_action='partner' then
    if b.end_reason is distinct from 'normal' or b.ended_at is null or not exists
      (select 1 from public.session_events where booking_id=b.id and actor_user_id=u and event_type='media_connected') then
      return jsonb_build_object('success',false,'code','evidence_insufficient','needs_review',true);end if;
  elsif p_action='learner' then
    r:=coalesce(p_end_reason,'normal');
    if r not in ('normal','tech_issue','safety_reported') then raise exception 'Invalid end reason.' using errcode='22023';end if;
  else raise exception 'Unsupported test action.' using errcode='22023';end if;
  update public.bookings set status='completed',end_reason=coalesce(r,'normal'),
    ended_at=coalesce(ended_at,now()),completed_at=coalesce(completed_at,now()),updated_at=now() where id=b.id;
  return jsonb_build_object('success',true,'is_test_session',true,'reward_suppressed',true,
    'reward_amount',0,'rewarded_points',0,'partner_rewarded',false,
    'booking_status','completed','awaiting_partner_reward',false);
end;$$;
revoke all on function public.finish_test_session(uuid,text,text) from public,anon,authenticated;
-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.cancel_my_booking(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.now();
  v_booking public.bookings%rowtype;
  v_slot public.availability_slots%rowtype;
  v_allocation public.ticket_allocations%rowtype;
  v_lot public.ticket_lots%rowtype;
  v_early boolean;
  v_ticket_count integer;
  v_partner_points integer;
begin
  if exists(select 1 from public.bookings where id=p_booking_id and is_test_session) then
    return public.finish_test_session(p_booking_id,'cancel');
  end if;
  if v_actor_id is null or p_booking_id is null then
    raise exception 'Login and booking ID are required.' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;
  if not found or v_booking.learner_id is distinct from v_actor_id then
    raise exception 'Learner booking access is required.' using errcode = '42501';
  end if;

  -- Every post-cutover confirmed booking must have precisely one allocation.
  -- Do not invent a scalar or historical refund for missing allocations.
  select * into v_allocation
    from public.ticket_allocations
   where booking_id = p_booking_id
   for update;
  if not found or v_allocation.quantity is distinct from 1
     or v_booking.ticket_deducted is distinct from true then
    raise exception 'Booking ticket allocation is inconsistent.' using errcode = '23514';
  end if;

  select * into v_lot
    from public.ticket_lots
   where id = v_allocation.ticket_lot_id;
  if not found or v_lot.user_id is distinct from v_actor_id then
    raise exception 'Booking allocation belongs to another ticket owner.' using errcode = '23514';
  end if;

  if v_booking.status = 'cancelled' then
    if v_booking.end_reason = 'user_cancelled_early'
       and v_booking.ticket_refunded is true
       and v_allocation.refunded_at is not null
       and v_allocation.refund_reason = 'user_cancelled_early'
       and v_booking.partner_rewarded is false
       and v_booking.ended_at is not null
       and v_booking.completed_at is null then
      return pg_catalog.jsonb_build_object(
        'success', true, 'already_cancelled', true,
        'cancellation_type', 'early', 'ticket_refunded', true,
        'partner_rewarded', false
      );
    elsif v_booking.end_reason = 'user_cancelled_late'
       and v_booking.ticket_refunded is false
       and v_allocation.refunded_at is null
       and v_allocation.refund_reason is null
       and v_booking.partner_rewarded is true
       and v_booking.ended_at is not null
       and v_booking.completed_at is null then
      -- Reward and booking flag were committed atomically by this RPC.
      return pg_catalog.jsonb_build_object(
        'success', true, 'already_cancelled', true,
        'cancellation_type', 'late', 'ticket_refunded', false,
        'partner_rewarded', true
      );
    end if;
    raise exception 'Cancelled booking has inconsistent refund or reward state.'
      using errcode = '23514';
  end if;

  if v_booking.status is distinct from 'confirmed'
     or v_booking.scheduled_at is null
     or v_booking.scheduled_at <= v_now then
    raise exception 'Only future confirmed bookings can be cancelled.'
      using errcode = '23514';
  end if;
  if v_booking.partner_user_id is null
     or v_booking.partner_id is distinct from v_booking.partner_user_id
     or v_booking.slot_id is null then
    raise exception 'Booking partner or slot is incomplete.' using errcode = '23514';
  end if;
  if v_booking.ticket_refunded is distinct from false
     or v_booking.partner_rewarded is distinct from false
     or v_booking.ended_at is not null
     or v_booking.completed_at is not null
     or nullif(pg_catalog.btrim(v_booking.end_reason), '') is not null
     or v_allocation.refunded_at is not null
     or v_allocation.refund_reason is not null then
    raise exception 'Booking has already entered a refund, reward or ending flow.'
      using errcode = '23514';
  end if;

  select * into v_slot
    from public.availability_slots
   where id = v_booking.slot_id
   for update;
  if not found or v_slot.status is distinct from 'booked'
     or v_slot.partner_id is distinct from v_booking.partner_user_id
     or v_slot.slot_time is null or v_slot.slot_time like 'weekly:%' then
    raise exception 'Booking availability slot is inconsistent.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.bookings b
     where b.slot_id = v_booking.slot_id
       and b.id <> p_booking_id
       and b.status = 'confirmed'
  ) then
    raise exception 'Another confirmed booking occupies this slot.' using errcode = '23514';
  end if;

  -- Recheck after the booking/slot locks: a wait can cross either boundary.
  v_now := pg_catalog.clock_timestamp();
  if v_booking.scheduled_at <= v_now then
    raise exception 'Only future confirmed bookings can be cancelled.'
      using errcode = '23514';
  end if;
  v_early := v_booking.scheduled_at > v_now + interval '6 hours';
  if v_early then
    -- Match lot-writer lock order: profile before lot. Original expiry stays.
    perform 1 from public.profiles where id = v_actor_id for update;
    if not found then
      raise exception 'Learner profile not found.' using errcode = 'P0002';
    end if;
    select * into v_lot from public.ticket_lots
     where id = v_allocation.ticket_lot_id for update;
    if not found or v_lot.user_id is distinct from v_actor_id
       or v_lot.quantity_remaining >= v_lot.quantity_issued then
      raise exception 'Original ticket lot cannot be restored.' using errcode = '23514';
    end if;
    update public.ticket_lots
       set quantity_remaining = quantity_remaining + 1,
           updated_at = v_now
     where id = v_lot.id and quantity_remaining < quantity_issued;
    if not found then
      raise exception 'Ticket lot changed during cancellation.' using errcode = '40001';
    end if;
    update public.ticket_allocations
       set refunded_at = v_now, refund_reason = 'user_cancelled_early'
     where id = v_allocation.id and refunded_at is null;
    if not found then
      raise exception 'Ticket allocation changed during cancellation.' using errcode = '40001';
    end if;
    v_ticket_count := public.refresh_ticket_balance_cache(v_actor_id);
  else
    -- A late cancellation is not session completion. Reuse only the existing
    -- partner identity/role, 6,000P amount, profile lock and booking flag.
    select point_balance into v_partner_points
      from public.profiles
     where id = v_booking.partner_user_id and role = 'partner'
     for update;
    if not found then
      raise exception 'Partner profile is required for late cancellation compensation.'
        using errcode = '23514';
    end if;
    update public.profiles
       set point_balance = coalesce(point_balance, 0) + 6000,
           updated_at = v_now
     where id = v_booking.partner_user_id and role = 'partner';
    if not found then
      raise exception 'Partner compensation could not be applied.' using errcode = '40001';
    end if;
  end if;

  update public.bookings
     set status = 'cancelled',
         end_reason = case when v_early then 'user_cancelled_early'
                           else 'user_cancelled_late' end,
         ended_at = v_now,
         ticket_refunded = v_early,
         partner_rewarded = not v_early,
         updated_at = v_now
   where id = p_booking_id and status = 'confirmed'
     and ticket_refunded = false and partner_rewarded = false;
  if not found then
    raise exception 'Booking changed during cancellation.' using errcode = '40001';
  end if;

  update public.availability_slots
     set status = 'available', updated_at = v_now
   where id = v_booking.slot_id
     and partner_id = v_booking.partner_user_id
     and status = 'booked';
  if not found then
    raise exception 'Availability slot changed during cancellation.' using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true, 'already_cancelled', false,
    'cancellation_type', case when v_early then 'early' else 'late' end,
    'ticket_refunded', v_early, 'partner_rewarded', not v_early,
    'ticket_count', v_ticket_count
  );
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.claim_booking_notification(p_booking_id uuid DEFAULT NULL::uuid, p_event_type text DEFAULT NULL::text)
 RETURNS SETOF booking_notification_log
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and (b.is_test_session or b.learner_id::text is distinct from n.snapshot->>'learner_id'
        or b.partner_user_id::text is distinct from n.snapshot->>'partner_user_id'
        or (n.event_type = 'booking_confirmed' and (b.status is distinct from 'confirmed' or b.ticket_deducted is distinct from true))
        or (n.event_type = 'booking_cancelled' and (b.status is distinct from 'cancelled' or not coalesce(b.end_reason in ('user_cancelled_early', 'user_cancelled_late', 'partner_cancelled_early', 'partner_cancelled_late'), false))));
  select n.event_key into v_key from public.booking_notification_log n
    where (p_booking_id is null or n.booking_id = p_booking_id)
      and (p_event_type is null or n.event_type = p_event_type)
      and n.status in ('pending', 'failed', 'sending')
      and not exists(select 1 from public.bookings b where b.id=n.booking_id and b.is_test_session)
 and n.next_attempt_at <= pg_catalog.now()
      and (n.lease_until is null or n.lease_until < pg_catalog.now())
    order by n.created_at, n.event_key
    limit 1 for update skip locked;
  if v_key is null then return; end if;
  return query update public.booking_notification_log n
    set status = 'sending', attempts = n.attempts + 1, lease_token = pg_catalog.gen_random_uuid(), lease_until = pg_catalog.now() + interval '2 minutes'
    where n.event_key = v_key returning n.*;
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.complete_learner_session(p_booking_id uuid, p_end_reason text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_learner_id uuid;
  v_status text;
  v_scheduled_at timestamptz;
  v_partner_rewarded boolean;
  v_existing_reason text;
  v_end_reason text := coalesce(nullif(btrim(p_end_reason), ''), 'normal');
begin
  if exists(select 1 from public.bookings where id=p_booking_id and is_test_session) then
    return public.finish_test_session(p_booking_id,'learner',p_end_reason);
  end if;
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'message', '로그인이 필요합니다.');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'message', '세션을 찾을 수 없습니다.');
  end if;

  select learner_id, status, scheduled_at, partner_rewarded, end_reason
    into v_learner_id, v_status, v_scheduled_at, v_partner_rewarded, v_existing_reason
    from public.bookings
   where id = p_booking_id
   for update;

  if not found or v_learner_id is null or v_learner_id <> v_actor_id then
    return jsonb_build_object('success', false, 'message', '학습자 본인의 세션만 종료할 수 있습니다.');
  end if;

  if v_end_reason = 'normal' then
    if v_status not in ('confirmed', 'completed') then
      return jsonb_build_object('success', false, 'message', '정상 완료할 수 있는 예약 상태가 아닙니다.');
    end if;

    if v_scheduled_at is null or now() < v_scheduled_at + interval '25 minutes' then
      return jsonb_build_object('success', false, 'message', '라이브 대화 시간이 종료된 후에 완료할 수 있습니다.');
    end if;

    if v_status = 'completed'
       and not coalesce(v_partner_rewarded, false)
       and coalesce(v_existing_reason, '') <> 'normal' then
      return jsonb_build_object('success', false, 'message', '정상 완료로 변경할 수 없는 종료 상태입니다.');
    end if;

    update public.bookings
       set status = case when coalesce(partner_rewarded, false) then 'completed' else status end,
           end_reason = case
             when end_reason is null or end_reason = '' or end_reason = 'normal' then 'normal'
             else end_reason
           end,
           ended_at = coalesce(ended_at, now()),
           completed_at = case
             when coalesce(partner_rewarded, false) then coalesce(completed_at, now())
             else completed_at
           end,
           updated_at = now()
     where id = p_booking_id
       and learner_id = v_actor_id;

    return jsonb_build_object(
      'success', true,
      'status', case when coalesce(v_partner_rewarded, false) then 'completed' else v_status end,
      'awaiting_partner_reward', not coalesce(v_partner_rewarded, false)
    );
  end if;

  if v_status = 'completed' then
    return jsonb_build_object('success', true, 'status', 'completed');
  end if;

  update public.bookings
     set status = 'completed',
         end_reason = v_end_reason,
         ended_at = coalesce(ended_at, now()),
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where id = p_booking_id
     and learner_id = v_actor_id;

  return jsonb_build_object('success', true, 'status', 'completed');
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
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
 if exists(select 1 from public.bookings where id=p_booking_id and is_test_session) then
   if p_partner_user_id is distinct from auth.uid() then raise exception 'Partner identity mismatch.' using errcode='42501';end if; return public.finish_test_session(p_booking_id,'partner');
 end if;
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

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.deduct_ticket_and_confirm_booking(p_learner_id uuid, p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_profile_id uuid;
  v_tickets integer;
  v_status text;
  v_deducted boolean;
  v_slot_id uuid;
  v_booking_learner uuid;
  v_booking_partner uuid;
  v_booking_partner_user uuid;
  v_slot_partner uuid;
  v_slot_status text;
  v_slot_time text;
  v_scheduled_at timestamptz;
  v_allocation_id uuid;
  v_allocated_owner uuid;
  v_lot_id uuid;
begin
  if exists(select 1 from public.bookings where id=p_booking_id and is_test_session) then
    if p_learner_id is distinct from auth.uid() then raise exception 'User identity mismatch.' using errcode='42501';end if; return public.finish_test_session(p_booking_id,'confirm');
  end if;
  if v_actor_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'message', '濡쒓렇?몄씠 ?꾩슂?⑸땲??');
  end if;

  if p_learner_id is null
     or p_booking_id is null
     or p_learner_id <> v_actor_id then
    return pg_catalog.jsonb_build_object('success', false, 'message', '?숈뒿??蹂몄씤留??덉빟???뺤젙?????덉뒿?덈떎.');
  end if;

  select learner_id, partner_id, partner_user_id, slot_id, status, ticket_deducted
    into v_booking_learner, v_booking_partner, v_booking_partner_user,
         v_slot_id, v_status, v_deducted
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'message', '?ㅼ젣 ?덉빟 ID瑜?李얠쓣 ???놁뒿?덈떎.');
  end if;

  if v_booking_learner is null or v_booking_learner <> v_actor_id then
    return pg_catalog.jsonb_build_object('success', false, 'message', '?덉빟 ?뚯쑀?먭? ?쇱튂?섏? ?딆뒿?덈떎.');
  end if;

  if v_status in ('confirmed', 'completed') then
    if not coalesce(v_deducted, false) then
      raise exception 'Confirmed booking has no ticket deduction.' using errcode = '23514';
    end if;

    select a.id, l.user_id
      into v_allocation_id, v_allocated_owner
      from public.ticket_allocations a
      join public.ticket_lots l on l.id = a.ticket_lot_id
     where a.booking_id = p_booking_id
     for update of a;

    if v_allocation_id is null then
      if not exists (
        select 1 from public.ticket_consumption_pre_cutover_bookings
         where booking_id = p_booking_id
      ) then
        raise exception 'Confirmed booking has no ticket allocation.' using errcode = '23514';
      end if;
    elsif v_allocated_owner <> v_actor_id then
      raise exception 'Booking ticket allocation belongs to another user.' using errcode = '23514';
    end if;

    select ticket_count into v_tickets
      from public.profiles where id = v_actor_id;
    return pg_catalog.jsonb_build_object(
      'success', true, 'remaining_tickets', v_tickets,
      'message', '?대? ?뺤젙???덉빟?낅땲??'
    );
  end if;

  if v_status <> 'pending' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?뺤젙?????덈뒗 ?덉빟 ?곹깭媛 ?꾨떃?덈떎.');
  end if;

  if coalesce(v_deducted, false) then
    raise exception 'Pending booking already has a ticket deduction.' using errcode = '23514';
  end if;

  -- 049's trigger also enforces this at the status update. Check early so
  -- ordinary users cannot consume a lot while pre-open booking is disabled.

  if v_slot_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?덉빟 ?쒓컙 ?뺣낫瑜??뺤씤?????놁뒿?덈떎.');
  end if;

  if v_booking_partner is null
     or v_booking_partner_user is null
     or v_booking_partner <> v_booking_partner_user then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?덉빟 ?뚰듃???뺣낫媛 ?쇱튂?섏? ?딆뒿?덈떎.');
  end if;

  select partner_id, status, slot_time
    into v_slot_partner, v_slot_status, v_slot_time
    from public.availability_slots
   where id = v_slot_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?덉빟 ?쒓컙??李얠쓣 ???놁뒿?덈떎.');
  end if;

  if v_slot_status <> 'available' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?대? ?덉빟?섏뿀嫄곕굹 ?좏깮?????녿뒗 ?쒓컙?낅땲??');
  end if;

  if v_slot_partner <> v_booking_partner_user then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?덉빟 ?쒓컙???뚰듃???뺣낫媛 ?쇱튂?섏? ?딆뒿?덈떎.');
  end if;

  v_slot_time := pg_catalog.btrim(v_slot_time);

  if v_slot_time is null or v_slot_time = '' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?덉빟 ?쒓컙 ?뺤떇???뺤씤?????놁뒿?덈떎.');
  end if;

  if v_slot_time like 'weekly:%' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '諛섎났 媛?μ떆媛??쒗뵆由우? ?ㅼ젣 ?덉빟???ъ슜?????놁뒿?덈떎.');
  end if;

  if v_slot_time !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?덉빟 ?쒓컙 ?뺤떇???뺤씤?????놁뒿?덈떎.');
  end if;

  begin
    if v_slot_time ~* '(Z|[+-][0-9]{2}(:[0-9]{2}|[0-9]{2})?)$' then
      v_scheduled_at := v_slot_time::timestamptz;
    else
      v_scheduled_at := v_slot_time::timestamp at time zone 'Asia/Seoul';
    end if;
  exception when others then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '?덉빟 ?쒓컙 ?뺤떇???뺤씤?????놁뒿?덈떎.');
  end;

  -- Check the booking allocation before selecting a lot. A pending booking
  -- with an allocation is inconsistent, never an idempotent confirmation.
  select id into v_allocation_id
    from public.ticket_allocations
   where booking_id = p_booking_id
   for update;
  if found then
    raise exception 'Pending booking already has a ticket allocation.' using errcode = '23514';
  end if;

  -- Issuance locks the profile before touching lots. Taking the same lock
  -- before the FIFO lot prevents grant/consumption deadlocks and double spend.
  select id into v_profile_id
    from public.profiles
   where id = v_actor_id
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'message', '?꾨줈?꾩쓣 李얠쓣 ???놁뒿?덈떎.');
  end if;

  select id into v_lot_id
    from public.ticket_lots
   where user_id = v_actor_id
     and quantity_remaining > 0
     and (expires_at is null or expires_at > pg_catalog.now())
   order by expires_at asc nulls last, issued_at asc nulls last, id asc
   limit 1
   for update;

  if v_lot_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', 0,
      'message', '蹂댁쑀 ?곗폆??遺議깊빀?덈떎.');
  end if;

  update public.ticket_lots
     set quantity_remaining = quantity_remaining - 1,
         updated_at = pg_catalog.now()
   where id = v_lot_id
     and user_id = v_actor_id
     and quantity_remaining > 0
     and (expires_at is null or expires_at > pg_catalog.now());
  if not found then
    raise exception 'Ticket lot changed while confirming the booking.' using errcode = '40001';
  end if;

  insert into public.ticket_allocations (booking_id, ticket_lot_id, quantity)
  values (p_booking_id, v_lot_id, 1);

  v_tickets := public.refresh_ticket_balance_cache(v_actor_id);

  update public.bookings
     set status = 'confirmed',
         ticket_deducted = true,
         scheduled_at = v_scheduled_at,
         updated_at = pg_catalog.now()
   where id = p_booking_id
     and learner_id = v_actor_id
     and status = 'pending'
     and ticket_deducted = false;
  if not found then
    raise exception 'Booking confirmation state changed while deducting a ticket.'
      using errcode = '40001';
  end if;

  update public.availability_slots
     set status = 'booked',
         updated_at = pg_catalog.now()
   where id = v_slot_id
     and partner_id = v_booking_partner_user
     and status = 'available';
  if not found then
    raise exception 'Availability slot state changed while confirming the booking.'
      using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'remaining_tickets', v_tickets,
    'message', '?덉빟???뺤젙?섏뿀?듬땲??'
  );
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.enforce_booking_four_hour_minimum()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_slot_time text;
  v_scheduled_at timestamptz;
begin
  if new.is_test_session then return new;end if;
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      select pg_catalog.btrim(slot_time) into v_slot_time
        from public.availability_slots
       where id = new.slot_id;
      if v_slot_time is null or v_slot_time !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
         or v_slot_time like 'weekly:%' then
        raise exception 'A concrete booking slot is required.' using errcode = '23514';
      end if;
      begin
        if v_slot_time ~* '(Z|[+-][0-9]{2}(:[0-9]{2}|[0-9]{2})?)$' then
          v_scheduled_at := v_slot_time::timestamptz;
        else
          v_scheduled_at := v_slot_time::timestamp at time zone 'Asia/Seoul';
        end if;
      exception when others then
        raise exception 'Booking slot time is invalid.' using errcode = '22007';
      end;
    elsif new.status = 'confirmed' then
      v_scheduled_at := new.scheduled_at;
    else
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if (old.status = 'pending' and new.status = 'confirmed')
       or (old.status = 'confirmed' and new.status = 'confirmed'
           and new.scheduled_at is distinct from old.scheduled_at) then
      v_scheduled_at := new.scheduled_at;
    else
      return new;
    end if;
  else
    return new;
  end if;

  if v_scheduled_at is null then
    raise exception 'A scheduled booking time is required.' using errcode = '23514';
  end if;

  -- Reuse 049's existing pre-open internal/admin/service test gate. This
  -- exempts only the lead time, not the concrete slot requirement above.
  if not public.dayo_can_bypass_booking_lead_time()
     and v_scheduled_at < pg_catalog.clock_timestamp() + interval '4 hours' then
    raise exception 'New bookings require at least four hours before the session.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.enforce_booking_monthly_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_start timestamptz;v_day date;v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;v_override public.partner_availability_overrides;v_partner uuid;
begin
  if new.is_test_session then return new;end if;
  if tg_op='UPDATE' and not ((old.status='pending' and new.status='confirmed') or (new.status in ('pending','confirmed') and (new.slot_id is distinct from old.slot_id or new.scheduled_at is distinct from old.scheduled_at))) then return new;end if;
  if new.status not in ('pending','confirmed') then return new;end if;
  select public.availability_kst_start(slot_time),partner_id into v_start,v_partner from public.availability_slots where id=new.slot_id;
  if v_start is null then raise exception 'Concrete slot required' using errcode='23514';end if;
  v_day:=(v_start at time zone 'Asia/Seoul')::date;
  if v_day<v_today or v_day>v_today+29 then raise exception 'Bookings open through the next 30 KST days' using errcode='23514';end if;
  select * into v_override from public.partner_availability_overrides where partner_id=v_partner and date=v_day;
  if v_override.mode='closed' or (v_override.mode='custom' and not(to_char(v_start at time zone 'Asia/Seoul','HH24:MI')=any(v_override.custom_slots))) then raise exception 'This date is no longer open' using errcode='23514';end if;
  return new;
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.enqueue_booking_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event text;
  v_snapshot jsonb;
  v_cancellation public.partner_booking_cancellations%rowtype;
begin
 if new.is_test_session then return new;end if;
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
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.get_booking_calendar_slots(p_partner_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_partner uuid;v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
  if p_partner_ids is null or cardinality(p_partner_ids)>100 then raise exception 'Invalid partner selection' using errcode='22023';end if;
  for v_partner in select distinct p.id from public.profiles p where p.id=any(p_partner_ids) and p.role='partner' order by p.id loop
    perform public.refresh_partner_monthly_slots(v_partner,false);
  end loop;
  -- A single JSON result avoids PostgREST's default row cap truncating calendar dates.
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'partner_id',s.partner_id,'slot_time',s.slot_time,'status',s.status)
    order by public.availability_kst_start(s.slot_time),s.partner_id,s.id),'[]'::jsonb) into v_result
    from public.availability_slots s join public.profiles p on p.id=s.partner_id
    where s.partner_id=any(p_partner_ids) and p.role='partner' and s.status='available'
      and public.availability_kst_start(s.slot_time)>clock_timestamp()
      and (public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul')::date between v_today and v_today+29
      and not exists(select 1 from public.bookings b where b.partner_id=s.partner_id and b.status='confirmed' and not b.is_test_session and b.scheduled_at=public.availability_kst_start(s.slot_time));
  return v_result;
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.get_partner_monthly_schedule()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='partner') then raise exception 'Partner access required' using errcode='42501';end if;
  perform public.refresh_partner_monthly_slots(v_uid,false);
  select jsonb_build_object('start',v_today,'end',v_today+29,
    'weekly',coalesce((select jsonb_agg(jsonb_build_object('dayId',split_part(substr(slot_time,8),'|',1),'time',split_part(slot_time,'|',2))) from public.availability_slots where partner_id=v_uid and slot_time like 'weekly:%'),'[]'::jsonb),
    'overrides',coalesce((select jsonb_agg(to_jsonb(o)) from public.partner_availability_overrides o where partner_id=v_uid and date between v_today and v_today+29),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'slot_time',s.slot_time,'status',s.status,'reserved',exists(select 1 from public.bookings b where b.status='confirmed' and not b.is_test_session and (b.slot_id=s.id or (b.partner_id=s.partner_id and b.scheduled_at=public.availability_kst_start(s.slot_time)))))) from public.availability_slots s where partner_id=v_uid and (public.availability_kst_start(slot_time) at time zone 'Asia/Seoul')::date between v_today and v_today+29),'[]'::jsonb)) into v_result;
  return v_result;
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.refresh_partner_monthly_slots(p_partner uuid, p_replace_default boolean DEFAULT false, p_only_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date; v_day date; v_mode text; v_times text[];
  v_time text; v_start timestamptz; v_active boolean; v_dow text; v_existing uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_partner::text,83));
  select role='partner' into v_active from public.profiles where id=p_partner;
  for v_day in select (v_today+i)::date from generate_series(0,29) i where p_only_date is null or v_today+i=p_only_date loop
    v_mode:=null;v_times:='{}';
    select mode,custom_slots into v_mode,v_times from public.partner_availability_overrides where partner_id=p_partner and date=v_day;
    if v_mode is null or v_mode='default' then
      v_dow:=(array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from v_day)::integer+1];
      select coalesce(array_agg(distinct split_part(slot_time,'|',2)),'{}') into v_times from public.availability_slots
        where partner_id=p_partner and slot_time like 'weekly:'||v_dow||'|%'
          and split_part(slot_time,'|',2) ~ '^(08:30|09:(00|30)|1[0-9]:(00|30)|2[0-2]:(00|30)|23:00)$';
    elsif v_mode='closed' then v_times:='{}'; end if;
    -- Row predicates are rechecked after booking RPC locks; never mutate booked slots.
    if v_mode in ('closed','custom') or p_replace_default then
      update public.availability_slots s set status='hidden',updated_at=now()
        where s.partner_id=p_partner and s.status='available'
          and (public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul')::date=v_day
          and public.availability_kst_start(s.slot_time)>clock_timestamp()
          and not(to_char(public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul','HH24:MI')=any(v_times));
    end if;
    if coalesce(v_active,false) then
      foreach v_time in array coalesce(v_times,'{}') loop
        v_start:=(v_day+v_time::time) at time zone 'Asia/Seoul';
        if v_start<=clock_timestamp() or exists(select 1 from public.bookings b where b.partner_id=p_partner and b.status='confirmed' and not b.is_test_session and b.scheduled_at=v_start) then continue; end if;
        select s.id into v_existing from public.availability_slots s where s.partner_id=p_partner and public.availability_kst_start(s.slot_time)=v_start order by s.id limit 1 for update;
        if found then
          update public.availability_slots set status='available',updated_at=now() where id=v_existing and status='hidden';
        else
          insert into public.availability_slots(partner_id,slot_time,status) values(p_partner,to_char(v_start at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS'),'available') on conflict(partner_id,slot_time) do nothing;
        end if;
      end loop;
    end if;
  end loop;
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.refund_booking_ticket(p_booking_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_learner_id uuid;
  v_partner_id uuid;
  v_deducted boolean;
  v_refunded boolean;
  v_allocation public.ticket_allocations%rowtype;
  v_lot public.ticket_lots%rowtype;
  v_has_allocation boolean;
  v_ticket_count integer;
begin
  if exists(select 1 from public.bookings where id=p_booking_id and is_test_session) then
    if p_reason is null or p_reason not in ('tech_issue','safety_report') then raise exception 'Invalid booking refund request.' using errcode='42501';end if;
    return public.finish_test_session(p_booking_id,'refund');
  end if;
  if v_actor_id is null or p_booking_id is null or p_reason is null
     or p_reason not in ('tech_issue', 'safety_report') then
    raise exception 'Invalid booking refund request.' using errcode = '42501';
  end if;

  select learner_id, partner_user_id, ticket_deducted, ticket_refunded
    into v_learner_id, v_partner_id, v_deducted, v_refunded
    from public.bookings
   where id = p_booking_id
   for update;

  if not found
     or (v_actor_id is distinct from v_learner_id
         and v_actor_id is distinct from v_partner_id) then
    raise exception 'Booking participant access is required.' using errcode = '42501';
  end if;

  select * into v_allocation
    from public.ticket_allocations
   where booking_id = p_booking_id
   for update;
  v_has_allocation := found;

  if not v_has_allocation then
    if coalesce(v_refunded, false) and not coalesce(v_deducted, false) then
      raise exception 'Booking refund state has no ticket deduction.' using errcode = '23514';
    end if;

    if coalesce(v_deducted, false) then
      if not exists (
        select 1 from public.ticket_consumption_pre_cutover_bookings
         where booking_id = p_booking_id
      ) then
        raise exception 'Deducted booking has no ticket allocation.' using errcode = '23514';
      end if;

      select ticket_count into v_ticket_count
        from public.profiles where id = v_learner_id;

      -- 054 discarded every fake legacy entitlement. Historical bookings
      -- cannot restore a lot that never had an allocation. Keep the session
      -- incident report, but require explicit admin review for compensation.
      return pg_catalog.jsonb_build_object(
        'refunded', coalesce(v_refunded, false),
        'already_refunded', coalesce(v_refunded, false),
        'refund_unavailable', not coalesce(v_refunded, false),
        'refund_code', 'historical_no_allocation',
        'ticket_count', v_ticket_count
      );
    end if;

    select ticket_count into v_ticket_count
      from public.profiles where id = v_learner_id;
    return pg_catalog.jsonb_build_object(
      'refunded', false, 'already_refunded', false,
      'refund_unavailable', false, 'ticket_count', v_ticket_count
    );
  end if;

  if not coalesce(v_deducted, false) then
    raise exception 'Ticket allocation exists without booking deduction.' using errcode = '23514';
  end if;

  -- 055 grants and 056 consumption lock profile before lot. Match that order
  -- after booking/allocation to prevent a grant/refund deadlock.
  perform 1 from public.profiles where id = v_learner_id for update;
  if not found then
    raise exception 'Learner profile not found.' using errcode = 'P0002';
  end if;

  select * into v_lot
    from public.ticket_lots
   where id = v_allocation.ticket_lot_id
   for update;
  if not found or v_lot.user_id is distinct from v_learner_id
     or v_allocation.quantity is distinct from 1 then
    raise exception 'Ticket allocation does not belong to the learner lot.' using errcode = '23514';
  end if;

  if coalesce(v_refunded, false) is distinct from (v_allocation.refunded_at is not null) then
    raise exception 'Booking and allocation refund state disagree.' using errcode = '23514';
  end if;

  if v_allocation.refunded_at is not null then
    select ticket_count into v_ticket_count
      from public.profiles where id = v_learner_id;
    return pg_catalog.jsonb_build_object(
      'refunded', true, 'already_refunded', true,
      'refund_unavailable', false, 'ticket_count', v_ticket_count
    );
  end if;

  if v_lot.quantity_remaining >= v_lot.quantity_issued then
    raise exception 'Original ticket lot has no room for a refund.' using errcode = '23514';
  end if;

  update public.ticket_lots
     set quantity_remaining = quantity_remaining + 1,
         updated_at = pg_catalog.now()
   where id = v_lot.id
     and quantity_remaining < quantity_issued;
  if not found then
    raise exception 'Ticket lot changed while refunding.' using errcode = '40001';
  end if;

  update public.ticket_allocations
     set refunded_at = pg_catalog.now(),
         refund_reason = p_reason
   where id = v_allocation.id
     and booking_id = p_booking_id
     and refunded_at is null;
  if not found then
    raise exception 'Ticket allocation changed while refunding.' using errcode = '40001';
  end if;

  update public.bookings
     set ticket_refunded = true,
         updated_at = pg_catalog.now()
   where id = p_booking_id
     and ticket_refunded = false;
  if not found then
    raise exception 'Booking refund state changed.' using errcode = '40001';
  end if;

  -- The helper excludes expired lots, so an expired restore remains in audit
  -- history without granting a new usable ticket or extending its expiry.
  v_ticket_count := public.refresh_ticket_balance_cache(v_learner_id);

  return pg_catalog.jsonb_build_object(
    'refunded', true, 'already_refunded', false,
    'refund_unavailable', false, 'ticket_count', v_ticket_count
  );
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.resolve_tech_issue_report(p_report_id uuid, p_refund_user boolean, p_reward_partner boolean, p_resolution_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_reason text := pg_catalog.btrim(coalesce(p_resolution_reason, ''));
  v_booking_id uuid;
  v_booking public.bookings%rowtype;
  v_report public.session_tech_issue_reports%rowtype;
  v_allocation public.ticket_allocations%rowtype;
  v_lot public.ticket_lots%rowtype;
  v_ticket_count integer;
  v_partner_points integer;
  v_decision text;
  v_end_reason text;
  v_resolved_count integer;
begin
  if not public.dayo_is_admin() then raise exception 'Admin access is required.' using errcode='42501';end if;
  if (p_refund_user or p_reward_partner) and exists(select 1 from public.bookings b join public.session_tech_issue_reports r on r.booking_id=b.id where r.id=p_report_id and b.is_test_session) then raise exception 'Test sessions cannot refund or reward.' using errcode='23514';end if;
  if v_admin_id is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_report_id is null or p_refund_user is null or p_reward_partner is null
     or v_reason = '' or pg_catalog.char_length(v_reason) > 1000 then
    raise exception 'Report, both decisions, and a reason (1-1000 characters) are required.'
      using errcode = '22023';
  end if;

  -- 060 reporter flow locks booking before touching its report. Resolve in
  -- the same order to avoid a reporter/admin deadlock. Booking lock also
  -- serializes resolutions initiated from either participant's report row.
  select booking_id into v_booking_id
    from public.session_tech_issue_reports where id = p_report_id;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'report_not_found');
  end if;
  select * into v_booking from public.bookings
   where id = v_booking_id for update;
  if not found then
    raise exception 'Technical incident booking is missing.' using errcode = '23514';
  end if;
  select * into v_report from public.session_tech_issue_reports
   where id = p_report_id and booking_id = v_booking_id for update;
  if not found then
    raise exception 'Technical incident changed during resolution.' using errcode = '40001';
  end if;
  if v_report.decision <> 'manual_review'
     or exists (
       select 1 from public.session_tech_issue_reports
        where booking_id = v_booking_id and decision <> 'manual_review'
     ) then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'already_resolved');
  end if;
  if v_booking.status is distinct from 'cancelled'
     or v_booking.end_reason not in (
       'tech_issue_review', 'partner_no_show_review', 'learner_no_show_review'
     ) or v_booking.ended_at is null or v_booking.completed_at is not null then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'booking_not_in_review');
  end if;
  if v_booking.ticket_refunded is distinct from false
     or v_booking.partner_rewarded is distinct from false then
    raise exception 'Booking has already been refunded or rewarded.' using errcode = '23514';
  end if;

  select * into v_allocation from public.ticket_allocations
   where booking_id = v_booking_id for update;
  if found then
    if v_allocation.quantity is distinct from 1 or v_allocation.refunded_at is not null
       or v_allocation.refund_reason is not null then
      raise exception 'Ticket allocation is already refunded or inconsistent.'
        using errcode = '23514';
    end if;
  elsif p_refund_user then
    raise exception 'Cannot refund a booking without its original allocation.'
      using errcode = '23514';
  end if;

  if p_refund_user then
    if v_booking.ticket_deducted is distinct from true then
      raise exception 'Booking has no deducted ticket.' using errcode = '23514';
    end if;
    -- Match 055-057 lock order: booking, allocation, learner profile, lot.
    perform 1 from public.profiles where id = v_booking.learner_id for update;
    if not found then
      raise exception 'Learner profile is missing.' using errcode = 'P0002';
    end if;
    select * into v_lot from public.ticket_lots
     where id = v_allocation.ticket_lot_id for update;
    if not found or v_lot.user_id is distinct from v_booking.learner_id
       or v_lot.quantity_remaining >= v_lot.quantity_issued then
      raise exception 'Original ticket lot cannot be restored.' using errcode = '23514';
    end if;
    update public.ticket_lots
       set quantity_remaining = quantity_remaining + 1,
           updated_at = pg_catalog.now()
     where id = v_lot.id and quantity_remaining < quantity_issued;
    if not found then
      raise exception 'Ticket lot changed during resolution.' using errcode = '40001';
    end if;
    update public.ticket_allocations
       set refunded_at = pg_catalog.now(),
           refund_reason = 'tech_issue_manual_approved'
     where id = v_allocation.id and refunded_at is null;
    if not found then
      raise exception 'Allocation changed during resolution.' using errcode = '40001';
    end if;
    -- The original expires_at is untouched; an already-expired lot does not
    -- become a newly usable ticket when its quantity is restored.
    v_ticket_count := public.refresh_ticket_balance_cache(v_booking.learner_id);
  end if;

  if p_reward_partner then
    if v_booking.partner_user_id is null then
      raise exception 'Booking partner is missing.' using errcode = '23514';
    end if;
    select point_balance into v_partner_points from public.profiles
     where id = v_booking.partner_user_id and role = 'partner' for update;
    if not found then
      raise exception 'Partner profile is missing.' using errcode = 'P0002';
    end if;
    update public.profiles
       set point_balance = coalesce(point_balance, 0) + 6000,
           updated_at = pg_catalog.now()
     where id = v_booking.partner_user_id and role = 'partner'
     returning point_balance into v_partner_points;
    if not found then
      raise exception 'Partner reward changed during resolution.' using errcode = '40001';
    end if;
  end if;

  v_decision := case when p_refund_user or p_reward_partner then 'approved' else 'rejected' end;
  v_end_reason := case
    when v_booking.end_reason = 'partner_no_show_review' then 'partner_no_show_resolved'
    when v_booking.end_reason = 'learner_no_show_review' then 'learner_no_show_resolved'
    when v_decision = 'approved' then 'tech_issue_approved'
    else 'tech_issue_rejected'
  end;
  -- Resolution changes the financial flags and reason, never the cancelled
  -- terminal status or completed_at of this non-completed conversation.
  update public.bookings
     set ticket_refunded = p_refund_user,
         partner_rewarded = p_reward_partner,
         end_reason = v_end_reason,
         updated_at = pg_catalog.now()
   where id = v_booking_id and status = 'cancelled'
     and end_reason = v_booking.end_reason
     and ticket_refunded = false and partner_rewarded = false;
  if not found then
    raise exception 'Booking changed during resolution.' using errcode = '40001';
  end if;

  -- Resolve both participant reports together: a second report ID cannot
  -- later award the same booking a second ticket or another 6,000P.
  update public.session_tech_issue_reports
     set decision = v_decision,
         user_refund_decision = p_refund_user,
         partner_reward_decision = p_reward_partner,
         resolution_reason = v_reason,
         resolved_by = v_admin_id,
         resolved_at = pg_catalog.now()
   where booking_id = v_booking_id and decision = 'manual_review';
  get diagnostics v_resolved_count = row_count;
  if v_resolved_count < 1 then
    raise exception 'No pending report remained for resolution.' using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true, 'booking_id', v_booking_id,
    'decision', v_decision, 'user_refunded', p_refund_user,
    'partner_rewarded', p_reward_partner,
    'ticket_count', v_ticket_count, 'partner_points', v_partner_points,
    'end_reason', v_end_reason, 'reports_resolved', v_resolved_count
  );
end;
$function$
;

-- Existing production function; only TEST branching/filtering added.
CREATE OR REPLACE FUNCTION public.sync_confirmed_booking_preferences()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.is_test_session then return new;end if;
  if old.status='pending' and new.status='confirmed' and new.matching_snapshot is not null then
    insert into public.user_conversation_preferences(user_id,interests,language,korean_support_preference,conversation_style,purposes,source_booking_id)
      values(new.learner_id,array(select jsonb_array_elements_text(new.conversation_brief->'interests')),new.language,
        new.conversation_brief->>'korean_support_preference',new.conversation_brief->>'conversation_style',
        array(select jsonb_array_elements_text(new.conversation_brief->'purposes')),new.id)
      on conflict(user_id) do update set interests=excluded.interests,language=excluded.language,
        korean_support_preference=excluded.korean_support_preference,conversation_style=excluded.conversation_style,
        purposes=excluded.purposes,source_booking_id=excluded.source_booking_id
      where user_conversation_preferences.source_booking_id is null or
        exists(select 1 from public.bookings b where b.id=user_conversation_preferences.source_booking_id and (b.created_at,b.id)<=(new.created_at,new.id));
  end if;
  return new;
end $function$
;

-- TEST sessions never appear as occupied normal capacity in Admin either.
CREATE OR REPLACE FUNCTION public.get_admin_partner_availability(p_partner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Asia/Seoul')::date;
  v_available jsonb;
  v_slots jsonb;
  v_languages text[];
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_partner_id is null or not exists (
    select 1 from public.profiles where id=p_partner_id and role='partner'
  ) then raise exception 'Partner profile not found' using errcode='P0002'; end if;
  v_available := public.get_booking_calendar_slots(array[p_partner_id]);
  select conversation_languages into v_languages from public.partner_capabilities
    where partner_id=p_partner_id;
  select coalesce(jsonb_agg(row order by starts_at,status),'[]'::jsonb) into v_slots
  from (
    select jsonb_build_object('id',x->>'id','slot_time',x->>'slot_time','status','available') row,
      public.availability_kst_start(x->>'slot_time') starts_at, 'available' status
    from jsonb_array_elements(v_available) x
    where public.availability_kst_start(x->>'slot_time') >= v_now + interval '4 hours'
      and coalesce(v_languages && array['en','es','fr','ko']::text[],false)
      and not exists (select 1 from public.bookings b where b.status='confirmed' and not b.is_test_session
        and (b.slot_id=(x->>'id')::uuid or (b.partner_id=p_partner_id
          and b.scheduled_at=public.availability_kst_start(x->>'slot_time'))))
    union all
    select jsonb_build_object('id',s.id,'slot_time',s.slot_time,'status','booked'),
      public.availability_kst_start(s.slot_time), 'booked'
    from public.availability_slots s
    where s.partner_id=p_partner_id
      and public.availability_kst_start(s.slot_time)>v_now
      and (public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul')::date between v_today and v_today+29
      and (s.status='booked' or exists (select 1 from public.bookings b where b.status='confirmed' and not b.is_test_session
        and (b.slot_id=s.id or (b.partner_id=p_partner_id and b.scheduled_at=public.availability_kst_start(s.slot_time)))))
  ) effective;
  return jsonb_build_object('partner_id',p_partner_id,'start',v_today,'end',v_today+29,
    'as_of',v_now,'min_lead_hours',4,'capability_configured',coalesce(v_languages && array['en','es','fr','ko']::text[],false),
    'slots',v_slots);
end;
$function$
;
commit;
