-- Enforce the four-hour booking lead time and make only cancellations made
-- more than six hours before start refundable. Existing late cancellation
-- compensation, lot refund, slot release and idempotency remain unchanged.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.cancel_my_booking(uuid)') is null
     or pg_catalog.to_regprocedure('public.deduct_ticket_and_confirm_booking(uuid,uuid)') is null then
    raise exception 'Apply 056 and 060 before the booking-window policy.';
  end if;
end;
$$;

create function public.enforce_booking_four_hour_minimum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_time text;
  v_scheduled_at timestamptz;
begin
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
  if not public.dayo_can_create_preopen_booking()
     and v_scheduled_at < pg_catalog.clock_timestamp() + interval '4 hours' then
    raise exception 'New bookings require at least four hours before the session.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_booking_four_hour_minimum()
  from public, anon, authenticated;

create trigger enforce_booking_four_hour_minimum
  before insert or update of status, scheduled_at on public.bookings
  for each row
  execute function public.enforce_booking_four_hour_minimum();

-- Preserve 060's cancellation flows, but evaluate the strict six-hour
-- boundary against the live clock after row locks have been acquired.
create or replace function public.cancel_my_booking(p_booking_id uuid)
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
$$;

-- CREATE OR REPLACE retains the authenticated EXECUTE grant from 060.
notify pgrst, 'reload schema';
commit;
