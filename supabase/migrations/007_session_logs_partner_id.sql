-- Partner earnings: tag completed sessions with the partner account
alter table public.session_logs
  add column if not exists partner_id uuid;

create index if not exists session_logs_partner_id_idx on public.session_logs (partner_id);
