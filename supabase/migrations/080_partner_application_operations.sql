begin;

-- Preserve historical applications; New means not yet opened in this review UI.
alter table public.partner_applications
  add column first_viewed_at timestamptz,
  add column shortlisted boolean not null default false;
grant update (shortlisted) on public.partner_applications to authenticated;

-- Reuse the existing admin authorization. The first timestamp cannot be reset
-- through the authenticated column grants, or overwritten by concurrent opens.
create function public.mark_partner_application_viewed(p_id uuid)
returns public.partner_applications language plpgsql security definer set search_path = '' as $$
declare v_row public.partner_applications;
begin
  if not public.dayo_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  update public.partner_applications
    set first_viewed_at = coalesce(first_viewed_at, now())
    where id = p_id returning * into v_row;
  if not found then raise exception 'Application not found.' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;
revoke all on function public.mark_partner_application_viewed(uuid) from public, anon;
grant execute on function public.mark_partner_application_viewed(uuid) to authenticated;

-- An immutable, minimal email snapshot; no contact details or media paths.
-- Only new submissions enqueue notifications. Existing rows are not backfilled.
create table public.partner_application_notifications (
  application_id uuid primary key references public.partner_applications(id) on delete cascade,
  queued_at timestamptz not null default now(),
  payload jsonb not null,
  sent_at timestamptz,
  provider_id text,
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  locked_until timestamptz,
  lease_token uuid,
  last_error text
);
alter table public.partner_application_notifications enable row level security;
revoke all on public.partner_application_notifications from public, anon, authenticated;
grant select on public.partner_application_notifications to service_role;

create function public.enqueue_partner_application_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.partner_application_notifications(application_id, payload)
  values (new.id, pg_catalog.jsonb_build_object(
    'full_name', new.full_name, 'nationality', new.nationality,
    'native_languages', new.native_languages, 'partner_languages', new.partner_languages,
    'current_country', new.current_country, 'visa_type', new.visa_type,
    'weekly_session_capacity', new.weekly_session_capacity,
    'review_score', new.review_score, 'review_status', new.review_status
  ));
  return new;
exception when others then
  -- Notification bookkeeping must never reject an otherwise valid submission.
  raise warning 'Partner application notification could not be queued.';
  return new;
end;
$$;
revoke all on function public.enqueue_partner_application_notification() from public, anon, authenticated;
create trigger partner_application_notification_queue after insert on public.partner_applications
  for each row execute function public.enqueue_partner_application_notification();

-- A lease prevents concurrent webhook deliveries from sending the same email.
-- Resend retains idempotency keys for 24h; ambiguous retries stop within that
-- window and remain visible in the queue for an operator to inspect.
create function public.claim_partner_application_notification(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job public.partner_application_notifications;
begin
  update public.partner_application_notifications
    set lease_token = gen_random_uuid(), locked_until = now() + interval '1 minute',
        attempts = attempts + 1, first_attempt_at = coalesce(first_attempt_at, now())
    where application_id = p_application_id and sent_at is null
      and (locked_until is null or locked_until < now())
      and (first_attempt_at is null or first_attempt_at > now() - interval '23 hours')
    returning * into v_job;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('application_id',v_job.application_id,
    'lease_token',v_job.lease_token,'payload',v_job.payload);
end;
$$;
revoke all on function public.claim_partner_application_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_partner_application_notification(uuid) to service_role;

create function public.finish_partner_application_notification(
  p_application_id uuid, p_lease_token uuid, p_provider_id text, p_error text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (p_provider_id is null and p_error is null) or (p_provider_id is not null and p_error is not null)
    or length(coalesce(p_provider_id,'')) > 200 or length(coalesce(p_error,'')) > 100 then
    raise exception 'Invalid notification result.' using errcode = '22023';
  end if;
  update public.partner_application_notifications
    set sent_at = case when p_provider_id is not null then now() else null end,
        provider_id = p_provider_id, last_error = p_error, locked_until = null, lease_token = null
    where application_id = p_application_id and lease_token = p_lease_token and sent_at is null;
  return found;
end;
$$;
revoke all on function public.finish_partner_application_notification(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_partner_application_notification(uuid,uuid,text,text) to service_role;

commit;
