-- Make partner rewards evidence-based, auditable, and safe to retry.
-- Report and transcript persistence remain separate concerns.

begin;

-- The canonical bookings contract has always defined partner_rewarded as
-- NOT NULL DEFAULT false. Do not reinterpret nullable production drift as an
-- unpaid booking: fail the migration and require an explicit schema review.
do $dayo_partner_reward_contract$
declare
  v_is_nullable text;
  v_column_default text;
begin
  select columns.is_nullable, columns.column_default
  into v_is_nullable, v_column_default
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'bookings'
    and columns.column_name = 'partner_rewarded';

  if not found then
    raise exception 'bookings.partner_rewarded is required before applying migration 071.';
  end if;

  if v_is_nullable is distinct from 'NO' then
    raise exception 'bookings.partner_rewarded must be NOT NULL before applying migration 071.';
  end if;

  if v_column_default is null
     or btrim(lower(v_column_default)) not in ('false', 'false::boolean') then
    raise exception 'bookings.partner_rewarded must default to false before applying migration 071.';
  end if;
end;
$dayo_partner_reward_contract$;

create table public.partner_session_rewards (
  booking_id uuid primary key
    references public.bookings(id) on delete restrict,
  partner_id uuid not null
    references public.profiles(id) on delete restrict,
  reward_amount integer not null,
  created_at timestamptz not null default now(),
  constraint partner_session_rewards_amount_check
    check (reward_amount = 6000)
);

create index partner_session_rewards_partner_created_idx
  on public.partner_session_rewards (partner_id, created_at desc);

alter table public.partner_session_rewards enable row level security;

revoke all privileges on table public.partner_session_rewards
  from public, anon, authenticated;
grant all privileges on table public.partner_session_rewards
  to service_role;

