-- Partner weekly availability + bookable slot instances
-- slot_time: 'weekly:mon|10:00' (template) or 'YYYY-MM-DDTHH:mm:00' (bookable)

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null,
  slot_time text not null,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_slots_status_check
    check (status in ('available', 'booked')),
  constraint availability_slots_partner_time_key
    unique (partner_id, slot_time)
);

create index if not exists availability_slots_partner_id_idx
  on public.availability_slots (partner_id);

create index if not exists availability_slots_status_idx
  on public.availability_slots (status);

create index if not exists availability_slots_slot_time_idx
  on public.availability_slots (slot_time);

alter table public.availability_slots enable row level security;

drop policy if exists "availability_slots_select" on public.availability_slots;
create policy "availability_slots_select"
  on public.availability_slots for select
  using (true);

drop policy if exists "availability_slots_insert_own" on public.availability_slots;
create policy "availability_slots_insert_own"
  on public.availability_slots for insert
  with check (auth.uid() = partner_id);

drop policy if exists "availability_slots_update_own_or_book" on public.availability_slots;
create policy "availability_slots_update_own_or_book"
  on public.availability_slots for update
  using (auth.uid() = partner_id or status = 'available')
  with check (auth.uid() = partner_id or status in ('available', 'booked'));

drop policy if exists "availability_slots_delete_own" on public.availability_slots;
create policy "availability_slots_delete_own"
  on public.availability_slots for delete
  using (auth.uid() = partner_id and status = 'available');

alter table public.bookings
  add column if not exists partner_id uuid;

alter table public.bookings
  add column if not exists slot_id uuid;

create index if not exists bookings_partner_id_idx on public.bookings (partner_id);
create index if not exists bookings_slot_id_idx on public.bookings (slot_id);

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
    insert into public.bookings (id, learner_id, status, ticket_deducted)
    values (p_booking_id, p_learner_id, 'pending', false);
    v_status := 'pending';
    v_deducted := false;
    v_slot_id := null;
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

grant select on public.availability_slots to anon, authenticated;
grant insert, update, delete on public.availability_slots to authenticated;
grant execute on function public.deduct_ticket_and_confirm_booking(uuid, uuid) to anon, authenticated;
