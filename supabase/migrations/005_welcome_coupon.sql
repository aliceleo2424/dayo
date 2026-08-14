-- Welcome reward: 9,900 KRW trial coupon instead of a free ticket
alter table public.profiles
  add column if not exists has_welcome_coupon boolean not null default false;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  client_key text,
  code text not null,
  title text,
  discount_price integer not null default 9900,
  original_price integer not null default 19900,
  is_used boolean not null default false,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists coupons_user_id_idx on public.coupons (user_id);
create index if not exists coupons_client_key_idx on public.coupons (client_key);
create unique index if not exists coupons_user_welcome_idx
  on public.coupons (user_id, code)
  where user_id is not null and code = 'WELCOME_9900';

alter table public.coupons enable row level security;

drop policy if exists "coupons_select_anon" on public.coupons;
create policy "coupons_select_anon"
  on public.coupons for select
  to anon
  using (true);

drop policy if exists "coupons_insert_anon" on public.coupons;
create policy "coupons_insert_anon"
  on public.coupons for insert
  to anon
  with check (true);

drop policy if exists "coupons_update_anon" on public.coupons;
create policy "coupons_update_anon"
  on public.coupons for update
  to anon
  using (true)
  with check (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, 'DayO'), '@', 1)
  );

  insert into public.profiles (
    user_id,
    client_key,
    user_name,
    email,
    ticket_count,
    has_welcome_coupon,
    streak_count,
    last_login_date,
    updated_at
  )
  values (
    new.id,
    'user:' || new.id::text,
    display_name,
    coalesce(new.email, ''),
    0,
    true,
    1,
    to_char(timezone('utc', now()), 'YYYY-MM-DD'),
    timezone('utc', now())
  )
  on conflict (user_id) do nothing;

  insert into public.coupons (
    user_id,
    client_key,
    code,
    title,
    discount_price,
    original_price,
    is_used
  )
  values (
    new.id,
    'user:' || new.id::text,
    'WELCOME_9900',
    '첫 수업 9,900원 체험 할인권',
    9900,
    19900,
    false
  )
  on conflict do nothing;

  return new;
end;
$$;
