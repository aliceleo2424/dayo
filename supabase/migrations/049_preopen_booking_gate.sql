-- Pre-open gate: keep existing confirmed sessions usable while allowing new
-- booking creation only for internal test accounts, admins and service jobs.

begin;

-- The current auth trigger already inserts zero explicitly. Align the table
-- default as well so any future profile insert cannot recreate a free ticket.
alter table public.profiles
  alter column ticket_count set default 0;

create or replace function public.dayo_can_create_preopen_booking()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin')
    or auth.uid() in (
      '131a43d2-8a90-41bb-a17a-2217b1ef283f'::uuid,
      '1bc0eab5-9399-4da8-a90c-145ab0c4409d'::uuid
    )
    or public.dayo_is_admin();
$$;

revoke all on function public.dayo_can_create_preopen_booking()
  from public, anon, authenticated;
grant execute on function public.dayo_can_create_preopen_booking()
  to authenticated, service_role;

drop policy if exists "bookings_insert_own_pending" on public.bookings;
create policy "bookings_insert_own_pending"
  on public.bookings
  for insert
  to authenticated
  with check (
    public.dayo_can_create_preopen_booking()
    and learner_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('user', 'learner', 'admin')
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

create or replace function public.enforce_preopen_booking_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'pending'
     and new.status = 'confirmed'
     and not public.dayo_can_create_preopen_booking() then
    raise exception 'New bookings are unavailable during pre-open.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_preopen_booking_confirmation()
  from public, anon, authenticated;

drop trigger if exists enforce_preopen_booking_confirmation
  on public.bookings;
create trigger enforce_preopen_booking_confirmation
  before update of status on public.bookings
  for each row
  execute function public.enforce_preopen_booking_confirmation();

notify pgrst, 'reload schema';

commit;
