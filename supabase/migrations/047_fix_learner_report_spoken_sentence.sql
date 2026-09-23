-- Persist the learner's transcript-derived representative sentence while
-- preserving the participant-scoped report merge contract introduced in 046.

begin;

create or replace function public.merge_learner_session_report(
  p_booking_id uuid,
  p_report jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking_learner_id uuid;
  v_booking_partner_id uuid;
  v_booking_partner_user_id uuid;
  v_booking_partner_name text;
  v_key_expressions jsonb;
  v_word_help jsonb;
  v_feedback jsonb;
  v_quiz_score integer;
  v_rating numeric;
  v_report_id uuid;
begin
  if v_actor_id is null or p_booking_id is null then
    return jsonb_build_object(
      'success', false,
      'message', '로그인된 예약 정보를 확인할 수 없습니다.'
    );
  end if;

  p_report := coalesce(p_report, '{}'::jsonb);

  select
    bookings.learner_id,
    bookings.partner_id,
    bookings.partner_user_id,
    bookings.partner_name
  into
    v_booking_learner_id,
    v_booking_partner_id,
    v_booking_partner_user_id,
    v_booking_partner_name
  from public.bookings
  where bookings.id = p_booking_id
    and bookings.learner_id = v_actor_id
    and bookings.status in ('confirmed', 'completed')
  for share;

  if not found
     or v_booking_learner_id is null
     or v_booking_partner_user_id is null then
    return jsonb_build_object(
      'success', false,
      'message', '학습자 본인의 완료 가능한 예약만 저장할 수 있습니다.'
    );
  end if;

  v_key_expressions := case
    when jsonb_typeof(p_report -> 'key_expressions') = 'array'
      then p_report -> 'key_expressions'
    else '[]'::jsonb
  end;
  v_word_help := case
    when jsonb_typeof(p_report -> 'word_help') = 'array'
      then p_report -> 'word_help'
    else '[]'::jsonb
  end;
  v_feedback := case
    when jsonb_typeof(p_report -> 'feedback') = 'array'
      then p_report -> 'feedback'
    else '[]'::jsonb
  end;
  v_quiz_score := case
    when jsonb_typeof(p_report -> 'quiz_score') = 'number'
      then (p_report ->> 'quiz_score')::integer
    else null
  end;
  v_rating := case
    when jsonb_typeof(p_report -> 'rating') = 'number'
      then (p_report ->> 'rating')::numeric
    else null
  end;

  insert into public.session_reports as existing (
    booking_id,
    learner_id,
    partner_id,
    partner_user_id,
    partner_name,
    spoken_sentence,
    summary,
    key_expressions,
    quiz_score,
    word_help,
    feedback,
    rating
  ) values (
    p_booking_id,
    v_booking_learner_id,
    v_booking_partner_id,
    v_booking_partner_user_id,
    v_booking_partner_name,
    nullif(btrim(p_report ->> 'spoken_sentence'), ''),
    nullif(btrim(p_report ->> 'summary'), ''),
    v_key_expressions,
    v_quiz_score,
    v_word_help,
    v_feedback,
    v_rating
  )
  on conflict (booking_id) do update
    set learner_id = excluded.learner_id,
        partner_id = excluded.partner_id,
        partner_user_id = excluded.partner_user_id,
        partner_name = coalesce(excluded.partner_name, existing.partner_name),
        spoken_sentence = coalesce(excluded.spoken_sentence, existing.spoken_sentence),
        summary = excluded.summary,
        key_expressions = excluded.key_expressions,
        quiz_score = excluded.quiz_score,
        word_help = excluded.word_help,
        feedback = excluded.feedback,
        rating = excluded.rating
  returning id into v_report_id;

  return jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'learner_id', v_booking_learner_id
  );
end;
$$;

revoke all on function public.merge_learner_session_report(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.merge_learner_session_report(uuid, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
