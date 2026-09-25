-- Destructive pre-open cleanup: the operator has confirmed that every current
-- ticket balance is test data and that no real customer entitlement exists.
-- Apply only while the 049 pre-open booking gate remains active, before 055
-- starts issuing real 90-day ticket lots. Never reuse this after paid launch.
begin;

-- Existing scalar writers update profiles. Lock all three relevant tables so
-- the snapshot, reset, and allocation integrity checks see one stable state.
lock table public.profiles in share row exclusive mode;
lock table public.ticket_lots in share row exclusive mode;
lock table public.ticket_allocations in share mode;

-- Counts are transaction-local and intentionally not hardcoded to the current
-- observed five users / seven tickets. No permanent snapshot table is added.
create temporary table dayo_preopen_ticket_reset_snapshot on commit drop as
select
  (select count(*) from public.profiles where ticket_count > 0) as positive_user_count,
  (select coalesce(sum(ticket_count), 0) from public.profiles where ticket_count > 0) as positive_ticket_total,
  (select count(*) from public.ticket_lots where source = 'legacy_balance') as legacy_lot_count,
  (select coalesce(sum(quantity_issued), 0) from public.ticket_lots where source = 'legacy_balance') as legacy_issued_total,
  (select coalesce(sum(quantity_remaining), 0) from public.ticket_lots where source = 'legacy_balance') as legacy_remaining_total,
  (select count(*) from public.ticket_allocations) as allocation_count;

do $$
declare
  v_snapshot record;
  v_profiles_updated bigint;
  v_lots_deleted bigint;
begin
  select * into strict v_snapshot from pg_temp.dayo_preopen_ticket_reset_snapshot;

  -- Fail closed if the pre-open database guard has been removed or disabled.
  if pg_catalog.to_regprocedure('public.dayo_can_create_preopen_booking()') is null
     or not exists (
       select 1
       from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'bookings'
         and policyname = 'bookings_insert_own_pending'
         and cmd = 'INSERT'
         and pg_catalog.strpos(coalesce(with_check, ''), 'dayo_can_create_preopen_booking') > 0
     )
     or not exists (
       select 1
       from pg_catalog.pg_trigger
       where tgrelid = 'public.bookings'::pg_catalog.regclass
         and tgname = 'enforce_preopen_booking_confirmation'
         and not tgisinternal
         and tgenabled in ('O', 'A')
     ) then
    raise exception 'Pre-open booking gate is not active; fake ticket reset refused.';
  end if;

  if exists (select 1 from public.profiles where ticket_count < 0) then
    raise exception 'Negative ticket balance exists; fake ticket reset refused.';
  end if;

  -- 055 has not run yet. Preserve unexpected real/non-legacy lots and fail
  -- rather than claiming the wallet was reset while usable tickets remain.
  if exists (select 1 from public.ticket_lots where source <> 'legacy_balance') then
    raise exception 'Non-legacy ticket lots exist; fake ticket reset refused.';
  end if;

  if exists (
    select 1
    from public.ticket_allocations a
    join public.ticket_lots l on l.id = a.ticket_lot_id
    where l.source = 'legacy_balance'
  ) then
    raise exception 'Legacy ticket lots have booking allocations; fake ticket reset refused.';
  end if;

  raise notice 'Pre-open ticket snapshot: users=%, profile_tickets=%, legacy_lots=%, legacy_issued=%, legacy_remaining=%, allocations=%',
    v_snapshot.positive_user_count, v_snapshot.positive_ticket_total,
    v_snapshot.legacy_lot_count, v_snapshot.legacy_issued_total,
    v_snapshot.legacy_remaining_total, v_snapshot.allocation_count;

  -- Only the ticket_count column changes. All other profile data, bookings,
  -- orders, ledger history, allocations, and session data are untouched.
  update public.profiles
     set ticket_count = 0
   where ticket_count <> 0;
  get diagnostics v_profiles_updated = row_count;

  delete from public.ticket_lots where source = 'legacy_balance';
  get diagnostics v_lots_deleted = row_count;

  if v_profiles_updated <> v_snapshot.positive_user_count
     or v_lots_deleted <> v_snapshot.legacy_lot_count
     or exists (select 1 from public.profiles where ticket_count <> 0)
     or exists (select 1 from public.ticket_lots where source = 'legacy_balance')
     or exists (
       select 1 from public.ticket_lots
       where quantity_remaining > 0
         and (expires_at is null or expires_at > pg_catalog.now())
     )
     or (select count(*) from public.ticket_allocations) <> v_snapshot.allocation_count then
    raise exception 'Pre-open fake ticket reset validation failed; all changes rolled back.';
  end if;
end;
$$;

commit;
