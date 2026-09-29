-- Canonical transcript identity and idempotent participant snapshots.
--
-- Production preflight (2026-09-28) found an empty legacy table with:
-- id uuid PK, user_id uuid, room_id text, transcript jsonb, feedback jsonb,
-- created_at timestamptz. Legacy columns/rows remain additive and untouched.

begin;

alter table public.session_logs
  add column if not exists booking_id uuid,
  add column if not exists participant_id uuid,
  add column if not exists participant_role text,
  add column if not exists learner_id uuid,
  add column if not exists partner_id uuid,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'session_logs_participant_role_check'
       and conrelid = 'public.session_logs'::pg_catalog.regclass
  ) then
    alter table public.session_logs
      add constraint session_logs_participant_role_check
      check (participant_role is null or participant_role in ('learner', 'partner'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'session_logs_canonical_identity_check'
       and conrelid = 'public.session_logs'::pg_catalog.regclass
  ) then
    alter table public.session_logs
      add constraint session_logs_canonical_identity_check
      check (
        participant_role is null
        or (
          booking_id is not null
          and
          participant_id is not null
          and learner_id is not null
          and partner_id is not null
          and room_id is not null
          and room_id = booking_id::text
          and pg_catalog.jsonb_typeof(transcript) = 'array'
        )
      );
  end if;

  -- The production preflight found zero session_logs rows and no orphan
  -- booking participant identities, so canonical foreign keys are safe.
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'session_logs_booking_id_fkey'
       and conrelid = 'public.session_logs'::pg_catalog.regclass
  ) then
    alter table public.session_logs
      add constraint session_logs_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'session_logs_participant_id_fkey'
       and conrelid = 'public.session_logs'::pg_catalog.regclass
  ) then
    alter table public.session_logs
      add constraint session_logs_participant_id_fkey
      foreign key (participant_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'session_logs_learner_id_fkey'
       and conrelid = 'public.session_logs'::pg_catalog.regclass
  ) then
    alter table public.session_logs
      add constraint session_logs_learner_id_fkey
      foreign key (learner_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'session_logs_partner_id_fkey'
       and conrelid = 'public.session_logs'::pg_catalog.regclass
  ) then
    alter table public.session_logs
      add constraint session_logs_partner_id_fkey
      foreign key (partner_id) references public.profiles(id) on delete cascade;
  end if;
end
$constraints$;

create unique index if not exists session_logs_booking_participant_role_unique
  on public.session_logs (booking_id, participant_role)
  where booking_id is not null and participant_role is not null;

create index if not exists session_logs_participant_lookup_idx
  on public.session_logs (participant_id, participant_role, booking_id)
  where booking_id is not null;

