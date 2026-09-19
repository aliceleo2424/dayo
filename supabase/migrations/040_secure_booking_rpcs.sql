-- Harden the two booking RPC signatures that exist in production.
-- Keep the current browser call signatures while deriving identity and rewards
-- only from the authenticated user and the stored booking.

begin;

create or replace function public.complete_session_and_reward_partner(
  p_booking_id uuid,
  p_partner_user_id uuid,
  p_reward_amount integer default 6000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking_partner uuid;
  v_booking_status text;
  v_scheduled_at timestamptz;
  v_rewarded boolean;
  v_points integer;
  v_reward_amount constant integer := 6000;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'message', '로그인이 필요합니다.');
  end if;

  if p_booking_id is null
     or p_partner_user_id is null
     or p_partner_user_id <> v_actor_id then
    return jsonb_build_object('success', false, 'message', '파트너 본인만 정산할 수 있습니다.');
  end if;

  select partner_user_id, status, scheduled_at, partner_rewarded
    into v_booking_partner, v_booking_status, v_scheduled_at, v_rewarded
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '실제 예약 ID를 찾을 수 없습니다.');
  end if;

  if v_booking_partner is null or v_booking_partner <> v_actor_id then
    return jsonb_build_object('success', false, 'message', '예약된 파트너 정보가 일치하지 않습니다.');
  end if;

  if coalesce(v_rewarded, false) or v_booking_status = 'completed' then
    select point_balance
      into v_points
      from public.profiles
     where id = v_actor_id;

    return jsonb_build_object(
      'success', false,
      'updated_points', coalesce(v_points, 0),
      'message', '이미 정산된 세션입니다.'
    );
  end if;

  if v_booking_status <> 'confirmed' then
    return jsonb_build_object('success', false, 'message', '정산할 수 있는 예약 상태가 아닙니다.');
  end if;

  if v_scheduled_at is null or now() < v_scheduled_at + interval '25 minutes' then
    return jsonb_build_object('success', false, 'message', '라이브 대화 시간이 종료된 후에 정산할 수 있습니다.');
  end if;

  -- p_reward_amount remains in the signature for browser compatibility only.
  -- The client cannot influence the actual reward.
  select point_balance
    into v_points
    from public.profiles
   where id = v_actor_id
     and role = 'partner'
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '파트너 프로필을 찾을 수 없습니다.');
  end if;

  update public.profiles
     set point_balance = coalesce(point_balance, 0) + v_reward_amount,
         updated_at = now()
   where id = v_actor_id
     and role = 'partner'
   returning point_balance into v_points;

  update public.bookings
     set status = 'completed',
         partner_rewarded = true,
         ended_at = coalesce(ended_at, now()),
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where id = p_booking_id
     and partner_user_id = v_actor_id
     and status = 'confirmed'
     and partner_rewarded = false;

  if not found then
    raise exception 'Booking reward state changed while completing the session.'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'success', true,
    'updated_points', v_points,
    'rewarded_points', v_reward_amount
  );
end;
$$;

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
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'message', '로그인이 필요합니다.');
  end if;

  if p_learner_id is null
     or p_booking_id is null
     or p_learner_id <> v_actor_id then
    return jsonb_build_object('success', false, 'message', '학습자 본인만 예약을 확정할 수 있습니다.');
  end if;

  select learner_id, partner_id, partner_user_id, slot_id, status, ticket_deducted
    into v_booking_learner, v_booking_partner, v_booking_partner_user,
         v_slot_id, v_status, v_deducted
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '실제 예약 ID를 찾을 수 없습니다.');
  end if;

  if v_booking_learner is null or v_booking_learner <> v_actor_id then
    return jsonb_build_object('success', false, 'message', '예약 소유자가 일치하지 않습니다.');
  end if;

  if coalesce(v_deducted, false) or v_status in ('confirmed', 'completed') then
    select ticket_count
      into v_tickets
      from public.profiles
     where id = v_actor_id;

    return jsonb_build_object(
      'success', true,
      'remaining_tickets', v_tickets,
      'message', '이미 확정된 예약입니다.'
    );
  end if;

  if v_status <> 'pending' then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '확정할 수 있는 예약 상태가 아닙니다.');
  end if;

  if v_slot_id is null then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '예약 시간 정보를 확인할 수 없습니다.');
  end if;

  if v_booking_partner is null
     or v_booking_partner_user is null
     or v_booking_partner <> v_booking_partner_user then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '예약 파트너 정보가 일치하지 않습니다.');
  end if;

  select partner_id, status, slot_time
    into v_slot_partner, v_slot_status, v_slot_time
    from public.availability_slots
   where id = v_slot_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '예약 시간을 찾을 수 없습니다.');
  end if;

  if v_slot_status <> 'available' then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '이미 예약되었거나 선택할 수 없는 시간입니다.');
  end if;

  if v_slot_partner <> v_booking_partner_user then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '예약 시간의 파트너 정보가 일치하지 않습니다.');
  end if;

  v_slot_time := btrim(v_slot_time);

  if v_slot_time is null or v_slot_time = '' then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '예약 시간 형식을 확인할 수 없습니다.');
  end if;

  if v_slot_time like 'weekly:%' then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '반복 가능시간 템플릿은 실제 예약에 사용할 수 없습니다.');
  end if;

  if v_slot_time !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '예약 시간 형식을 확인할 수 없습니다.');
  end if;

  begin
    if v_slot_time ~* '(Z|[+-][0-9]{2}(:[0-9]{2}|[0-9]{2})?)$' then
      v_scheduled_at := v_slot_time::timestamptz;
    else
      v_scheduled_at := v_slot_time::timestamp at time zone 'Asia/Seoul';
    end if;
  exception when others then
    return jsonb_build_object('success', false, 'remaining_tickets', v_tickets, 'message', '예약 시간 형식을 확인할 수 없습니다.');
  end;

  select id, ticket_count
    into v_profile_id, v_tickets
    from public.profiles
   where id = v_actor_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '프로필을 찾을 수 없습니다.');
  end if;

  if coalesce(v_tickets, 0) < 1 then
    return jsonb_build_object('success', false, 'remaining_tickets', 0, 'message', '보유 티켓이 부족합니다.');
  end if;

  update public.profiles
     set ticket_count = ticket_count - 1,
         updated_at = now()
   where id = v_profile_id
     and ticket_count > 0
   returning ticket_count into v_tickets;

  if not found then
    return jsonb_build_object('success', false, 'remaining_tickets', 0, 'message', '보유 티켓이 부족합니다.');
  end if;

  update public.bookings
     set status = 'confirmed',
         ticket_deducted = true,
         scheduled_at = v_scheduled_at,
         updated_at = now()
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
         updated_at = now()
   where id = v_slot_id
     and partner_id = v_booking_partner_user
     and status = 'available';

  if not found then
    raise exception 'Availability slot state changed while confirming the booking.'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'success', true,
    'remaining_tickets', v_tickets,
    'message', '예약이 확정되었습니다.'
  );
end;
$$;

revoke execute on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  to authenticated, service_role;
grant execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid)
  to authenticated, service_role;

commit;
