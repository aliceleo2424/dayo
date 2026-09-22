-- Reconcile the production session_reports schema, then make learner and
-- partner writes participant-verified and field-scoped.

begin;

-- Production is missing columns already used by the current clients and
-- intended by migrations 018/024. Keep this reconciliation additive.
alter table public.session_reports
  add column if not exists partner_id uuid,
  add column if not exists partner_user_id uuid,
  add column if not exists summary text,
  add column if not exists key_expressions jsonb not null default '[]'::jsonb,
  add column if not exists quiz_score integer,
  add column if not exists word_help jsonb not null default '[]'::jsonb,
  add column if not exists feedback jsonb not null default '[]'::jsonb,
  add column if not exists rating numeric;

-- Either participant may create the one report row first. These legacy card
-- fields therefore cannot be mandatory at row creation time. Do not insert
-- fabricated report content merely to satisfy old NOT NULL constraints.
alter table public.session_reports
  alter column spoken_sentence drop not null,
  alter column keyword drop not null,
  alter column illust_url drop not null,
  alter column id set default gen_random_uuid(),
  alter column created_at set default now(),
  alter column key_expressions set default '[]'::jsonb,
  alter column word_help set default '[]'::jsonb,
  alter column feedback set default '[]'::jsonb;

-- Never guess how to merge historical rows or repair orphaned booking IDs.
-- Abort atomically so an operator can inspect the conflicting data first.
do $$
begin
  if exists (
    select 1
      from public.session_reports
     where booking_id is not null
     group by booking_id
    having count(*) > 1
  ) then
    raise exception
      'session_reports contains duplicate non-null booking_id values; reconcile them before migration 046.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.session_reports reports
      left join public.bookings bookings
        on bookings.id = reports.booking_id
     where reports.booking_id is not null
       and bookings.id is null
  ) then
    raise exception
      'session_reports contains booking_id values that do not exist in bookings.'
      using errcode = '23503';
  end if;
end
$$;

-- A normal UNIQUE constraint allows multiple legacy NULL booking IDs and is
-- directly usable by INSERT ... ON CONFLICT (booking_id).
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.session_reports'::regclass
       and conname = 'session_reports_booking_id_key'
  ) then
    alter table public.session_reports
      add constraint session_reports_booking_id_key unique (booking_id);
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.session_reports'::regclass
       and conname = 'session_reports_booking_id_fkey'
  ) then
    alter table public.session_reports
      add constraint session_reports_booking_id_fkey
      foreign key (booking_id)
      references public.bookings(id)
      on delete set null;
  end if;
end
$$;

alter table public.session_reports enable row level security;

-- Remove the broad production policies and all earlier repository variants.
drop policy if exists "Anyone authenticated can insert reports" on public.session_reports;
drop policy if exists "Users can view own reports" on public.session_reports;
drop policy if exists "session_reports_insert_all" on public.session_reports;
drop policy if exists "session_reports_select_all" on public.session_reports;
drop policy if exists "session_reports_select_involved" on public.session_reports;
drop policy if exists "session_reports_insert_involved" on public.session_reports;
drop policy if exists "session_reports_update_involved" on public.session_reports;
drop policy if exists "session_reports_select_learner" on public.session_reports;
drop policy if exists "session_reports_select_admin" on public.session_reports;

-- Linked rows use bookings as the authoritative identity source. The direct
-- learner_id comparison is retained only for legacy rows without booking_id.
create policy "session_reports_select_learner"
  on public.session_reports
  for select
  to authenticated
  using (
    (
      booking_id is not null
      and exists (
        select 1
          from public.bookings
         where bookings.id = session_reports.booking_id
           and bookings.learner_id = auth.uid()
      )
    )
    or (booking_id is null and learner_id = auth.uid())
  );

-- The admin app has a real Supabase session and uses the protected helper
-- introduced by migration 039. Current partner UI does not read reports.
create policy "session_reports_select_admin"
  on public.session_reports
  for select
  to authenticated
  using (public.dayo_is_admin());

-- Remove table-wide and column-level grants before granting read-only table
-- access. All writes must use the participant-specific RPCs below.
revoke all privileges on table public.session_reports
  from public, anon, authenticated;

revoke
  select (
    id, booking_id, learner_id, partner_id, partner_user_id, partner_name,
    spoken_sentence, keyword, illust_url, partner_comment, stamp, summary,
    key_expressions, quiz_score, word_help, feedback, rating, created_at
  ),
  insert (
    id, booking_id, learner_id, partner_id, partner_user_id, partner_name,
    spoken_sentence, keyword, illust_url, partner_comment, stamp, summary,
    key_expressions, quiz_score, word_help, feedback, rating, created_at
  ),
  update (
    id, booking_id, learner_id, partner_id, partner_user_id, partner_name,
    spoken_sentence, keyword, illust_url, partner_comment, stamp, summary,
    key_expressions, quiz_score, word_help, feedback, rating, created_at
  ),
  references (
    id, booking_id, learner_id, partner_id, partner_user_id, partner_name,
    spoken_sentence, keyword, illust_url, partner_comment, stamp, summary,
    key_expressions, quiz_score, word_help, feedback, rating, created_at
  )
on table public.session_reports
from public, anon, authenticated;

grant select on table public.session_reports
  to authenticated;

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

create or replace function public.merge_partner_session_report(
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
    and bookings.partner_user_id = v_actor_id
    and bookings.status in ('confirmed', 'completed')
  for share;

  if not found
     or v_booking_learner_id is null
     or v_booking_partner_user_id is null
     or v_booking_partner_user_id <> v_actor_id then
    return jsonb_build_object(
      'success', false,
      'message', '예약된 파트너 본인만 저장할 수 있습니다.'
    );
  end if;

  insert into public.session_reports as existing (
    booking_id,
    learner_id,
    partner_id,
    partner_user_id,
    partner_name,
    spoken_sentence,
    keyword,
    illust_url,
    partner_comment,
    stamp
  ) values (
    p_booking_id,
    v_booking_learner_id,
    v_booking_partner_id,
    v_booking_partner_user_id,
    v_booking_partner_name,
    nullif(btrim(p_report ->> 'spoken_sentence'), ''),
    nullif(btrim(p_report ->> 'keyword'), ''),
    nullif(btrim(p_report ->> 'illust_url'), ''),
    nullif(btrim(p_report ->> 'partner_comment'), ''),
    nullif(btrim(p_report ->> 'stamp'), '')
  )
  on conflict (booking_id) do update
    set learner_id = excluded.learner_id,
        partner_id = excluded.partner_id,
        partner_user_id = excluded.partner_user_id,
        partner_name = coalesce(excluded.partner_name, existing.partner_name),
        spoken_sentence = coalesce(excluded.spoken_sentence, existing.spoken_sentence),
        keyword = coalesce(excluded.keyword, existing.keyword),
        illust_url = coalesce(excluded.illust_url, existing.illust_url),
        partner_comment = coalesce(excluded.partner_comment, existing.partner_comment),
        stamp = coalesce(excluded.stamp, existing.stamp)
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
revoke all on function public.merge_partner_session_report(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.merge_learner_session_report(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.merge_partner_session_report(uuid, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
