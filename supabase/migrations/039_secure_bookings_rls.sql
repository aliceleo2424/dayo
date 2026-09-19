-- Restrict bookings to authenticated participants and authenticated admins.
-- Direct writes remain limited to pending booking creation and learner ratings.

begin;

alter table public.bookings enable row level security;

create or replace function public.dayo_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.profiles
       where id = auth.uid()
         and role = 'admin'
     );
$$;

revoke all on function public.dayo_is_admin()
  from public, anon, authenticated;
grant execute on function public.dayo_is_admin()
  to authenticated;

-- Remove the broad production policies and replace the earlier repository
-- policies so the final state is deterministic on every environment.
drop policy if exists "Allow access to bookings" on public.bookings;
drop policy if exists "bookings_select_admin_ops" on public.bookings;
drop policy if exists "bookings_select_involved" on public.bookings;
drop policy if exists "bookings_insert_own" on public.bookings;
drop policy if exists "bookings_update_involved" on public.bookings;
drop policy if exists "bookings_select_participant" on public.bookings;
drop policy if exists "bookings_select_admin" on public.bookings;
drop policy if exists "bookings_insert_own_pending" on public.bookings;
drop policy if exists "bookings_update_own_rating" on public.bookings;

create policy "bookings_select_participant"
  on public.bookings
  for select
  to authenticated
  using (
    learner_id = auth.uid()
    or partner_user_id = auth.uid()
  );

create policy "bookings_select_admin"
  on public.bookings
  for select
  to authenticated
  using (public.dayo_is_admin());

create policy "bookings_insert_own_pending"
  on public.bookings
  for insert
  to authenticated
  with check (
    learner_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('user', 'learner')
    )
    and status = 'pending'
    and partner_user_id = partner_id
    and ticket_deducted = false
    and partner_rewarded = false
    and ticket_refunded = false
    and ended_at is null
    and completed_at is null
    and end_reason is null
    and rating is null
  );

create policy "bookings_update_own_rating"
  on public.bookings
  for update
  to authenticated
  using (
    learner_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('user', 'learner')
    )
  )
  with check (
    learner_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('user', 'learner')
    )
  );

-- Reset both table-level and any pre-existing column-level privileges before
-- granting only the operations used by the current browser clients.
revoke all privileges on table public.bookings
  from public, anon, authenticated;

revoke
  select (
    id, learner_id, partner_id, slot_id, status, ticket_deducted,
    created_at, updated_at, ended_at, partner_user_id, scheduled_at,
    partner_rewarded, ticket_refunded, end_reason, completed_at,
    partner_name, language, rating
  ),
  insert (
    id, learner_id, partner_id, slot_id, status, ticket_deducted,
    created_at, updated_at, ended_at, partner_user_id, scheduled_at,
    partner_rewarded, ticket_refunded, end_reason, completed_at,
    partner_name, language, rating
  ),
  update (
    id, learner_id, partner_id, slot_id, status, ticket_deducted,
    created_at, updated_at, ended_at, partner_user_id, scheduled_at,
    partner_rewarded, ticket_refunded, end_reason, completed_at,
    partner_name, language, rating
  ),
  references (
    id, learner_id, partner_id, slot_id, status, ticket_deducted,
    created_at, updated_at, ended_at, partner_user_id, scheduled_at,
    partner_rewarded, ticket_refunded, end_reason, completed_at,
    partner_name, language, rating
  )
on table public.bookings
from public, anon, authenticated;

grant select on table public.bookings
  to authenticated;

grant insert (
  learner_id,
  partner_id,
  partner_user_id,
  partner_name,
  language,
  scheduled_at,
  slot_id,
  status
) on table public.bookings
  to authenticated;

grant update (rating) on table public.bookings
  to authenticated;

notify pgrst, 'reload schema';

commit;
