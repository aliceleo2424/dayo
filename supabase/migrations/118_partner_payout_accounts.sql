-- Owner request 2026-10-14: partners register the bank account for monthly payouts.
-- Partner reads/writes only their own row; DayO admins can read for manual transfers.
create table if not exists public.partner_payout_accounts(
 partner_id uuid primary key references public.profiles(id) on delete cascade,
 bank_name text not null check (char_length(btrim(bank_name)) between 1 and 40),
 account_holder text not null check (char_length(btrim(account_holder)) between 1 and 40),
 account_number text not null check (account_number ~ '^[0-9-]{6,30}$'),
 updated_at timestamptz not null default now()
);
alter table public.partner_payout_accounts enable row level security;
revoke all on public.partner_payout_accounts from anon;
grant select, insert, update on public.partner_payout_accounts to authenticated;
drop policy if exists ppa_partner_select on public.partner_payout_accounts;
drop policy if exists ppa_partner_insert on public.partner_payout_accounts;
drop policy if exists ppa_partner_update on public.partner_payout_accounts;
drop policy if exists ppa_admin_select on public.partner_payout_accounts;
create policy ppa_partner_select on public.partner_payout_accounts for select to authenticated using (partner_id = auth.uid());
create policy ppa_partner_insert on public.partner_payout_accounts for insert to authenticated with check (
 partner_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'partner'));
create policy ppa_partner_update on public.partner_payout_accounts for update to authenticated using (partner_id = auth.uid()) with check (partner_id = auth.uid());
create policy ppa_admin_select on public.partner_payout_accounts for select to authenticated using (public.dayo_is_admin());
