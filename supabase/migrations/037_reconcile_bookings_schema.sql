-- Reconcile production bookings columns with the schema expected by existing DayO code and RPCs.

alter table public.bookings
  add column if not exists partner_user_id uuid,
  add column if not exists scheduled_at timestamptz,
  add column if not exists partner_rewarded boolean not null default false,
  add column if not exists ticket_refunded boolean not null default false,
  add column if not exists end_reason text,
  add column if not exists completed_at timestamptz;

create index if not exists bookings_partner_user_id_idx
  on public.bookings (partner_user_id);
