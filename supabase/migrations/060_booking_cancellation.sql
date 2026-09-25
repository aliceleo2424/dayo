-- Learner-initiated cancellation of a future confirmed, lot-backed booking.
-- Apply after 055-057. Close the automatic tech-issue refund bypass and
-- collect booking-scoped incidents for manual review. Safety reporting is unchanged.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.refresh_ticket_balance_cache(uuid)') is null
     or pg_catalog.to_regprocedure('public.refund_booking_ticket(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.report_session_tech_issue(uuid)') is null then
    raise exception 'Apply the 055-057 ticket lot cutover before booking cancellation.';
  end if;
end;
$$;

-- Technical incidents are distinct from safety reports. Client telemetry is
-- retained only as review evidence, never treated as proof of failed media.
create table public.session_tech_issue_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  reporter_user_id uuid not null references auth.users(id),
  reporter_role text not null check (reporter_role in ('learner', 'partner')),
  issue_type text not null check (issue_type in (
    'cannot_hear_partner', 'partner_cannot_hear_me',
    'cannot_see_partner', 'partner_cannot_see_me',
    'connection_unstable', 'counterpart_absent', 'other'
  )),
  detail text check (char_length(detail) <= 300),
  reported_at timestamptz not null default pg_catalog.now(),
  scheduled_at timestamptz not null,
  decision text not null check (decision in ('approved', 'rejected', 'manual_review')),
  evidence jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(evidence) = 'object'),
  unique (booking_id, reporter_user_id)
);

create index session_tech_issue_reports_booking_time_idx
  on public.session_tech_issue_reports (booking_id, reported_at);
create index session_tech_issue_reports_decision_time_idx
  on public.session_tech_issue_reports (decision, reported_at);

alter table public.session_tech_issue_reports enable row level security;
revoke all on table public.session_tech_issue_reports
  from public, anon, authenticated;
grant select on table public.session_tech_issue_reports to authenticated;
grant all on table public.session_tech_issue_reports to service_role;
create policy "session_tech_issue_reports_admin_read"
  on public.session_tech_issue_reports for select to authenticated
  using (public.dayo_is_admin());

create function public.cancel_my_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  v_early := v_booking.scheduled_at >= v_now + interval '6 hours';
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
$$;

