-- Stage 5: restore a consumed ticket to its original lot on session refunds.
-- Requires 055 issuance and 056 consumption. No new ticket/expiry is created.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.refresh_ticket_balance_cache(uuid)') is null
     or pg_catalog.to_regclass('public.ticket_consumption_pre_cutover_bookings') is null then
    raise exception 'Apply 055 issuance and 056 consumption before 057 refunds.';
  end if;
end;
$$;

-- Wait for any in-flight legacy refund before replacing the tech-issue writer
-- and closing the unused legacy safety-report entry point.
lock table public.bookings in share row exclusive mode;

-- Internal only. Both caller RPCs verify the current booking participant;
-- this function repeats that check and accepts only the two refund reasons.
create function public.refund_booking_ticket(
  p_booking_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.refund_booking_ticket(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.report_session_tech_issue(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_refund jsonb;
begin
  perform 1 from public.bookings
   where id = p_booking_id
     and (learner_id = v_actor_id or partner_user_id = v_actor_id)
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'message', '세션을 찾을 수 없습니다.');
  end if;

  v_refund := public.refund_booking_ticket(p_booking_id, 'tech_issue');

  update public.bookings
     set status = 'tech_issue',
         end_reason = 'tech_issue',
         ended_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = p_booking_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'ticket_count', v_refund->'ticket_count',
    'refunded', v_refund->'refunded',
    'refund_unavailable', v_refund->'refund_unavailable',
    'refund_code', v_refund->'refund_code'
  );
end;
$$;

revoke all on function public.report_session_tech_issue(uuid)
  from public, anon, authenticated, service_role;
-- Retire the unused legacy entry point without changing the live report-only RPC.
do $$
begin
  if pg_catalog.to_regprocedure('public.submit_safety_report(uuid,uuid,text,jsonb)') is not null then
    execute 'revoke all on function public.submit_safety_report(uuid, uuid, text, jsonb)
      from public, anon, authenticated, service_role';
  end if;
end;
$$;
grant execute on function public.report_session_tech_issue(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
