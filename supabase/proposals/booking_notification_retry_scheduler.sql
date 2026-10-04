-- Apply only this reviewed scheduler proposal, never a migration directory.
-- Dedicated secret must exist in Vercel Production and Supabase Vault first.
-- No booking/ticket/refund/reward/outbox contract changes or historical backfill.
-- Synchronous HTTP avoids storing Authorization in the publicly readable pg_net queue.
begin;

do $$
begin
  if exists (select 1 from pg_extension where extname='http') then
    raise exception 'HTTP extension already exists; stop and review its permissions';
  end if;
  if not exists (select 1 from pg_extension where extname='supabase_vault') then
    raise exception 'Existing Vault is required';
  end if;
  if to_regprocedure('public.invoke_booking_notification_retry(uuid,text)') is not null then
    raise exception 'Scheduler function already exists; stop and review';
  end if;
  if not exists (select 1 from vault.secrets where name='dayo_booking_notification_retry_secret') then
    raise exception 'Dedicated scheduler secret is not configured';
  end if;
end;
$$;

create extension if not exists pg_cron;
create extension http with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname='dayo-booking-notification-retry') then
    raise exception 'Scheduler job already exists; stop and review';
  end if;
  -- Supabase owns the HTTP extension's PUBLIC ACL; postgres cannot revoke that grant.
  -- extensions is not an exposed client Data API schema (production RPC returns 406).
  -- The dedicated invoker and Vault below are separately denied to client roles.
end;
$$;

create function public.invoke_booking_notification_retry(p_booking_id uuid default null, p_event_type text default null)
returns jsonb language plpgsql set search_path='' as $$
declare
  v_secret text;
  v_body jsonb := '{}'::jsonb;
  v_response extensions.http_response;
  v_result jsonb;
begin
  if (p_booking_id is null) <> (p_event_type is null)
    or (p_event_type is not null and p_event_type not in ('booking_confirmed','booking_cancelled')) then
    raise exception 'Invalid retry scope';
  end if;
  if p_booking_id is not null then
    v_body := jsonb_build_object('bookingId',p_booking_id,'event',p_event_type);
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='dayo_booking_notification_retry_secret';
  if v_secret is null or length(v_secret) < 32 then raise exception 'Scheduler secret is unavailable'; end if;
  -- Initialize the official HTTP library before configuring its supported CURL options.
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','55000');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT','5');
  select * into v_response from extensions.http((
    'POST','https://www.dayotalk.com/api/booking-notifications-retry',
    array[row('Authorization','Bearer ' || v_secret)::extensions.http_header],
    'application/json',v_body::text
  )::extensions.http_request);
  if v_response.status <> 200 then raise exception 'Booking retry endpoint HTTP %',v_response.status; end if;
  begin
    v_result := v_response.content::jsonb;
    if v_result->>'ok' is distinct from 'true' then raise exception 'Invalid worker result'; end if;
    return jsonb_build_object('status',v_response.status,'sent',(v_result->>'sent')::integer,
      'failed',(v_result->>'failed')::integer,'review',(v_result->>'review')::integer,'batches',(v_result->>'batches')::integer);
  exception when others then
    raise exception 'Invalid booking retry endpoint response';
  end;
end;
$$;
revoke all on function public.invoke_booking_notification_retry(uuid,text) from public, anon, authenticated, service_role;

-- Leave inactive until the scoped production fixture has been verified.
select cron.schedule('dayo-booking-notification-retry','*/30 * * * *','select public.invoke_booking_notification_retry();');
select cron.alter_job(job_id := (select jobid from cron.job where jobname='dayo-booking-notification-retry'), active := false);
commit;

-- Activation after verification:
-- select cron.alter_job(job_id := (select jobid from cron.job where jobname='dayo-booking-notification-retry'), active := true);
