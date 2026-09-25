-- Stage 4: consume one usable ticket lot when confirming a booking.
-- Requires 055_ticket_lot_issuance.sql. Refunds remain a separate cutover.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.refresh_ticket_balance_cache(uuid)') is null then
    raise exception 'Apply 055 ticket lot issuance before 056 consumption.';
  end if;
  if pg_catalog.to_regprocedure('public.dayo_can_create_preopen_booking()') is null then
    raise exception 'The 049 pre-open booking gate is required.';
  end if;
end;
$$;

-- Freeze booking writes while identifying pre-cutover confirmed sessions.
-- These historical sessions can be retried without inventing an allocation.
lock table public.bookings in share row exclusive mode;

create table public.ticket_consumption_pre_cutover_bookings (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  recorded_at timestamptz not null default pg_catalog.now()
);

insert into public.ticket_consumption_pre_cutover_bookings (booking_id)
select b.id
  from public.bookings b
 where b.status in ('confirmed', 'completed')
   and b.ticket_deducted = true
   and not exists (
     select 1 from public.ticket_allocations a where a.booking_id = b.id
   );

alter table public.ticket_consumption_pre_cutover_bookings enable row level security;
revoke all on table public.ticket_consumption_pre_cutover_bookings
  from public, anon, authenticated, service_role;

create or replace function public.deduct_ticket_and_confirm_booking(
  p_learner_id uuid,
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if v_actor_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'message', '로그인이 필요합니다.');
  end if;

  if p_learner_id is null
     or p_booking_id is null
     or p_learner_id <> v_actor_id then
    return pg_catalog.jsonb_build_object('success', false, 'message', '학습자 본인만 예약을 확정할 수 있습니다.');
  end if;

  select learner_id, partner_id, partner_user_id, slot_id, status, ticket_deducted
    into v_booking_learner, v_booking_partner, v_booking_partner_user,
         v_slot_id, v_status, v_deducted
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'message', '실제 예약 ID를 찾을 수 없습니다.');
  end if;

  if v_booking_learner is null or v_booking_learner <> v_actor_id then
    return pg_catalog.jsonb_build_object('success', false, 'message', '예약 소유자가 일치하지 않습니다.');
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
      'message', '이미 확정된 예약입니다.'
    );
  end if;

  if v_status <> 'pending' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '확정할 수 있는 예약 상태가 아닙니다.');
  end if;

  if coalesce(v_deducted, false) then
    raise exception 'Pending booking already has a ticket deduction.' using errcode = '23514';
  end if;

  -- 049's trigger also enforces this at the status update. Check early so
  -- ordinary users cannot consume a lot while pre-open booking is disabled.
  if not public.dayo_can_create_preopen_booking() then
    return pg_catalog.jsonb_build_object('success', false,
      'message', '정식 오픈 후 예약할 수 있습니다.');
  end if;

  if v_slot_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '예약 시간 정보를 확인할 수 없습니다.');
  end if;

  if v_booking_partner is null
     or v_booking_partner_user is null
     or v_booking_partner <> v_booking_partner_user then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '예약 파트너 정보가 일치하지 않습니다.');
  end if;

  select partner_id, status, slot_time
    into v_slot_partner, v_slot_status, v_slot_time
    from public.availability_slots
   where id = v_slot_id
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '예약 시간을 찾을 수 없습니다.');
  end if;

  if v_slot_status <> 'available' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '이미 예약되었거나 선택할 수 없는 시간입니다.');
  end if;

  if v_slot_partner <> v_booking_partner_user then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '예약 시간의 파트너 정보가 일치하지 않습니다.');
  end if;

  v_slot_time := pg_catalog.btrim(v_slot_time);

  if v_slot_time is null or v_slot_time = '' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '예약 시간 형식을 확인할 수 없습니다.');
  end if;

  if v_slot_time like 'weekly:%' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '반복 가능시간 템플릿은 실제 예약에 사용할 수 없습니다.');
  end if;

  if v_slot_time !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '예약 시간 형식을 확인할 수 없습니다.');
  end if;

  begin
    if v_slot_time ~* '(Z|[+-][0-9]{2}(:[0-9]{2}|[0-9]{2})?)$' then
      v_scheduled_at := v_slot_time::timestamptz;
    else
      v_scheduled_at := v_slot_time::timestamp at time zone 'Asia/Seoul';
    end if;
  exception when others then
    return pg_catalog.jsonb_build_object('success', false, 'remaining_tickets', v_tickets,
      'message', '예약 시간 형식을 확인할 수 없습니다.');
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
    return pg_catalog.jsonb_build_object('success', false, 'message', '프로필을 찾을 수 없습니다.');
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
      'message', '보유 티켓이 부족합니다.');
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
    'message', '예약이 확정되었습니다.'
  );
end;
$$;

-- The four-argument legacy overload remains callable by the browser. Route
-- it into the same lot-aware two-argument implementation; remove its old
-- optional defaults so a two-argument call cannot resolve ambiguously.
create or replace function public.deduct_ticket_and_confirm_booking(
  p_learner_id uuid,
  p_booking_id uuid,
  p_slot_id uuid,
  p_partner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_slot_id uuid;
  v_partner_id uuid;
begin
  if v_actor_id is null or p_learner_id is null or p_learner_id <> v_actor_id then
    return pg_catalog.jsonb_build_object('success', false,
      'message', '학습자 본인만 예약을 확정할 수 있습니다.');
  end if;

  select slot_id, partner_user_id
    into v_slot_id, v_partner_id
    from public.bookings
   where id = p_booking_id
     and learner_id = v_actor_id
   for update;

  if found then
    if p_slot_id is not null and p_slot_id is distinct from v_slot_id then
      return pg_catalog.jsonb_build_object('success', false,
        'message', '예약 시간 정보가 일치하지 않습니다.');
    end if;
    if p_partner_id is not null and p_partner_id is distinct from v_partner_id then
      return pg_catalog.jsonb_build_object('success', false,
        'message', '예약 파트너 정보가 일치하지 않습니다.');
    end if;
  end if;

  return public.deduct_ticket_and_confirm_booking(p_learner_id, p_booking_id);
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_proc
     where oid = pg_catalog.to_regprocedure(
       'public.deduct_ticket_and_confirm_booking(uuid,uuid,uuid,uuid)'
     )
       and proargdefaults is not null
  ) then
    raise exception 'Legacy booking overload still has optional scalar-era defaults.';
  end if;
end;
$$;

revoke all on function public.deduct_ticket_and_confirm_booking(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.deduct_ticket_and_confirm_booking(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid, uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