-- Close the one-argument 057 auto-refund entry point. A caller must describe
-- the issue through the reviewed report path below.
create or replace function public.report_session_tech_issue(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return pg_catalog.jsonb_build_object(
    'success', false, 'code', 'issue_details_required',
    'message', '문제 유형을 선택해 신고해 주세요.'
  );
end;
$$;

-- The existing 048 telemetry proves that a participant sent an event, not
-- that media failed. Never refund or reward from absence of media_connected.
create function public.report_session_tech_issue(
  p_booking_id uuid,
  p_issue_type text,
  p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_existing public.session_tech_issue_reports%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_issue_type text := pg_catalog.btrim(coalesce(p_issue_type, ''));
  v_detail text := nullif(pg_catalog.btrim(coalesce(p_detail, '')), '');
  v_role text;
  v_evidence jsonb;
  v_end_reason text;
begin
  if v_actor_id is null or p_booking_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'not_participant');
  end if;
  if v_issue_type not in (
    'cannot_hear_partner', 'partner_cannot_hear_me',
    'cannot_see_partner', 'partner_cannot_see_me',
    'connection_unstable', 'counterpart_absent', 'other'
  ) or (v_detail is not null and pg_catalog.char_length(v_detail) > 300) then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_issue');
  end if;

  select * into v_booking from public.bookings
   where id = p_booking_id
     and (learner_id = v_actor_id or partner_user_id = v_actor_id)
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'not_participant');
  end if;
  v_role := case when v_booking.learner_id = v_actor_id then 'learner' else 'partner' end;

  select * into v_existing from public.session_tech_issue_reports
   where booking_id = p_booking_id and reporter_user_id = v_actor_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'success', true, 'decision', v_existing.decision,
      'issue_type', v_existing.issue_type, 'already_reported', true,
      'refunded', v_booking.ticket_refunded,
      'partner_rewarded', v_booking.partner_rewarded
    );
  end if;

  if (v_booking.status = 'cancelled'
      and coalesce(v_booking.end_reason, '') not in (
        'tech_issue_review', 'partner_no_show_review', 'learner_no_show_review'
      ))
     or v_booking.end_reason in ('user_cancelled_early', 'user_cancelled_late') then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'booking_cancelled');
  end if;
  if v_booking.status = 'tech_issue' and v_booking.end_reason = 'tech_issue' then
    return pg_catalog.jsonb_build_object(
      'success', true, 'decision', 'approved', 'already_reported', true,
      'refunded', v_booking.ticket_refunded,
      'partner_rewarded', v_booking.partner_rewarded
    );
  end if;
  if v_booking.ticket_refunded is true then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'already_refunded');
  end if;
  -- A second participant can add their own report while review is pending.
  if not (v_booking.status = 'confirmed'
          and v_booking.ended_at is null
          and v_booking.completed_at is null
          and nullif(pg_catalog.btrim(v_booking.end_reason), '') is null)
     and not (v_booking.status = 'cancelled'
              and v_booking.end_reason in (
                'tech_issue_review', 'partner_no_show_review', 'learner_no_show_review'
              )) then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'booking_terminal');
  end if;
  if v_booking.scheduled_at is null
     or v_now < v_booking.scheduled_at - interval '10 minutes'
     or v_now > v_booking.scheduled_at + interval '10 minutes' then
    return pg_catalog.jsonb_build_object(
      'success', false, 'code', 'tech_issue_window_closed',
      'message', '기술 문제 자동 처리 가능 시간이 아닙니다. 도움이 필요하면 문의해 주세요.'
    );
  end if;

  select pg_catalog.jsonb_build_object(
    'learner_room_entered', count(*) filter (
      where event_type = 'room_entered' and actor_user_id = v_booking.learner_id),
    'partner_room_entered', count(*) filter (
      where event_type = 'room_entered' and actor_user_id = v_booking.partner_user_id),
    'learner_media_connected', count(*) filter (
      where event_type = 'media_connected' and actor_user_id = v_booking.learner_id),
    'partner_media_connected', count(*) filter (
      where event_type = 'media_connected' and actor_user_id = v_booking.partner_user_id)
  ) into v_evidence
  from public.session_events where booking_id = p_booking_id
    and event_type in ('room_entered', 'media_connected');

  -- Review is deliberately conservative: 048 has no verifiable failed-media
  -- event, and an absent best-effort success event is not failure evidence.
  v_end_reason := case
    when v_booking.status = 'cancelled' then v_booking.end_reason
    when v_issue_type = 'counterpart_absent' and v_role = 'learner'
      then 'partner_no_show_review'
    when v_issue_type = 'counterpart_absent' and v_role = 'partner'
      then 'learner_no_show_review'
    else 'tech_issue_review'
  end;

  insert into public.session_tech_issue_reports (
    booking_id, reporter_user_id, reporter_role, issue_type, detail,
    reported_at, scheduled_at, decision, evidence
  ) values (
    p_booking_id, v_actor_id, v_role, v_issue_type, v_detail,
    v_now, v_booking.scheduled_at, 'manual_review', v_evidence
  );

  if v_booking.status = 'confirmed' then
    -- A cancelled booking is terminal for room entry and cannot be rewarded
    -- by the normal 045 completion RPC while review is pending.
    -- completed_at stays null because this was not a completed conversation.
    update public.bookings
       set status = 'cancelled', end_reason = v_end_reason,
           ended_at = v_now, updated_at = v_now
     where id = p_booking_id and status = 'confirmed'
       and ended_at is null and completed_at is null
       and nullif(pg_catalog.btrim(end_reason), '') is null;
    if not found then
      raise exception 'Booking changed while reporting a tech issue.' using errcode = '40001';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true, 'decision', 'manual_review',
    'issue_type', v_issue_type, 'end_reason', v_end_reason,
    'refunded', false, 'partner_rewarded', false,
    'no_show_candidate', v_issue_type = 'counterpart_absent'
  );
end;
$$;

revoke all on function public.cancel_my_booking(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_my_booking(uuid) to authenticated;
revoke all on function public.report_session_tech_issue(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.report_session_tech_issue(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.report_session_tech_issue(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