create or replace function public.upsert_session_transcript(
  p_booking_id uuid,
  p_transcript jsonb,
  p_started_at timestamptz,
  p_ended_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_learner_id uuid;
  v_partner_profile_id uuid;
  v_partner_user_id uuid;
  v_scheduled_at timestamptz;
  v_session_window_start timestamptz;
  v_session_window_end timestamptz;
  v_participant_role text;
  v_clean_transcript jsonb;
  v_item jsonb;
  v_item_timestamp timestamptz;
  v_session_log_id uuid;
begin
  if v_actor_id is null then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'auth_required',
      'message', '로그인이 필요합니다.'
    );
  end if;

  if p_booking_id is null then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'invalid_booking_id',
      'message', '예약 ID가 필요합니다.'
    );
  end if;

  select bookings.learner_id, bookings.partner_id, bookings.partner_user_id, bookings.scheduled_at
    into v_learner_id, v_partner_profile_id, v_partner_user_id, v_scheduled_at
    from public.bookings
   where bookings.id = p_booking_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'booking_not_found',
      'message', '예약을 찾을 수 없습니다.'
    );
  end if;

  if v_learner_id is null or v_partner_profile_id is null or v_partner_user_id is null then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'booking_identity_incomplete',
      'message', '예약 참여자 정보가 완전하지 않습니다.'
    );
  end if;

  if v_actor_id = v_learner_id then
    v_participant_role := 'learner';
  elsif v_actor_id = v_partner_user_id then
    v_participant_role := 'partner';
  else
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'not_booking_participant',
      'message', '이 예약의 참여자만 대화 기록을 저장할 수 있습니다.'
    );
  end if;

  if p_transcript is null or pg_catalog.jsonb_typeof(p_transcript) <> 'array' then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'invalid_transcript',
      'message', '대화 기록은 JSON 배열이어야 합니다.'
    );
  end if;

  if pg_catalog.jsonb_array_length(p_transcript) > 1000
     or pg_catalog.octet_length(p_transcript::pg_catalog.text) > 1048576 then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'transcript_too_large',
      'message', '대화 기록 크기 제한을 초과했습니다.'
    );
  end if;

  v_session_window_start := v_scheduled_at - interval '5 minutes';
  v_session_window_end := v_scheduled_at + interval '35 minutes';

  if v_scheduled_at is null
     or p_started_at is null
     or p_ended_at is null
     or p_ended_at < p_started_at
     or p_started_at < v_session_window_start
     or p_started_at > v_session_window_end
     or p_ended_at < v_session_window_start
     or p_ended_at > v_session_window_end then
    return pg_catalog.jsonb_build_object(
      'success', false,
      'code', 'invalid_session_window',
      'message', '세션 시작/종료 시각을 확인해 주세요.'
    );
  end if;

  -- Malformed/out-of-window rows are omitted. Missing or invalid timestamps
  -- are never inferred or clamped, and browser speaker labels never determine
  -- participant identity.
  v_clean_transcript := '[]'::pg_catalog.jsonb;
  for v_item in
    select items.item
      from pg_catalog.jsonb_array_elements(p_transcript) with ordinality as items(item, ordinality)
     order by items.ordinality
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.jsonb_typeof(v_item -> 'speaker') <> 'string'
       or pg_catalog.lower(pg_catalog.btrim(v_item ->> 'speaker')) <> v_participant_role
       or pg_catalog.jsonb_typeof(v_item -> 'text') <> 'string'
       or pg_catalog.char_length(pg_catalog.btrim(v_item ->> 'text')) not between 1 and 4000
       or pg_catalog.jsonb_typeof(v_item -> 'timestamp') <> 'string'
       or pg_catalog.btrim(v_item ->> 'timestamp') !~
         '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      continue;
    end if;

    begin
      v_item_timestamp := (v_item ->> 'timestamp')::pg_catalog.timestamptz;
    exception when others then
      continue;
    end;

    if v_item_timestamp < v_session_window_start
       or v_item_timestamp > v_session_window_end then
      continue;
    end if;

    v_clean_transcript := v_clean_transcript || pg_catalog.jsonb_build_array(v_item);
  end loop;

  insert into public.session_logs (
    booking_id,
    participant_id,
    participant_role,
    learner_id,
    partner_id,
    user_id,
    room_id,
    transcript,
    started_at,
    ended_at,
    updated_at
  ) values (
    p_booking_id,
    v_actor_id,
    v_participant_role,
    v_learner_id,
    v_partner_profile_id,
    v_actor_id,
    p_booking_id::pg_catalog.text,
    v_clean_transcript,
    p_started_at,
    p_ended_at,
    pg_catalog.now()
  )
  on conflict (booking_id, participant_role)
    where booking_id is not null and participant_role is not null
  do update set
    participant_id = excluded.participant_id,
    learner_id = excluded.learner_id,
    partner_id = excluded.partner_id,
    user_id = excluded.user_id,
    room_id = excluded.room_id,
    transcript = excluded.transcript,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    updated_at = pg_catalog.now()
  returning session_logs.id into v_session_log_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'session_log_id', v_session_log_id,
    'booking_id', p_booking_id,
    'participant_id', v_actor_id,
    'participant_role', v_participant_role,
    'partner_id', v_partner_profile_id,
    'item_count', pg_catalog.jsonb_array_length(v_clean_transcript)
  );
end
$function$;

-- Replace the production public ALL policy and all historical tracked policies
-- with a read-only owner/admin policy. New browser writes must use the RPC.
do $policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'session_logs'
  loop
    execute pg_catalog.format('drop policy if exists %I on public.session_logs', v_policy.policyname);
  end loop;
end
$policies$;

alter table public.session_logs enable row level security;

create policy "session_logs_select_owner_or_admin"
  on public.session_logs
  for select
  to authenticated
  using (
    participant_id = auth.uid()
    or (
      booking_id is null
      and user_id = auth.uid()
    )
    or public.dayo_is_admin()
  );

revoke all on table public.session_logs from public, anon, authenticated;
grant select on table public.session_logs to authenticated;

revoke all on function public.upsert_session_transcript(uuid, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.upsert_session_transcript(uuid, jsonb, timestamptz, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';

commit;
