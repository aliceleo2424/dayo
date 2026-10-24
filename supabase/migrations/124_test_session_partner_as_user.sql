-- Owner request 2026-10-24: one person can be both Partner and User.
-- Admin test sessions now accept a Partner account in the User seat (e.g. a partner trying a Korean session).
-- Only the User-seat role check changes; admin-only, self-booking block, idempotency, timing and
-- zero ticket/reward/email effects are unchanged from 093.
CREATE OR REPLACE FUNCTION public.admin_create_test_session(p_user_id uuid, p_partner_id uuid, p_language text, p_scheduled_at timestamp with time zone, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user public.profiles%rowtype;v_partner public.profiles%rowtype;v_booking public.bookings%rowtype;
begin
  if not public.dayo_is_admin() then raise exception 'Admin access required.' using errcode='42501';end if;
  if p_request_id is null or p_user_id is null or p_partner_id is null or p_user_id=p_partner_id
    or p_language is null or p_language not in ('en','es','fr','ko') or p_scheduled_at is null then
    raise exception 'Invalid test session fields.' using errcode='22023';end if;
  -- Stable request UUID makes network retries exactly-once, including concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,92));
  select * into v_booking from public.bookings where id=p_request_id;
  if found then
    if not v_booking.is_test_session or v_booking.learner_id is distinct from p_user_id
      or v_booking.partner_user_id is distinct from p_partner_id or v_booking.language is distinct from p_language
      or v_booking.scheduled_at is distinct from p_scheduled_at then
      raise exception 'Request ID already belongs to another booking.' using errcode='23505';end if;
    return jsonb_build_object('success',true,'booking',to_jsonb(v_booking),'duration_minutes',30);
  end if;
  if p_scheduled_at<clock_timestamp() or p_scheduled_at>clock_timestamp()+interval '30 days' then
    raise exception 'Choose a future start within 30 days.' using errcode='22023';end if;
  select * into v_user from public.profiles where id=p_user_id and role in ('user','learner','partner');
  if not found then raise exception 'User profile required.' using errcode='22023';end if;
  select * into v_partner from public.profiles where id=p_partner_id and role='partner';
  if not found then raise exception 'Partner profile required.' using errcode='22023';end if;
  insert into public.bookings(id,learner_id,partner_id,partner_user_id,partner_name,
    language,scheduled_at,status,is_test_session,ticket_deducted,ticket_refunded,partner_rewarded)
  values(p_request_id,p_user_id,p_partner_id,p_partner_id,
    coalesce(nullif(v_partner.nickname,''),nullif(v_partner.user_name,''),'DayO Partner'),
    p_language,p_scheduled_at,'confirmed',true,false,false,false) returning * into v_booking;
  return jsonb_build_object('success',true,'booking',to_jsonb(v_booking),'duration_minutes',30);
end;$function$;
