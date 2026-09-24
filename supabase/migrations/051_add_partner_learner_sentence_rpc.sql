-- Allow the assigned partner to read only the learner's canonical sentence
-- for the same confirmed or completed booking.

begin;

create or replace function public.get_partner_learner_spoken_sentence(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_partner_user_id uuid;
  v_spoken_sentence text;
begin
  if v_actor_id is null or p_booking_id is null then
    return jsonb_build_object(
      'success', false,
      'message', '조회 권한을 확인할 수 없습니다.'
    );
  end if;

  select bookings.partner_user_id
  into v_partner_user_id
  from public.bookings
  where bookings.id = p_booking_id
    and bookings.status in ('confirmed', 'completed');

  if not found
     or v_partner_user_id is null
     or v_partner_user_id <> v_actor_id then
    return jsonb_build_object(
      'success', false,
      'message', '배정된 파트너만 문장을 확인할 수 있습니다.'
    );
  end if;

  select nullif(btrim(session_reports.spoken_sentence), '')
  into v_spoken_sentence
  from public.session_reports
  where session_reports.booking_id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'spoken_sentence', v_spoken_sentence
  );
end;
$$;

revoke all on function public.get_partner_learner_spoken_sentence(uuid)
  from public, anon, authenticated;

grant execute on function public.get_partner_learner_spoken_sentence(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
