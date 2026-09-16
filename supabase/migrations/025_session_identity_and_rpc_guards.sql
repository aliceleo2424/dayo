-- Canonical booking identity and authenticated guards for ticket/payout RPCs.

alter table public.bookings
  add column if not exists completed_at timestamptz;

alter table public.session_logs
  add column if not exists learner_id uuid;

create index if not exists session_logs_learner_id_idx
  on public.session_logs (learner_id, ended_at desc);

drop policy if exists "session_logs_insert_authenticated" on public.session_logs;
create policy "session_logs_insert_authenticated"
  on public.session_logs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or learner_id = auth.uid()
    or partner_id = auth.uid()
  );

drop policy if exists "session_logs_select_involved" on public.session_logs;
create policy "session_logs_select_involved"
  on public.session_logs for select
  to authenticated
  using (
    user_id = auth.uid()
    or learner_id = auth.uid()
    or partner_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where (profiles.user_id = auth.uid() or profiles.id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

create or replace function public.complete_learner_session(
  p_booking_id uuid,
  p_end_reason text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'message', '로그인이 필요합니다.');
  end if;

  update public.bookings
     set status = 'completed',
         end_reason = coalesce(nullif(trim(p_end_reason), ''), 'normal'),
         ended_at = now(),
         completed_at = now(),
         updated_at = now()
   where id = p_booking_id
     and learner_id = auth.uid();

  if not found then
    return jsonb_build_object('success', false, 'message', '세션을 찾을 수 없습니다.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

drop function if exists public.complete_session_and_reward_partner(uuid, uuid, integer);
create function public.complete_session_and_reward_partner(
  p_booking_id uuid,
  p_partner_user_id uuid,
  p_reward_amount integer default 6000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rewarded boolean;
  v_booking_partner uuid;
  v_points integer;
  v_amount integer := greatest(coalesce(p_reward_amount, 6000), 0);
begin
  if auth.uid() is null or auth.uid() <> p_partner_user_id then
    return jsonb_build_object('success', false, 'message', '파트너 본인만 정산할 수 있습니다.');
  end if;

  select partner_rewarded, partner_user_id
    into v_rewarded, v_booking_partner
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '실제 예약 ID를 찾을 수 없습니다.');
  end if;
  if v_booking_partner is not null and v_booking_partner <> p_partner_user_id then
    return jsonb_build_object('success', false, 'message', '예약된 파트너 정보가 일치하지 않습니다.');
  end if;
  if coalesce(v_rewarded, false) then
    select point_balance into v_points from public.profiles where user_id = p_partner_user_id;
    return jsonb_build_object('success', false, 'updated_points', coalesce(v_points, 0), 'message', '이미 정산된 세션입니다.');
  end if;

  update public.profiles
     set point_balance = coalesce(point_balance, 0) + v_amount,
         updated_at = now()
   where user_id = p_partner_user_id
     and role in ('partner', 'admin')
   returning point_balance into v_points;

  if not found then
    return jsonb_build_object('success', false, 'message', '파트너 프로필을 찾을 수 없습니다.');
  end if;

  update public.bookings
     set status = 'completed',
         partner_rewarded = true,
         partner_user_id = p_partner_user_id,
         ended_at = coalesce(ended_at, now()),
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where id = p_booking_id;

  return jsonb_build_object('success', true, 'updated_points', v_points, 'rewarded_points', v_amount);
end;
$$;

drop function if exists public.deduct_ticket_and_confirm_booking(uuid, uuid, uuid, uuid);
create function public.deduct_ticket_and_confirm_booking(
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
  v_booking_learner uuid;
begin
  if auth.uid() is null or auth.uid() <> p_learner_id then
    return jsonb_build_object('success', false, 'message', '학습자 본인만 예약을 확정할 수 있습니다.');
  end if;

  select ticket_count into v_tickets
    from public.profiles
   where user_id = p_learner_id
   for update;
  if not found then
    return jsonb_build_object('success', false, 'message', '프로필을 찾을 수 없습니다.');
  end if;

  select status, ticket_deducted, slot_id, learner_id
    into v_status, v_deducted, v_slot_id, v_booking_learner
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    insert into public.bookings (id, learner_id, partner_id, partner_user_id, slot_id, status, ticket_deducted)
    values (p_booking_id, p_learner_id, p_partner_id, p_partner_id, p_slot_id, 'pending', false);
    v_status := 'pending';
    v_deducted := false;
    v_slot_id := p_slot_id;
  elsif v_booking_learner <> p_learner_id then
    return jsonb_build_object('success', false, 'message', '예약 소유자가 일치하지 않습니다.');
  end if;

  if coalesce(v_deducted, false) or v_status in ('confirmed', 'completed') then
    return jsonb_build_object('success', true, 'remaining_tickets', v_tickets, 'message', '이미 확정된 예약입니다.');
  end if;
  if coalesce(v_tickets, 0) < 1 then
    return jsonb_build_object('success', false, 'remaining_tickets', 0, 'message', '보유 티켓이 부족합니다.');
  end if;

  update public.profiles
     set ticket_count = ticket_count - 1, updated_at = now()
   where user_id = p_learner_id
   returning ticket_count into v_tickets;

  update public.bookings
     set status = 'confirmed',
         ticket_deducted = true,
         partner_id = coalesce(p_partner_id, partner_id),
         partner_user_id = coalesce(p_partner_id, partner_user_id),
         slot_id = coalesce(p_slot_id, slot_id),
         updated_at = now()
   where id = p_booking_id;

  if coalesce(p_slot_id, v_slot_id) is not null then
    update public.availability_slots
       set status = 'booked', updated_at = now()
     where id = coalesce(p_slot_id, v_slot_id)
       and status = 'available';
  end if;

  return jsonb_build_object('success', true, 'remaining_tickets', v_tickets, 'message', '예약이 확정되었습니다.');
end;
$$;

revoke execute on function public.complete_session_and_reward_partner(uuid, uuid, integer) from public, anon;
revoke execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.complete_session_and_reward_partner(uuid, uuid, integer) to authenticated;
grant execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid, uuid, uuid) to authenticated;
