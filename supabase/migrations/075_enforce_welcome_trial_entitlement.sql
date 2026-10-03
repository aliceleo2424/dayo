-- A welcome entitlement is a one-time right to buy the trial at 9,900 KRW.
-- It is not a ticket and is never consumed by a pending or failed payment.
-- The existing service-role prepare/finalize RPCs remain the only payment path.
begin;

create or replace function public.dayo_guard_trial_order_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_welcome boolean;
begin
  if new.product_key is distinct from 'trial' then
    return new;
  end if;
  if new.user_id is null
     or pg_catalog.lower(coalesce(new.status, '')) <> 'pending'
     or new.amount is distinct from 9900
     or new.ticket_count is distinct from 1 then
    raise exception 'Invalid trial order.' using errcode = '22023';
  end if;

  select p.has_welcome_coupon into v_welcome
    from public.profiles p
   where p.id = new.user_id
   for update;
  if not found or v_welcome is distinct from true then
    raise exception 'Welcome trial is unavailable.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.orders o
     where o.user_id = new.user_id
       and pg_catalog.lower(coalesce(o.status, '')) in ('paid', 'complete', 'completed')
       and (o.product_key = 'trial'
            or (o.amount = 9900 and o.ticket_count = 1)
            or coalesce(o.product_name, '') like '%체험%')
  ) then
    raise exception 'Welcome trial has already been purchased.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists dayo_guard_trial_order_insert on public.orders;
create trigger dayo_guard_trial_order_insert
before insert on public.orders
for each row execute function public.dayo_guard_trial_order_insert();

create or replace function public.dayo_consume_welcome_trial_on_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_welcome boolean;
begin
  if new.product_key is distinct from 'trial'
     or pg_catalog.lower(coalesce(new.status, '')) <> 'paid'
     or pg_catalog.lower(coalesce(old.status, '')) = 'paid' then
    return new;
  end if;
  if pg_catalog.lower(coalesce(old.status, '')) <> 'pending'
     or new.user_id is distinct from old.user_id
     or new.amount is distinct from 9900
     or new.ticket_count is distinct from 1 then
    raise exception 'Invalid trial completion.' using errcode = '22023';
  end if;

  -- finalize_verified_ticket_purchase already locks this profile before
  -- issuing a lot. The lock also serializes two separately prepared orders.
  select p.has_welcome_coupon into v_welcome
    from public.profiles p
   where p.id = new.user_id
   for update;
  if not found or v_welcome is distinct from true then
    raise exception 'Welcome trial is unavailable.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.orders o
     where o.user_id = new.user_id
       and o.id <> old.id
       and pg_catalog.lower(coalesce(o.status, '')) in ('paid', 'complete', 'completed')
       and (o.product_key = 'trial'
            or (o.amount = 9900 and o.ticket_count = 1)
            or coalesce(o.product_name, '') like '%체험%')
  ) then
    raise exception 'Welcome trial has already been purchased.' using errcode = '23505';
  end if;

  update public.profiles
     set has_welcome_coupon = false
   where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists dayo_consume_welcome_trial_on_paid on public.orders;
create trigger dayo_consume_welcome_trial_on_paid
before update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.dayo_consume_welcome_trial_on_paid();

revoke all on function public.dayo_guard_trial_order_insert() from public, anon, authenticated;
revoke all on function public.dayo_consume_welcome_trial_on_paid() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
