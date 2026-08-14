-- Keep auth.signUp successful even if profile/coupon side effects fail.
-- handle_new_user must never raise: a trigger exception becomes
-- "Database error saving new user" and rolls back the auth user.
alter table public.profiles
  add column if not exists has_welcome_coupon boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_id_key'
      and conrelid = 'public.profiles'::regclass
  ) then
    begin
      alter table public.profiles add constraint profiles_user_id_key unique (user_id);
    exception
      when duplicate_object then null;
      when unique_violation then null;
    end;
  end if;
end $$;

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

alter table public.coupons enable row level security;

drop policy if exists "profiles_select_anon" on public.profiles;
drop policy if exists "profiles_insert_anon" on public.profiles;
drop policy if exists "profiles_update_anon" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_insert_all" on public.profiles;
drop policy if exists "profiles_update_all" on public.profiles;

create policy "profiles_select_all"
  on public.profiles for select
  using (true);

create policy "profiles_insert_all"
  on public.profiles for insert
  with check (true);

create policy "profiles_update_all"
  on public.profiles for update
  using (true)
  with check (true);

drop policy if exists "coupons_select_anon" on public.coupons;
drop policy if exists "coupons_insert_anon" on public.coupons;
drop policy if exists "coupons_update_anon" on public.coupons;
drop policy if exists "coupons_select_all" on public.coupons;
drop policy if exists "coupons_insert_all" on public.coupons;
drop policy if exists "coupons_update_all" on public.coupons;

create policy "coupons_select_all"
  on public.coupons for select
  using (true);

create policy "coupons_insert_all"
  on public.coupons for insert
  with check (true);

create policy "coupons_update_all"
  on public.coupons for update
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

  begin
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
    );
  exception
    when unique_violation then null;
    when others then
      raise warning 'handle_new_user profile insert failed: %', sqlerrm;
  end;

  begin
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
      '첫 세션 9,900원 체험 할인권',
      9900,
      19900,
      false
    );
  exception
    when unique_violation then null;
    when others then
      raise warning 'handle_new_user coupon insert failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
