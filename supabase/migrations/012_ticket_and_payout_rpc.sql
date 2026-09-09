-- Atomic ticket deduction + partner payout RPCs
-- Frontend must call these instead of updating profiles.ticket_count / point_balance directly.

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  partner_user_id uuid,
  partner_name text,
  language text,
  scheduled_at timestamptz,
  status text not null default 'pending',
  ticket_deducted boolean not null default false,
  partner_rewarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_learner_id_idx on public.bookings (learner_id);
create index if not exists bookings_partner_user_id_idx on public.bookings (partner_user_id);
create index if not exists bookings_status_idx on public.bookings (status);

alter table public.bookings enable row level security;

drop policy if exists "bookings_select_involved" on public.bookings;
create policy "bookings_select_involved"
  on public.bookings for select
  using (auth.uid() = learner_id or auth.uid() = partner_user_id);

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own"
  on public.bookings for insert
  with check (auth.uid() = learner_id);

drop policy if exists "bookings_update_involved" on public.bookings;
create policy "bookings_update_involved"
  on public.bookings for update
  using (auth.uid() = learner_id or auth.uid() = partner_user_id)
  with check (auth.uid() = learner_id or auth.uid() = partner_user_id);

create or replace function public.deduct_ticket_and_confirm_booking(
  p_learner_id uuid,
  p_booking_id uuid
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

  select status, ticket_deducted into v_status, v_deducted
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    insert into public.bookings (id, learner_id, status, ticket_deducted)
    values (p_booking_id, p_learner_id, 'pending', false);
    v_status := 'pending';
    v_deducted := false;
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
      updated_at = timezone('utc', now())
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'remaining_tickets', v_tickets,
    'message', '예약이 확정되었습니다.'
  );
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
set search_path = public
as $$
declare
  v_rewarded boolean;
  v_points integer;
  var_amount integer;
begin
  var_amount := coalesce(p_reward_amount, 6000);
  if var_amount < 0 then
    var_amount := 6000;
  end if;

  if p_booking_id is null or p_partner_user_id is null then
    return jsonb_build_object('success', false, 'message', '정산 정보가 부족합니다.');
  end if;

  select partner_rewarded into v_rewarded
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    insert into public.bookings (id, learner_id, partner_user_id, status, ticket_deducted, partner_rewarded)
    values (p_booking_id, p_partner_user_id, p_partner_user_id, 'confirmed', true, false);
    v_rewarded := false;
  end if;

  if v_rewarded then
    select point_balance into v_points
    from public.profiles
    where user_id = p_partner_user_id;

    return jsonb_build_object(
      'success', false,
      'updated_points', coalesce(v_points, 0),
      'message', '이미 정산이 완료된 세션입니다.'
    );
  end if;

  update public.profiles
  set point_balance = coalesce(point_balance, 0) + var_amount,
      updated_at = timezone('utc', now())
  where user_id = p_partner_user_id
  returning point_balance into v_points;

  if not found then
    return jsonb_build_object('success', false, 'message', '파트너 프로필을 찾을 수 없습니다.');
  end if;

  update public.bookings
  set status = 'completed',
      partner_rewarded = true,
      partner_user_id = p_partner_user_id,
      updated_at = timezone('utc', now())
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'updated_points', v_points,
    'message', '파트너 정산이 완료되었습니다.'
  );
end;
$$;

grant execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid) to anon, authenticated;
grant execute on function public.complete_session_and_reward_partner(uuid, uuid, integer) to anon, authenticated;
