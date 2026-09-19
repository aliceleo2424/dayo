-- Reconcile production booking metadata columns with the schema expected by DayO.

alter table public.bookings
  add column if not exists partner_name text,
  add column if not exists language text,
  add column if not exists rating numeric;
