-- Ticket purchase ledger + atomic grant after PortOne payment

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  merchant_uid text unique,
  product_name text,
  amount integer,
  ticket_count integer,
  imp_uid text,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders (user_id, created_at desc);
create index if not exists orders_imp_uid_idx on public.orders (imp_uid);

alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  using (auth.uid() = user_id);

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own"
  on public.orders for insert
  with check (auth.uid() = user_id);

create or replace function public.grant_purchased_tickets(
  p_user_id uuid,
  p_ticket_count integer,
  p_merchant_uid text,
  p_imp_uid text,
  p_product_name text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tickets integer;
  v_existing uuid;
begin
  if p_user_id is null or p_ticket_count is null or p_ticket_count < 1 then
    return jsonb_build_object('success', false, 'message', '충전 정보가 부족합니다.');
  end if;

  if auth.uid() is distinct from p_user_id then
    return jsonb_build_object('success', false, 'message', '권한이 없습니다.');
  end if;

  select id into v_existing
  from public.orders
  where merchant_uid = p_merchant_uid
  limit 1;

  if v_existing is not null then
    select ticket_count into v_tickets
    from public.profiles
    where user_id = p_user_id;
    return jsonb_build_object('success', true, 'ticket_count', v_tickets, 'duplicate', true);
  end if;

  insert into public.orders (
    user_id,
    merchant_uid,
    product_name,
    amount,
    ticket_count,
    imp_uid,
    status
  ) values (
    p_user_id,
    p_merchant_uid,
    p_product_name,
    p_amount,
    p_ticket_count,
    p_imp_uid,
    'paid'
  );

  update public.profiles
  set ticket_count = coalesce(ticket_count, 0) + p_ticket_count,
      updated_at = now()
  where user_id = p_user_id
  returning ticket_count into v_tickets;

  if v_tickets is null then
    return jsonb_build_object('success', false, 'message', '프로필을 찾을 수 없습니다.');
  end if;

  return jsonb_build_object('success', true, 'ticket_count', v_tickets);
end;
$$;

grant execute on function public.grant_purchased_tickets(uuid, integer, text, text, text, integer) to authenticated;
