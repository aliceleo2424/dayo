-- Keep learner completion and partner reward order-independent for normal sessions.
-- A normal learner completion records the end but leaves the booking confirmed
-- until the partner reward transaction finalizes the completed state.

begin;

create or replace function public.complete_learner_session(
  p_booking_id uuid,
  p_end_reason text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_learner_id uuid;
  v_status text;
  v_scheduled_at timestamptz;
  v_partner_rewarded boolean;
  v_existing_reason text;
  v_end_reason text := coalesce(nullif(btrim(p_end_reason), ''), 'normal');
begin
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
$$;

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
  v_end_reason text;
  v_points integer;
  v_reward_amount constant integer := 6000;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'message', '로그인이 필요합니다.');
  end if;

  if p_booking_id is null
     or p_partner_user_id is null
     or p_partner_user_id <> v_actor_id then
    return jsonb_build_object('success', false, 'message', '파트너 본인만 보상을 받을 수 있습니다.');
  end if;

  select partner_user_id, status, scheduled_at, partner_rewarded, end_reason
    into v_booking_partner, v_booking_status, v_scheduled_at, v_rewarded, v_end_reason
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '실제 예약 ID를 찾을 수 없습니다.');
  end if;

  if v_booking_partner is null or v_booking_partner <> v_actor_id then
    return jsonb_build_object('success', false, 'message', '예약된 파트너 정보가 일치하지 않습니다.');
  end if;

  if coalesce(v_rewarded, false) then
    select point_balance
      into v_points
      from public.profiles
     where id = v_actor_id;

    return jsonb_build_object(
      'success', false,
      'updated_points', coalesce(v_points, 0),
      'message', '이미 보상이 지급된 세션입니다.'
    );
  end if;

  if v_booking_status <> 'confirmed'
     and not (v_booking_status = 'completed' and v_end_reason = 'normal') then
    return jsonb_build_object('success', false, 'message', '보상할 수 있는 예약 상태가 아닙니다.');
  end if;

  if v_scheduled_at is null or now() < v_scheduled_at + interval '25 minutes' then
    return jsonb_build_object('success', false, 'message', '라이브 대화 시간이 종료된 후에 보상받을 수 있습니다.');
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
         end_reason = coalesce(nullif(end_reason, ''), 'normal'),
         ended_at = coalesce(ended_at, now()),
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where id = p_booking_id
     and partner_user_id = v_actor_id
     and partner_rewarded = false
     and (
       status = 'confirmed'
       or (status = 'completed' and end_reason = 'normal')
     );

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

revoke execute on function public.complete_learner_session(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.complete_learner_session(uuid, text)
  to authenticated, service_role;
grant execute on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  to authenticated, service_role;

commit;
