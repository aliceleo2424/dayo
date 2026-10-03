-- PROPOSAL ONLY: assign a migration number after the parallel booking work lands.
-- Do not apply to production until this SQL and the dispatch/retry wiring are reviewed.
-- No historical backfill, booking RPC replacement, ticket/refund/reward changes.
begin;

create table public.booking_notification_log (
  event_key text primary key,
  booking_id uuid not null references public.bookings(id),
  event_type text not null check (event_type in ('booking_confirmed', 'booking_cancelled')),
  recipient_role text not null check (recipient_role in ('partner', 'learner')),
  recipient_user_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'failed', 'sent', 'skipped', 'needs_review')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  delivery_payload jsonb,
  first_attempt_at timestamptz,
  provider_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (booking_id, event_type, recipient_role),
  check (event_key = event_type || ':' || booking_id::text || ':' || recipient_role)
);
create index booking_notification_retry_idx on public.booking_notification_log (next_attempt_at)
  where status in ('pending', 'failed', 'sending');
alter table public.booking_notification_log enable row level security;
revoke all on public.booking_notification_log from public, anon, authenticated;
grant select, update on public.booking_notification_log to service_role;

create function public.enqueue_booking_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event text;
  v_snapshot jsonb;
begin
  if old.status = 'pending' and new.status = 'confirmed' and new.ticket_deducted is true then
    v_event := 'booking_confirmed';
  elsif old.status = 'confirmed' and new.status = 'cancelled'
    and new.end_reason in ('user_cancelled_early', 'user_cancelled_late') then
    v_event := 'booking_cancelled';
  else
    return new;
  end if;
  if new.learner_id is null or new.partner_user_id is null or new.scheduled_at is null then
    raise exception 'Incomplete booking notification identity';
  end if;
  v_snapshot := pg_catalog.jsonb_build_object(
    'learner_id', new.learner_id, 'partner_user_id', new.partner_user_id,
    'scheduled_at', new.scheduled_at, 'language', new.language,
    'end_reason', new.end_reason, 'ticket_refunded', new.ticket_refunded,
    'partner_rewarded', new.partner_rewarded
  );
  insert into public.booking_notification_log(event_key, booking_id, event_type, recipient_role, recipient_user_id, snapshot)
  values (v_event || ':' || new.id::text || ':partner', new.id, v_event, 'partner', new.partner_user_id, v_snapshot)
  on conflict (booking_id, event_type, recipient_role) do nothing;
  if v_event = 'booking_confirmed' then
    insert into public.booking_notification_log(event_key, booking_id, event_type, recipient_role, recipient_user_id, snapshot)
    values (v_event || ':' || new.id::text || ':learner', new.id, v_event, 'learner', new.learner_id, v_snapshot)
    on conflict (booking_id, event_type, recipient_role) do nothing;
  end if;
  return new;
exception when others then
  -- Notification enqueue failures must not roll back booking/ticket/cancellation.
  -- Monitor this code in database logs; no email or token is included.
  raise warning 'DAYO_BOOKING_NOTIFICATION_ENQUEUE_FAILED SQLSTATE=%', sqlstate;
  return new;
end;
$$;
revoke all on function public.enqueue_booking_notification() from public, anon, authenticated, service_role;
create trigger enqueue_booking_notification after update of status on public.bookings
  for each row execute function public.enqueue_booking_notification();

create function public.claim_booking_notification(p_booking_id uuid default null, p_event_type text default null)
returns setof public.booking_notification_log
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
begin
  -- Both scoped participant delivery and a server-only retry worker use this lock.
  update public.booking_notification_log n set status = 'needs_review', last_error = 'retry_limit_or_window_expired', lease_token = null, lease_until = null
    where (p_booking_id is null or n.booking_id = p_booking_id)
      and (p_event_type is null or n.event_type = p_event_type)
      and n.status in ('pending', 'failed', 'sending')
      and (n.lease_until is null or n.lease_until < pg_catalog.now())
      and (n.attempts >= 10 or n.first_attempt_at <= pg_catalog.now() - interval '23 hours');
  update public.booking_notification_log n set status = 'skipped', last_error = 'event_superseded', lease_token = null, lease_until = null
    from public.bookings b
    where n.booking_id = b.id
      and (p_booking_id is null or n.booking_id = p_booking_id)
      and (p_event_type is null or n.event_type = p_event_type)
      and n.status in ('pending', 'failed', 'sending')
      and (n.lease_until is null or n.lease_until < pg_catalog.now())
      and (b.learner_id::text is distinct from n.snapshot->>'learner_id'
        or b.partner_user_id::text is distinct from n.snapshot->>'partner_user_id'
        or (n.event_type = 'booking_confirmed' and (b.status is distinct from 'confirmed' or b.ticket_deducted is distinct from true))
        or (n.event_type = 'booking_cancelled' and (b.status is distinct from 'cancelled' or not coalesce(b.end_reason in ('user_cancelled_early', 'user_cancelled_late'), false))));
  select n.event_key into v_key from public.booking_notification_log n
    where (p_booking_id is null or n.booking_id = p_booking_id)
      and (p_event_type is null or n.event_type = p_event_type)
      and n.status in ('pending', 'failed', 'sending')
      and n.next_attempt_at <= pg_catalog.now()
      and (n.lease_until is null or n.lease_until < pg_catalog.now())
    order by n.created_at, n.event_key
    limit 1 for update skip locked;
  if v_key is null then return; end if;
  return query update public.booking_notification_log n
    set status = 'sending', attempts = n.attempts + 1, lease_token = pg_catalog.gen_random_uuid(), lease_until = pg_catalog.now() + interval '2 minutes'
    where n.event_key = v_key returning n.*;
end;
$$;
revoke all on function public.claim_booking_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_booking_notification(uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