create or replace function public.complete_session_and_reward_partner(
  p_booking_id uuid,
  p_partner_user_id uuid,
  p_reward_amount integer default 6000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking_partner_id uuid;
  v_booking_status text;
  v_scheduled_at timestamptz;
  v_partner_rewarded boolean;
  v_end_reason text;
  v_ended_at timestamptz;
  v_profile_role text;
  v_points integer;
  v_ledger_partner_id uuid;
  v_ledger_amount integer;
  v_has_partner_media boolean := false;
  v_reward_amount constant integer := 6000;
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'unauthorized',
      'message', '로그인이 필요합니다.'
    );
  end if;

  if p_booking_id is null
     or p_partner_user_id is null
     or p_partner_user_id is distinct from v_actor_id then
    return jsonb_build_object(
      'success', false,
      'code', 'partner_identity_mismatch',
      'message', '파트너 본인만 보상을 받을 수 있습니다.'
    );
  end if;

  select
    bookings.partner_user_id,
    bookings.status,
    bookings.scheduled_at,
    bookings.partner_rewarded,
    bookings.end_reason,
    bookings.ended_at
  into
    v_booking_partner_id,
    v_booking_status,
    v_scheduled_at,
    v_partner_rewarded,
    v_end_reason,
    v_ended_at
  from public.bookings
  where bookings.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'booking_not_found',
      'message', '실제 예약 ID를 찾을 수 없습니다.'
    );
  end if;

  if v_booking_partner_id is null
     or v_booking_partner_id is distinct from v_actor_id then
    return jsonb_build_object(
      'success', false,
      'code', 'booking_partner_mismatch',
      'message', '예약된 파트너 정보가 일치하지 않습니다.'
    );
  end if;

  select profiles.role, coalesce(profiles.point_balance, 0)
  into v_profile_role, v_points
  from public.profiles
  where profiles.id = v_actor_id;

  if not found or v_profile_role is distinct from 'partner' then
    return jsonb_build_object(
      'success', false,
      'code', 'partner_profile_required',
      'message', '파트너 프로필을 찾을 수 없습니다.'
    );
  end if;

  select rewards.partner_id, rewards.reward_amount
  into v_ledger_partner_id, v_ledger_amount
  from public.partner_session_rewards as rewards
  where rewards.booking_id = p_booking_id;

  if v_ledger_partner_id is not null
     and v_ledger_partner_id is distinct from v_actor_id then
    return jsonb_build_object(
      'success', false,
      'code', 'reward_state_conflict',
      'needs_review', true,
      'message', '보상 기록 확인이 필요합니다.'
    );
  end if;

  -- NULL is outside the canonical NOT NULL contract. Never infer that it is
  -- unpaid, because the historical reward state cannot be proven safely.
  if v_partner_rewarded is null then
    return jsonb_build_object(
      'success', false,
      'code', 'reward_state_conflict',
      'needs_review', true,
      'evidence', 'booking_reward_flag_null',
      'message', '예약의 partner_rewarded 상태가 비어 있어 보상 여부 확인이 필요합니다.'
    );
  end if;

  -- A true flag without a ledger is a legacy reward completed before 071.
  if v_partner_rewarded is true and v_ledger_partner_id is null then
    return jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'legacy_reward', true,
      'reward_amount', v_reward_amount,
      'rewarded_points', v_reward_amount,
      'updated_points', coalesce(v_points, 0),
      'booking_status', 'completed'
    );
  end if;

  -- A true flag with the assigned partner's ledger is normal idempotency.
  if v_partner_rewarded is true and v_ledger_partner_id is not null then
    return jsonb_build_object(
      'success', true,
      'already_rewarded', true,
      'legacy_reward', false,
      'reward_amount', v_ledger_amount,
      'rewarded_points', v_ledger_amount,
      'updated_points', coalesce(v_points, 0),
      'booking_status', 'completed'
    );
  end if;

  -- A ledger without the committed booking flag is ambiguous. It may reflect
  -- a manual or partial write, so neither retry payment nor repair the flag.
  if v_partner_rewarded is false and v_ledger_partner_id is not null then
    return jsonb_build_object(
      'success', false,
      'code', 'reward_state_conflict',
      'needs_review', true,
      'evidence', 'ledger_present_booking_flag_false',
      'message', '보상 ledger가 있지만 예약의 partner_rewarded가 false입니다. 실제 포인트 지급 여부를 확인해 주세요.'
    );
  end if;

  if v_booking_status <> 'confirmed'
     and not (v_booking_status = 'completed' and v_end_reason = 'normal') then
    return jsonb_build_object(
      'success', false,
      'code', 'booking_not_rewardable',
      'message', '보상할 수 있는 예약 상태가 아닙니다.'
    );
  end if;

  if v_scheduled_at is null or now() < v_scheduled_at + interval '25 minutes' then
    return jsonb_build_object(
      'success', false,
      'code', 'session_in_progress',
      'message', '라이브 대화 시간이 종료된 후에 보상받을 수 있습니다.'
    );
  end if;

  if v_end_reason is distinct from 'normal' or v_ended_at is null then
    return jsonb_build_object(
      'success', false,
      'code', 'evidence_insufficient',
      'needs_review', true,
      'evidence', 'learner_normal_completion_missing',
      'message', '학습자의 정상 완료 기록을 확인할 수 없습니다.'
    );
  end if;

  select exists (
    select 1
    from public.session_events as events
    where events.booking_id = p_booking_id
      and events.actor_user_id = v_actor_id
      and events.event_type = 'media_connected'
  ) into v_has_partner_media;

  if not v_has_partner_media then
    return jsonb_build_object(
      'success', false,
      'code', 'evidence_insufficient',
      'needs_review', true,
      'evidence', 'partner_media_connected_missing',
      'message', '파트너의 세션 참여 기록을 확인할 수 없습니다.'
    );
  end if;

  -- p_reward_amount remains in the signature for compatibility only.
  -- The client cannot influence the server-owned reward amount.
  select profiles.point_balance
  into v_points
  from public.profiles
  where profiles.id = v_actor_id
    and profiles.role = 'partner'
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'partner_profile_required',
      'message', '파트너 프로필을 찾을 수 없습니다.'
    );
  end if;

  insert into public.partner_session_rewards (
    booking_id,
    partner_id,
    reward_amount
  ) values (
    p_booking_id,
    v_actor_id,
    v_reward_amount
  );

  update public.profiles
  set point_balance = coalesce(point_balance, 0) + v_reward_amount,
      updated_at = now()
  where id = v_actor_id
    and role = 'partner'
  returning point_balance into v_points;

  if not found then
    raise exception 'Partner profile state changed while rewarding the session.'
      using errcode = '40001';
  end if;

  update public.bookings
  set status = 'completed',
      partner_rewarded = true,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = p_booking_id
    and partner_user_id = v_actor_id
    and partner_rewarded is false;

  if not found then
    raise exception 'Booking reward state changed while completing the session.'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'success', true,
    'already_rewarded', false,
    'legacy_reward', false,
    'reward_amount', v_reward_amount,
    'rewarded_points', v_reward_amount,
    'updated_points', v_points,
    'booking_status', 'completed'
  );
end;
$$;

revoke all on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.complete_session_and_reward_partner(uuid, uuid, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
