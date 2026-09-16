-- Partner master controls: soft status, tax-document metadata and slot visibility.

alter table public.profiles
  add column if not exists partner_status text not null default 'active',
  add column if not exists nationality text,
  add column if not exists identity_number_masked text,
  add column if not exists id_document_url text,
  add column if not exists bank_document_url text;

alter table public.profiles
  drop constraint if exists profiles_partner_status_check;

alter table public.profiles
  add constraint profiles_partner_status_check
  check (partner_status in ('active', 'vacation', 'suspended', 'withdrawn'));

alter table public.availability_slots
  drop constraint if exists availability_slots_status_check;

alter table public.availability_slots
  add constraint availability_slots_status_check
  check (status in ('available', 'booked', 'hidden'));

create or replace function public.sync_partner_slot_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.partner_status in ('vacation', 'suspended', 'withdrawn')
     and old.partner_status is distinct from new.partner_status then
    update public.availability_slots
       set status = 'hidden', updated_at = now()
     where partner_id in (new.id, new.user_id)
       and status = 'available';
  elsif new.partner_status = 'active'
     and old.partner_status is distinct from new.partner_status then
    update public.availability_slots
       set status = 'available', updated_at = now()
     where partner_id in (new.id, new.user_id)
       and status = 'hidden';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_partner_status_slot_visibility on public.profiles;
create trigger profiles_partner_status_slot_visibility
after update of partner_status on public.profiles
for each row execute function public.sync_partner_slot_visibility();

-- Partner rows are operational audit records. Withdrawal is a soft status,
-- so direct profile deletion is blocked and related session/report/ledger rows remain.
create or replace function public.prevent_partner_hard_delete()
returns trigger
language plpgsql
as $$
begin
  if old.role in ('partner', 'admin') or old.partner_status = 'withdrawn' then
    raise exception 'Partner profiles must be withdrawn, not deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists profiles_prevent_partner_hard_delete on public.profiles;
create trigger profiles_prevent_partner_hard_delete
before delete on public.profiles
for each row execute function public.prevent_partner_hard_delete();
