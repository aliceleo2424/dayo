-- Backoffice reads for KPI / partner / booking monitors (tighten when admin auth is wired)

drop policy if exists "bookings_select_admin_ops" on public.bookings;
create policy "bookings_select_admin_ops"
  on public.bookings for select
  using (true);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'orders'
  ) then
    execute 'drop policy if exists "orders_select_admin_ops" on public.orders';
    execute 'create policy "orders_select_admin_ops" on public.orders for select using (true)';
  end if;
end $$;
