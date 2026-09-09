-- Allow confirm RPC to receive live partner/slot UUIDs from the booking modal.
drop function if exists public.deduct_ticket_and_confirm_booking(uuid, uuid);
drop function if exists public.deduct_ticket_and_confirm_booking(uuid, uuid, uuid, uuid);

create or replace function public.deduct_ticket_and_confirm_booking(
  p_learner_id uuid,
  p_booking_id uuid,
  p_slot_id uuid default null,
  p_partner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tickets integer;
  v_status text;
  v_deducted boolean;
  v_slot_id uuid;
begin
  if p_learner_id is null or p_booking_id is null then
    return jsonb_build_object('success', false, 'message', '예약 정보가 부족합니다.');
  end if;

  select ticket_count into v_tickets
  from public.profiles
  where user_id = p_learner_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '프로필을 찾을 수 없습니다.');
  end if;

  select status, ticket_deducted, slot_id into v_status, v_deducted, v_slot_id
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    insert into public.bookings (id, learner_id, partner_id, partner_user_id, slot_id, status, ticket_deducted)
    values (p_booking_id, p_learner_id, p_partner_id, p_partner_id, p_slot_id, 'pending', false);
    v_status := 'pending';
    v_deducted := false;
    v_slot_id := p_slot_id;
  elsif p_slot_id is not null or p_partner_id is not null then
    update public.bookings
    set slot_id = coalesce(p_slot_id, slot_id),
        partner_id = coalesce(p_partner_id, partner_id),
        partner_user_id = coalesce(p_partner_id, partner_user_id),
        updated_at = timezone('utc', now())
    where id = p_booking_id;
    v_slot_id := coalesce(p_slot_id, v_slot_id);
  end if;

  if v_deducted or v_status in ('confirmed', 'completed') then
    return jsonb_build_object(
      'success', true,
      'remaining_tickets', v_tickets,
      'message', '이미 확정된 예약입니다.'
    );
  end if;

  if coalesce(v_tickets, 0) < 1 then
    return jsonb_build_object(
      'success', false,
      'remaining_tickets', 0,
      'message', '보유 티켓이 부족합니다.'
    );
  end if;

  update public.profiles
  set ticket_count = ticket_count - 1,
      updated_at = timezone('utc', now())
  where user_id = p_learner_id
  returning ticket_count into v_tickets;

  update public.bookings
  set status = 'confirmed',
      ticket_deducted = true,
      learner_id = p_learner_id,
      partner_id = coalesce(p_partner_id, partner_id),
      partner_user_id = coalesce(p_partner_id, partner_user_id),
      slot_id = coalesce(p_slot_id, slot_id),
      updated_at = timezone('utc', now())
  where id = p_booking_id;

  if v_slot_id is not null then
    update public.availability_slots
    set status = 'booked',
        updated_at = timezone('utc', now())
    where id = v_slot_id
      and status = 'available';
  end if;

  return jsonb_build_object(
    'success', true,
    'remaining_tickets', v_tickets,
    'message', '예약이 확정되었습니다.'
  );
end;
$$;

grant execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid, uuid, uuid) to anon, authenticated;
