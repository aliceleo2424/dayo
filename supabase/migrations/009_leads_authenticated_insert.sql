-- Allow both anonymous and signed-in visitors to capture quiz leads.
grant insert on public.leads to anon, authenticated;

drop policy if exists "leads_insert_authenticated" on public.leads;
create policy "leads_insert_authenticated"
  on public.leads for insert
  to authenticated
  with check (true);
