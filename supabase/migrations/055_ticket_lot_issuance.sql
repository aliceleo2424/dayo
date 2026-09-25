-- Stage 3: issue new admin and verified-purchase tickets into lots.
-- Booking consumption, allocations, and refunds remain on the legacy path.
begin;

-- Internal-only cache refresh. Issuance callers lock the profile before
-- inserting a lot; this lock also serializes refreshes for the same user.
create function public.refresh_ticket_balance_cache(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  if p_user_id is null then
    raise exception 'A user is required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  select coalesce(pg_catalog.sum(l.quantity_remaining), 0)
    into v_balance
    from public.ticket_lots l
   where l.user_id = p_user_id
     and l.quantity_remaining > 0
     and (l.expires_at is null or l.expires_at > pg_catalog.now());

  if v_balance > 2147483647 then
    raise exception 'Ticket balance exceeds integer range.' using errcode = '22003';
  end if;

  update public.profiles
     set ticket_count = v_balance::integer,
         updated_at = pg_catalog.now()
   where id = p_user_id;

  return v_balance::integer;
end;
$$;

revoke all on function public.refresh_ticket_balance_cache(uuid)
  from public, anon, authenticated, service_role;

create function public.admin_grant_tickets(
  p_user_id uuid,
  p_quantity integer,
  p_reason text,
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_existing public.ticket_lots%rowtype;
  v_ledger public.credit_ledgers%rowtype;
  v_issued_at timestamptz;
  v_balance integer;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_source_id is null or p_quantity is null or p_quantity < 1
     or v_reason = '' or pg_catalog.length(v_reason) > 500 then
    raise exception 'Valid user, quantity, reason, and source ID are required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.ticket_lots
     where source = 'admin_grant' and source_id = p_source_id and user_id <> p_user_id
  ) then
    raise exception 'Grant source ID belongs to another user.' using errcode = '23505';
  end if;

  select * into v_existing
    from public.ticket_lots
   where user_id = p_user_id and source = 'admin_grant' and source_id = p_source_id
   for update;

  if found then
    if v_existing.quantity_issued is distinct from p_quantity then
      raise exception 'Grant source ID has different quantity.' using errcode = '23505';
    end if;
    select * into v_ledger from public.credit_ledgers where id = p_source_id;
    if not found
       or v_ledger.user_id is distinct from p_user_id
       or v_ledger.profile_id is distinct from p_user_id
       or v_ledger.delta is distinct from p_quantity
       or v_ledger.reason is distinct from v_reason
       or v_ledger.source is distinct from 'admin_grant' then
      raise exception 'Grant source ID has different or missing audit data.' using errcode = '23505';
    end if;
    select ticket_count into v_balance from public.profiles where id = p_user_id;
    return pg_catalog.jsonb_build_object(
      'success', true, 'duplicate', true, 'ticket_count', v_balance,
      'added_tickets', 0, 'source_id', p_source_id
    );
  end if;

  v_issued_at := pg_catalog.now();
  insert into public.ticket_lots (
    user_id, source, source_id, quantity_issued, quantity_remaining, issued_at, expires_at
  ) values (
    p_user_id, 'admin_grant', p_source_id, p_quantity, p_quantity, v_issued_at,
    (((v_issued_at at time zone 'UTC') + interval '90 days') at time zone 'UTC')
  );

  v_balance := public.refresh_ticket_balance_cache(p_user_id);
  insert into public.credit_ledgers (
    id, user_id, profile_id, delta, balance_after, reason, source
  ) values (
    p_source_id, p_user_id, p_user_id, p_quantity, v_balance, v_reason, 'admin_grant'
  );

  return pg_catalog.jsonb_build_object(
    'success', true, 'duplicate', false, 'ticket_count', v_balance,
    'added_tickets', p_quantity, 'source_id', p_source_id
  );
end;
$$;

revoke all on function public.admin_grant_tickets(uuid, integer, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_grant_tickets(uuid, integer, text, uuid)
  to authenticated;

-- Retire the old absolute-set RPC where it exists. Do not modify 042 itself.
do $$
begin
  if pg_catalog.to_regprocedure('public.admin_set_profile_ticket_count(uuid,integer)') is not null then
    execute 'revoke all on function public.admin_set_profile_ticket_count(uuid, integer) from public, anon, authenticated';
  end if;
end;
$$;

-- Keep the existing server-verified payment contract and validation unchanged.
-- The API still verifies PortOne before calling this service_role-only RPC.
create or replace function public.finalize_verified_ticket_purchase(
  p_user_id uuid,
  p_merchant_uid text,
  p_imp_uid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.ticket_lots%rowtype;
  v_ledger public.credit_ledgers%rowtype;
  v_ticket_count integer;
  v_issued_at timestamptz;
begin
  if p_user_id is null
     or p_merchant_uid is null
     or p_imp_uid is null
     or pg_catalog.length(pg_catalog.btrim(p_imp_uid)) < 3
     or pg_catalog.length(p_imp_uid) > 100 then
    raise exception 'Valid verified payment data is required.' using errcode = '22023';
  end if;

  select * into v_order
    from public.orders
   where merchant_uid = p_merchant_uid
   for update;

  if not found then
    raise exception 'Prepared order not found.' using errcode = 'P0002';
  end if;
  if v_order.user_id is distinct from p_user_id then
    raise exception 'Payment owner mismatch.' using errcode = '42501';
  end if;

  if pg_catalog.lower(coalesce(v_order.status, '')) = 'paid' then
    if v_order.imp_uid is distinct from p_imp_uid then
      raise exception 'Payment identifier mismatch.' using errcode = '23505';
    end if;
    -- Pre-055 paid orders have no purchase lot: their balance was backfilled
    -- as legacy_balance. Never mint a second lot for such a duplicate call.
    if exists (
      select 1 from public.ticket_lots
       where source = 'purchase' and source_id = v_order.id and user_id <> p_user_id
    ) then
      raise exception 'Purchase lot owner mismatch.' using errcode = '23505';
    end if;
    select * into v_existing
      from public.ticket_lots
     where user_id = p_user_id and source = 'purchase' and source_id = v_order.id;
    if found then
      if v_existing.quantity_issued is distinct from v_order.ticket_count then
        raise exception 'Purchase lot quantity mismatch.' using errcode = '23505';
      end if;
      select * into v_ledger from public.credit_ledgers where id = v_order.id;
      if not found
         or v_ledger.user_id is distinct from p_user_id
         or v_ledger.delta is distinct from v_order.ticket_count
         or v_ledger.source is distinct from 'purchase' then
        raise exception 'Purchase audit data mismatch.' using errcode = '23505';
      end if;
    end if;
    select p.ticket_count into v_ticket_count
      from public.profiles p
     where p.id = p_user_id;
    return pg_catalog.jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ticket_count', v_ticket_count,
      'added_tickets', 0,
      'product_key', v_order.product_key
    );
  end if;

  if pg_catalog.lower(coalesce(v_order.status, '')) <> 'pending' then
    raise exception 'Order is not pending.' using errcode = '55000';
  end if;
  if v_order.product_key not in ('starter3', 'light11', 'full33', 'trial', 'single', 'admin_test_1000')
     or v_order.ticket_count is null
     or v_order.ticket_count < 1 then
    raise exception 'Prepared product is invalid.' using errcode = '22023';
  end if;
  if v_order.product_key = 'admin_test_1000' and not exists (
    select 1
      from public.profiles p
     where p.id = p_user_id
       and pg_catalog.lower(coalesce(p.role, '')) = 'admin'
  ) then
    raise exception 'Admin payment test access is required.' using errcode = '42501';
  end if;
  if exists (
    select 1
      from public.orders o
     where o.imp_uid = p_imp_uid
       and o.merchant_uid <> p_merchant_uid
  ) then
    raise exception 'Payment was already used.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.ticket_lots
     where source = 'purchase' and source_id = v_order.id
  ) then
    raise exception 'Pending order already has a purchase lot.' using errcode = '23505';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  v_issued_at := pg_catalog.now();
  insert into public.ticket_lots (
    user_id, source, source_id, quantity_issued, quantity_remaining, issued_at, expires_at
  ) values (
    p_user_id, 'purchase', v_order.id, v_order.ticket_count, v_order.ticket_count, v_issued_at,
    (((v_issued_at at time zone 'UTC') + interval '90 days') at time zone 'UTC')
  );

  v_ticket_count := public.refresh_ticket_balance_cache(p_user_id);
  insert into public.credit_ledgers (
    id, user_id, profile_id, delta, balance_after, reason, source
  ) values (
    v_order.id, p_user_id, p_user_id, v_order.ticket_count, v_ticket_count,
    'Verified purchase: ' || coalesce(v_order.product_name, v_order.product_key), 'purchase'
  );

  update public.orders
     set imp_uid = p_imp_uid,
         status = 'paid',
         product_name = v_order.product_name,
         amount = v_order.amount,
         ticket_count = v_order.ticket_count
   where id = v_order.id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'duplicate', false,
    'ticket_count', v_ticket_count,
    'added_tickets', v_order.ticket_count,
    'product_key', v_order.product_key
  );
end;
$$;

revoke all on function public.finalize_verified_ticket_purchase(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_verified_ticket_purchase(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
