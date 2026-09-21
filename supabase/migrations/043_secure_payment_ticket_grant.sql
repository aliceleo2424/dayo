-- Bind each PortOne checkout to its authenticated owner before payment, then
-- atomically grant tickets only after the server has verified the payment.

begin;

alter table public.orders
  add column if not exists product_key text;

-- A PortOne payment can fund at most one DayO order. If historical duplicate
-- imp_uid values exist, this migration fails safely instead of silently
-- preserving a double-grant condition.
create unique index if not exists orders_imp_uid_unique_idx
  on public.orders (imp_uid)
  where imp_uid is not null;

create unique index if not exists orders_merchant_uid_unique_idx
  on public.orders (merchant_uid)
  where merchant_uid is not null;

-- Pending trial checkouts may coexist, but only one can ever transition to
-- paid for the same user. A competing finalize call raises unique_violation;
-- PostgreSQL then rolls back the ticket increment from that same transaction.
drop index if exists public.orders_one_paid_trial_per_user_idx;

create unique index orders_one_paid_trial_per_user_idx
  on public.orders (user_id)
  where user_id is not null
    and product_key = 'trial'
    and pg_catalog.lower(coalesce(status, '')) in ('paid', 'complete', 'completed');

-- Browser order writes are no longer part of the payment flow.
drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "orders_select_own" on public.orders;
drop policy if exists "orders_select_admin_ops" on public.orders;

create policy "orders_select_own"
  on public.orders
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "orders_select_admin"
  on public.orders
  for select
  to authenticated
  using (public.dayo_is_admin());

revoke all privileges on table public.orders
  from public, anon, authenticated;
grant select on table public.orders to authenticated;

-- Disable the legacy browser-callable grant function when it exists. Its
-- arguments were supplied by the client and are not payment verification.
do $$
begin
  if pg_catalog.to_regprocedure(
    'public.grant_purchased_tickets(uuid,integer,text,text,text,integer)'
  ) is not null then
    execute 'revoke all on function public.grant_purchased_tickets(uuid, integer, text, text, text, integer) from public, anon, authenticated';
  end if;
end;
$$;

create or replace function public.prepare_verified_ticket_purchase(
  p_user_id uuid,
  p_product_key text,
  p_merchant_uid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_name text;
  v_amount integer;
  v_ticket_count integer;
  v_order public.orders%rowtype;
begin
  if p_user_id is null
     or p_merchant_uid is null
     or pg_catalog.length(pg_catalog.btrim(p_merchant_uid)) < 12
     or pg_catalog.length(p_merchant_uid) > 120 then
    raise exception 'Valid payment preparation data is required.' using errcode = '22023';
  end if;

  case p_product_key
    when 'starter3' then
      v_product_name := '산뜻한 3회 패키지';
      v_amount := 54900;
      v_ticket_count := 3;
    when 'light11' then
      v_product_name := '가벼운 11 패키지';
      v_amount := 179000;
      v_ticket_count := 11;
    when 'full33' then
      v_product_name := '마음껏 33 패키지';
      v_amount := 499000;
      v_ticket_count := 33;
    when 'trial' then
      v_product_name := '첫 세션 체험 할인권';
      v_amount := 9900;
      v_ticket_count := 1;
    when 'single' then
      v_product_name := '깔끔한 1회 티켓';
      v_amount := 19900;
      v_ticket_count := 1;
    else
      raise exception 'Unknown ticket product.' using errcode = '22023';
  end case;

  if not exists (
    select 1 from public.profiles where id = p_user_id
  ) then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  if p_product_key = 'trial' and exists (
    select 1
      from public.orders o
     where o.user_id = p_user_id
       and pg_catalog.lower(coalesce(o.status, '')) in ('paid', 'complete', 'completed')
       and (
         o.product_key = 'trial'
         or (o.amount = 9900 and o.ticket_count = 1)
         or coalesce(o.product_name, '') like '%체험%'
       )
  ) then
    raise exception 'Trial ticket has already been used.' using errcode = '23505';
  end if;

  insert into public.orders (
    user_id,
    merchant_uid,
    product_key,
    product_name,
    amount,
    ticket_count,
    imp_uid,
    status
  ) values (
    p_user_id,
    p_merchant_uid,
    p_product_key,
    v_product_name,
    v_amount,
    v_ticket_count,
    null,
    'pending'
  )
  returning * into v_order;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'merchant_uid', v_order.merchant_uid,
    'product_key', v_order.product_key,
    'product_name', v_order.product_name,
    'amount', v_order.amount
  );
end;
$$;

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
  v_ticket_count integer;
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
  if v_order.product_key not in ('starter3', 'light11', 'full33', 'trial', 'single')
     or v_order.ticket_count is null
     or v_order.ticket_count < 1 then
    raise exception 'Prepared product is invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1
      from public.orders o
     where o.imp_uid = p_imp_uid
       and o.merchant_uid <> p_merchant_uid
  ) then
    raise exception 'Payment was already used.' using errcode = '23505';
  end if;

  update public.profiles
     set ticket_count = coalesce(ticket_count, 0) + v_order.ticket_count,
         updated_at = pg_catalog.now()
   where id = p_user_id
   returning ticket_count into v_ticket_count;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

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

revoke all on function public.prepare_verified_ticket_purchase(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.finalize_verified_ticket_purchase(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.prepare_verified_ticket_purchase(uuid, text, text)
  to service_role;
grant execute on function public.finalize_verified_ticket_purchase(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
