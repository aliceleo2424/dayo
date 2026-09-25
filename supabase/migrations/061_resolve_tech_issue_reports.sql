-- Stage 061: admin-only, booking-scoped resolution of 060 technical incidents.
-- No automatic approval is inferred from best-effort 048 session telemetry.
begin;

do $$
begin
  if pg_catalog.to_regclass('public.session_tech_issue_reports') is null
     or pg_catalog.to_regprocedure('public.refresh_ticket_balance_cache(uuid)') is null then
    raise exception 'Apply 055-060 before technical incident resolution.';
  end if;
end;
$$;

alter table public.session_tech_issue_reports
  add column user_refund_decision boolean,
  add column partner_reward_decision boolean,
  add column resolution_reason text,
  add column resolved_by uuid references auth.users(id),
  add column resolved_at timestamptz;

alter table public.session_tech_issue_reports
  add constraint session_tech_issue_resolution_state_check check (
    (
      decision = 'manual_review'
      and user_refund_decision is null
      and partner_reward_decision is null
      and resolution_reason is null
      and resolved_by is null
      and resolved_at is null
    ) or (
      decision in ('approved', 'rejected')
      and user_refund_decision is not null
      and partner_reward_decision is not null
      and resolution_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(resolution_reason)) between 1 and 1000
      and resolved_by is not null
      and resolved_at is not null
      and decision = case when user_refund_decision or partner_reward_decision
        then 'approved' else 'rejected' end
    )
  );

create function public.resolve_tech_issue_report(
  p_report_id uuid,
  p_refund_user boolean,
  p_reward_partner boolean,
  p_resolution_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.resolve_tech_issue_report(uuid, boolean, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_tech_issue_report(uuid, boolean, boolean, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
