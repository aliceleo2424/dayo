-- Store a live-room safety report without ending the booking or changing tickets.
create function public.submit_safety_report_only(
  p_session_id uuid,
  p_target_id uuid,
  p_reason text,
  p_transcript_snapshot jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter uuid := auth.uid();
  v_learner uuid;
  v_partner uuid;
  v_target uuid;
  v_reason text := trim(coalesce(p_reason, ''));
  v_snapshot jsonb := coalesce(p_transcript_snapshot, '[]'::jsonb);
  v_report_id uuid;
begin
  if v_reporter is null then
    return jsonb_build_object('success', false, 'code', 'unauthorized', 'message', '로그인이 필요합니다.');
  end if;
  if char_length(v_reason) = 0 or char_length(v_reason) > 500 then
    return jsonb_build_object('success', false, 'code', 'invalid_reason', 'message', '신고 사유를 500자 이내로 입력해 주세요.');
  end if;
  if jsonb_typeof(v_snapshot) <> 'array' or octet_length(v_snapshot::text) > 65536 then
    return jsonb_build_object('success', false, 'code', 'invalid_snapshot', 'message', '대화 기록이 너무 깁니다. 다시 시도해 주세요.');
  end if;

  select learner_id, partner_user_id
    into v_learner, v_partner
    from public.bookings
   where id = p_session_id
     and (learner_id = v_reporter or partner_user_id = v_reporter);

  if not found then
    return jsonb_build_object('success', false, 'code', 'invalid_session', 'message', '신고 가능한 예약 세션을 찾을 수 없습니다.');
  end if;

  v_target := case when v_reporter = v_learner then v_partner else v_learner end;
  if v_target is null or v_target = v_reporter or (p_target_id is not null and p_target_id <> v_target) then
    return jsonb_build_object('success', false, 'code', 'invalid_target', 'message', '신고 대상 정보를 확인할 수 없습니다.');
  end if;

  insert into public.safety_reports (session_id, reporter_id, target_id, reason, transcript_snapshot)
  values (p_session_id, v_reporter, v_target, v_reason, v_snapshot)
  on conflict (session_id, reporter_id) do nothing
  returning id into v_report_id;

  if v_report_id is null then
    return jsonb_build_object('success', false, 'code', 'already_reported', 'message', '이미 신고가 접수되었습니다.');
  end if;

  insert into public.admin_notifications (kind, title, message, session_id, safety_report_id)
  values (
    'safety_emergency',
    '🚨 비상 신고 접수',
    '세션 ID: ' || p_session_id::text || ' / 신고 사유: ' || v_reason || ' / 신고자: ' || v_reporter::text,
    p_session_id,
    v_report_id
  );

  return jsonb_build_object('success', true, 'report_id', v_report_id);
end;
$$;

revoke execute on function public.submit_safety_report_only(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.submit_safety_report_only(uuid, uuid, text, jsonb) to authenticated;
