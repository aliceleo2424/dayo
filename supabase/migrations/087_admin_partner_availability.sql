-- Admin-only projection of the existing booking calendar. Apply separately.
-- No availability storage, save function, booking policy or RLS changes.
begin;
do $preflight$
begin
  if to_regprocedure('public.get_booking_calendar_slots(uuid[])') is null
    or to_regprocedure('public.availability_kst_start(text)') is null
    or to_regprocedure('public.dayo_is_admin()') is null then
    raise exception 'Existing booking calendar and admin contracts are required';
  end if;
end;
$preflight$;

create function public.get_admin_partner_availability(p_partner_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Asia/Seoul')::date;
  v_available jsonb;
  v_slots jsonb;
  v_languages text[];
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_partner_id is null or not exists (
    select 1 from public.profiles where id=p_partner_id and role='partner'
  ) then raise exception 'Partner profile not found' using errcode='P0002'; end if;

  -- Reuse the same weekly/override materialization and confirmed-booking
  -- exclusions as Smart Booking; never reproduce its availability save logic.
  v_available := public.get_booking_calendar_slots(array[p_partner_id]);
  select conversation_languages into v_languages from public.partner_capabilities
    where partner_id=p_partner_id;
  select coalesce(jsonb_agg(row order by starts_at,status),'[]'::jsonb) into v_slots
  from (
    select jsonb_build_object('id',x->>'id','slot_time',x->>'slot_time','status','available') row,
      public.availability_kst_start(x->>'slot_time') starts_at, 'available' status
    from jsonb_array_elements(v_available) x
    where public.availability_kst_start(x->>'slot_time') >= v_now + interval '4 hours'
      and coalesce(v_languages && array['en','es','fr','ko']::text[],false)
      and not exists (select 1 from public.bookings b where b.status='confirmed'
        and (b.slot_id=(x->>'id')::uuid or (b.partner_id=p_partner_id
          and b.scheduled_at=public.availability_kst_start(x->>'slot_time'))))
    union all
    select jsonb_build_object('id',s.id,'slot_time',s.slot_time,'status','booked'),
      public.availability_kst_start(s.slot_time), 'booked'
    from public.availability_slots s
    where s.partner_id=p_partner_id
      and public.availability_kst_start(s.slot_time)>v_now
      and (public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul')::date between v_today and v_today+29
      and (s.status='booked' or exists (select 1 from public.bookings b where b.status='confirmed'
        and (b.slot_id=s.id or (b.partner_id=p_partner_id and b.scheduled_at=public.availability_kst_start(s.slot_time)))))
  ) effective;
  return jsonb_build_object('partner_id',p_partner_id,'start',v_today,'end',v_today+29,
    'as_of',v_now,'min_lead_hours',4,'capability_configured',coalesce(v_languages && array['en','es','fr','ko']::text[],false),
    'slots',v_slots);
end;
$$;
revoke all on function public.get_admin_partner_availability(uuid) from public,anon,authenticated;
grant execute on function public.get_admin_partner_availability(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
