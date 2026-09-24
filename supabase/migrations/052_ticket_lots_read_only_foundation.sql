-- Stage 1 only: empty ticket tables and read-only access.
-- No backfill, scalar balance synchronization, or ticket writer cutover.
-- An empty wallet here MUST NOT replace profiles.ticket_count in existing UI.
begin;

create table public.ticket_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  source text not null,
  source_id uuid not null,
  quantity_issued integer not null,
  quantity_remaining integer not null,
  issued_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_lots_source_check check (
    source in ('purchase', 'admin_grant', 'promotion', 'service_recovery', 'legacy_balance')
  ),
  constraint ticket_lots_quantity_check check (
    quantity_issued > 0
    and quantity_remaining >= 0
    and quantity_remaining <= quantity_issued
  ),
  -- UTC arithmetic makes the 90-day boundary independent of connection timezone/DST.
  -- Explicit NOT NULL is required: PostgreSQL CHECK also accepts NULL results.
  constraint ticket_lots_expiry_check check (
    (source = 'legacy_balance' and issued_at is null and expires_at is null)
    or (
      source <> 'legacy_balance'
      and issued_at is not null
      and expires_at is not null
      and pg_catalog.isfinite(issued_at)
      and pg_catalog.isfinite(expires_at)
      and expires_at = (((issued_at at time zone 'UTC') + interval '90 days') at time zone 'UTC')
    )
  ),
  constraint ticket_lots_source_unique unique (user_id, source, source_id)
);

create index ticket_lots_usable_fifo_idx
  on public.ticket_lots (user_id, expires_at asc nulls last, issued_at asc nulls last, id)
  where quantity_remaining > 0;
create index ticket_lots_source_idx on public.ticket_lots (source, source_id);
create index ticket_lots_expiry_idx on public.ticket_lots (expires_at)
  where expires_at is not null and quantity_remaining > 0;
create index ticket_lots_user_history_idx
  on public.ticket_lots (user_id, source, created_at desc);

create table public.ticket_allocations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  ticket_lot_id uuid not null references public.ticket_lots(id) on delete restrict,
  quantity integer not null default 1,
  consumed_at timestamptz not null default now(),
  refunded_at timestamptz,
  refund_reason text,
  created_at timestamptz not null default now(),
  constraint ticket_allocations_quantity_check check (quantity = 1),
  constraint ticket_allocations_booking_unique unique (booking_id),
  constraint ticket_allocations_refund_time_check check (
    refunded_at is null or refunded_at >= consumed_at
  )
);

create index ticket_allocations_lot_idx
  on public.ticket_allocations (ticket_lot_id, consumed_at desc);

alter table public.ticket_lots enable row level security;
alter table public.ticket_allocations enable row level security;

-- Clear default Supabase grants as well as PUBLIC privileges on the new tables.
-- Even service_role receives read-only privileges at this stage.
revoke all on table public.ticket_lots, public.ticket_allocations
  from public, anon, authenticated, service_role;
grant select on table public.ticket_lots, public.ticket_allocations
  to authenticated, service_role;

-- Authenticated SELECT is effective only for an existing verified admin.
-- Ordinary users get only their own wallet projection through the RPC below.
create policy ticket_lots_admin_read on public.ticket_lots
  for select to authenticated
  using (public.dayo_is_admin());
create policy ticket_allocations_admin_read on public.ticket_allocations
  for select to authenticated
  using (public.dayo_is_admin());

-- Admins can join allocations to lots/bookings through existing admin SELECT
-- access. Derive state at read time: remaining=0 => exhausted; otherwise
-- expires_at<=now() => expired; otherwise usable (including NULL legacy expiry).
-- No mutation policy, trigger, or row-writing RPC is introduced.

create function public.get_my_ticket_wallet()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Login is required.' using errcode = '42501';
  end if;

  -- lots contains only usable lots. Expired/exhausted history is admin-only.
  -- Identity comes exclusively from auth.uid(), never a caller-supplied ID.
  select pg_catalog.jsonb_build_object(
    'success', true,
    'usable_count', coalesce(pg_catalog.sum(l.quantity_remaining), 0),
    'nearest_expiry', pg_catalog.min(l.expires_at),
    'legacy_count', coalesce(pg_catalog.sum(l.quantity_remaining)
      filter (where l.source = 'legacy_balance'), 0),
    'lots', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', l.id,
        'source', l.source,
        'quantity_remaining', l.quantity_remaining,
        'issued_at', l.issued_at,
        'expires_at', l.expires_at
      ) order by l.expires_at asc nulls last, l.issued_at asc nulls last, l.id
    ), '[]'::jsonb)
  ) into v_result
  from public.ticket_lots l
  where l.user_id = v_user_id
    and l.quantity_remaining > 0
    and (l.expires_at is null or l.expires_at > pg_catalog.now());

  return v_result;
end;
$$;

revoke all on function public.get_my_ticket_wallet()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_ticket_wallet() to authenticated;

notify pgrst, 'reload schema';
commit;
