-- Lounge magazine CMS (articles) + partner 10-day payout ledger

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text default '꿀팁',
  summary text,
  content text not null,
  thumbnail_url text,
  is_published boolean default true,
  created_at timestamptz default now()
);

create index if not exists articles_published_created_at_idx
  on public.articles (is_published, created_at desc);

alter table public.articles enable row level security;

drop policy if exists "articles_select_published" on public.articles;
create policy "articles_select_published"
  on public.articles for select
  using (is_published = true);

drop policy if exists "articles_select_all_authenticated" on public.articles;
create policy "articles_select_all_authenticated"
  on public.articles for select
  to authenticated
  using (true);

drop policy if exists "articles_write_anon" on public.articles;
create policy "articles_write_anon"
  on public.articles for all
  using (true)
  with check (true);

create table if not exists public.settlement_logs (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid,
  partner_profile_id uuid,
  points_settled integer not null default 0,
  amount_krw integer not null default 0,
  note text,
  created_at timestamptz default now()
);

create index if not exists settlement_logs_partner_user_id_idx
  on public.settlement_logs (partner_user_id, created_at desc);

alter table public.settlement_logs enable row level security;

drop policy if exists "settlement_logs_select" on public.settlement_logs;
create policy "settlement_logs_select"
  on public.settlement_logs for select
  using (true);

drop policy if exists "settlement_logs_insert" on public.settlement_logs;
create policy "settlement_logs_insert"
  on public.settlement_logs for insert
  with check (true);

alter table public.profiles
  add column if not exists visa_type text,
  add column if not exists languages text,
  add column if not exists bank_name text,
  add column if not exists bank_account text,
  add column if not exists account_holder text;

alter table public.bookings
  add column if not exists rating numeric;

alter table public.session_reports
  add column if not exists rating numeric,
  add column if not exists partner_user_id uuid;

create or replace function public.admin_partner_activity(p_partner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed integer := 0;
  v_avg numeric := null;
begin
  if p_partner_user_id is null then
    return jsonb_build_object('completed_count', 0, 'avg_rating', null);
  end if;

  select count(*)::integer, avg(rating)
    into v_completed, v_avg
  from public.bookings
  where status = 'completed'
    and partner_user_id = p_partner_user_id;

  if v_avg is null then
    select avg(rating) into v_avg
    from public.session_reports
    where partner_user_id = p_partner_user_id
      and rating is not null;
  end if;

  return jsonb_build_object(
    'completed_count', coalesce(v_completed, 0),
    'avg_rating', v_avg
  );
end;
$$;

create or replace function public.settle_partner_payout(p_partner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_points integer;
begin
  if p_partner_user_id is null then
    return jsonb_build_object('success', false, 'message', '파트너 정보가 없습니다.');
  end if;

  select id, coalesce(point_balance, 0)
    into v_profile_id, v_points
  from public.profiles
  where user_id = p_partner_user_id
  for update;

  if not found then
    select id, coalesce(point_balance, 0)
      into v_profile_id, v_points
    from public.profiles
    where id = p_partner_user_id
    for update;
  end if;

  if v_profile_id is null then
    return jsonb_build_object('success', false, 'message', '파트너 프로필을 찾을 수 없습니다.');
  end if;

  insert into public.settlement_logs (
    partner_user_id,
    partner_profile_id,
    points_settled,
    amount_krw,
    note
  ) values (
    p_partner_user_id,
    v_profile_id,
    v_points,
    v_points,
    '10일 정산 입금 완료'
  );

  update public.profiles
  set point_balance = 0,
      updated_at = timezone('utc', now())
  where id = v_profile_id;

  return jsonb_build_object(
    'success', true,
    'points_settled', v_points,
    'amount_krw', v_points,
    'updated_points', 0,
    'message', '정산 입금이 완료 처리되었습니다.'
  );
end;
$$;

grant execute on function public.admin_partner_activity(uuid) to anon, authenticated;
grant execute on function public.settle_partner_payout(uuid) to anon, authenticated;

grant select, insert, update, delete on public.articles to anon, authenticated;
grant select, insert on public.settlement_logs to anon, authenticated;
