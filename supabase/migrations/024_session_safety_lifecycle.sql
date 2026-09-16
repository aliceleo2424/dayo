-- Session lifecycle, safety reporting and learner review reports.

alter table public.bookings
  add column if not exists ended_at timestamptz,
  add column if not exists ticket_refunded boolean not null default false,
  add column if not exists end_reason text;

alter table public.session_logs
  add column if not exists booking_id uuid,
  add column if not exists session_id uuid;

create index if not exists session_logs_booking_id_idx
  on public.session_logs (booking_id, ended_at desc);

drop policy if exists "session_logs_select_anon" on public.session_logs;
drop policy if exists "session_logs_insert_anon" on public.session_logs;
drop policy if exists "session_logs_insert_authenticated" on public.session_logs;
create policy "session_logs_insert_authenticated"
  on public.session_logs for insert
  to authenticated
  with check (user_id = auth.uid() or partner_id = auth.uid());

drop policy if exists "session_logs_select_involved" on public.session_logs;
create policy "session_logs_select_involved"
  on public.session_logs for select
  to authenticated
  using (
    user_id = auth.uid()
    or partner_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where (profiles.user_id = auth.uid() or profiles.id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

alter table public.session_reports
  add column if not exists booking_id uuid,
  add column if not exists partner_id uuid,
  add column if not exists summary text,
  add column if not exists key_expressions jsonb not null default '[]'::jsonb,
  add column if not exists quiz_score integer,
  add column if not exists word_help jsonb not null default '[]'::jsonb,
  add column if not exists feedback jsonb not null default '[]'::jsonb;

drop index if exists public.session_reports_booking_id_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_reports_booking_id_key'
  ) then
    alter table public.session_reports
      add constraint session_reports_booking_id_key unique (booking_id);
  end if;
end $$;

drop policy if exists "session_reports_select_all" on public.session_reports;
drop policy if exists "session_reports_insert_all" on public.session_reports;
drop policy if exists "session_reports_select_involved" on public.session_reports;
create policy "session_reports_select_involved"
  on public.session_reports for select
  to authenticated
  using (
    learner_id = auth.uid()
    or partner_id = auth.uid()
    or partner_user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where (profiles.user_id = auth.uid() or profiles.id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "session_reports_insert_involved" on public.session_reports;
create policy "session_reports_insert_involved"
  on public.session_reports for insert
  to authenticated
  with check (learner_id = auth.uid() or partner_id = auth.uid() or partner_user_id = auth.uid());

drop policy if exists "session_reports_update_involved" on public.session_reports;
create policy "session_reports_update_involved"
  on public.session_reports for update
  to authenticated
  using (learner_id = auth.uid() or partner_id = auth.uid() or partner_user_id = auth.uid())
  with check (learner_id = auth.uid() or partner_id = auth.uid() or partner_user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_reports_booking_id_fkey'
  ) then
    alter table public.session_reports
      add constraint session_reports_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete set null;
  end if;
end $$;

create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  reporter_id uuid not null,
  target_id uuid,
  reason text not null,
  transcript_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'urgent',
  created_at timestamptz not null default now()
);

create index if not exists safety_reports_created_at_idx
  on public.safety_reports (created_at desc);

create unique index if not exists safety_reports_session_reporter_unique
  on public.safety_reports (session_id, reporter_id);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'info',
  title text not null,
  message text not null,
  session_id uuid,
  safety_report_id uuid references public.safety_reports(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (read_at, created_at desc);

alter table public.safety_reports enable row level security;
alter table public.admin_notifications enable row level security;

drop policy if exists "safety_reports_select_admin" on public.safety_reports;
create policy "safety_reports_select_admin"
  on public.safety_reports for select
  using (
    exists (
      select 1 from public.profiles
      where (profiles.user_id = auth.uid() or profiles.id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "admin_notifications_select_admin" on public.admin_notifications;
create policy "admin_notifications_select_admin"
  on public.admin_notifications for select
  using (
    exists (
      select 1 from public.profiles
      where (profiles.user_id = auth.uid() or profiles.id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "admin_notifications_update_admin" on public.admin_notifications;
create policy "admin_notifications_update_admin"
  on public.admin_notifications for update
  using (
    exists (
      select 1 from public.profiles
      where (profiles.user_id = auth.uid() or profiles.id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

create or replace function public.complete_learner_session(
  p_booking_id uuid,
  p_end_reason text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
     set status = 'completed',
         end_reason = coalesce(nullif(trim(p_end_reason), ''), 'normal'),
         ended_at = now(),
         updated_at = now()
   where id = p_booking_id
     and learner_id = auth.uid();

  if not found then
    return jsonb_build_object('success', false, 'message', '세션을 찾을 수 없습니다.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.report_session_tech_issue(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner uuid;
  v_deducted boolean;
  v_refunded boolean;
  v_tickets integer;
begin
  select learner_id, ticket_deducted, ticket_refunded
    into v_learner, v_deducted, v_refunded
    from public.bookings
   where id = p_booking_id
     and (learner_id = auth.uid() or partner_user_id = auth.uid())
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '세션을 찾을 수 없습니다.');
  end if;

  if coalesce(v_deducted, false) and not coalesce(v_refunded, false) then
    update public.profiles
       set ticket_count = coalesce(ticket_count, 0) + 1, updated_at = now()
     where user_id = v_learner
     returning ticket_count into v_tickets;
    v_refunded := true;
  end if;

  update public.bookings
     set status = 'tech_issue',
         end_reason = 'tech_issue',
         ticket_refunded = coalesce(v_refunded, ticket_refunded),
         ended_at = now(),
         updated_at = now()
   where id = p_booking_id;

  return jsonb_build_object('success', true, 'ticket_count', v_tickets, 'refunded', coalesce(v_refunded, false));
end;
$$;

create or replace function public.submit_safety_report(
  p_session_id uuid,
  p_target_id uuid,
  p_reason text,
  p_transcript_snapshot jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner uuid;
  v_deducted boolean;
  v_refunded boolean;
  v_report_id uuid;
  v_tickets integer;
begin
  if auth.uid() is null or coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('success', false, 'message', '신고 정보가 부족합니다.');
  end if;

  select learner_id, ticket_deducted, ticket_refunded
    into v_learner, v_deducted, v_refunded
    from public.bookings
   where id = p_session_id
     and (learner_id = auth.uid() or partner_user_id = auth.uid())
   for update;

  if not found then
    return jsonb_build_object('success', false, 'message', '신고 가능한 세션을 찾을 수 없습니다.');
  end if;

  insert into public.safety_reports (
    session_id, reporter_id, target_id, reason, transcript_snapshot
  ) values (
    p_session_id, auth.uid(), p_target_id, trim(p_reason), coalesce(p_transcript_snapshot, '[]'::jsonb)
  ) returning id into v_report_id;

  if auth.uid() = v_learner and coalesce(v_deducted, false) and not coalesce(v_refunded, false) then
    update public.profiles
       set ticket_count = coalesce(ticket_count, 0) + 1, updated_at = now()
     where user_id = v_learner
     returning ticket_count into v_tickets;
    v_refunded := true;
  end if;

  update public.bookings
     set status = 'safety_reported',
         end_reason = 'safety_report',
         ticket_refunded = coalesce(v_refunded, ticket_refunded),
         ended_at = now(),
         updated_at = now()
   where id = p_session_id;

  insert into public.admin_notifications (
    kind, title, message, session_id, safety_report_id
  ) values (
    'safety_emergency',
    '🚨 비상 신고 접수',
    '세션 ID: ' || p_session_id::text || ' / 신고 사유: ' || trim(p_reason) || ' / 신고자: ' || auth.uid()::text,
    p_session_id,
    v_report_id
  );

  return jsonb_build_object(
    'success', true,
    'report_id', v_report_id,
    'ticket_count', v_tickets,
    'refunded', coalesce(v_refunded, false)
  );
end;
$$;

revoke execute on function public.complete_learner_session(uuid, text) from public, anon;
revoke execute on function public.report_session_tech_issue(uuid) from public, anon;
revoke execute on function public.submit_safety_report(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.complete_learner_session(uuid, text) to authenticated;
grant execute on function public.report_session_tech_issue(uuid) to authenticated;
grant execute on function public.submit_safety_report(uuid, uuid, text, jsonb) to authenticated;
grant select, update on public.admin_notifications to authenticated;
grant select on public.safety_reports to authenticated;
grant select, insert on public.session_logs to authenticated;
grant select, insert, update on public.session_reports to authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'admin_notifications'
  ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end $$;
