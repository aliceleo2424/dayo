-- Auth is the single writer for new authenticated profiles.
-- New rows use auth.users.id as both profile id and user_id so any later
-- client upsert keyed by id remains idempotent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  auth_provider text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'user_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  );

  auth_provider := coalesce(
    nullif(lower(trim(new.raw_app_meta_data->>'provider')), ''),
    'email'
  );

  begin
    insert into public.profiles (
      id,
      user_id,
      client_key,
      user_name,
      nickname,
      email,
      provider,
      ticket_count,
      has_welcome_coupon,
      streak_count,
      last_login_date,
      updated_at
    )
    values (
      new.id,
      new.id,
      'user:' || new.id::text,
      display_name,
      display_name,
      coalesce(new.email, ''),
      auth_provider,
      0,
      true,
      1,
      to_char(timezone('utc', now()), 'YYYY-MM-DD'),
      timezone('utc', now())
    )
    on conflict (id) do nothing;
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
    select
      new.id,
      'user:' || new.id::text,
      'WELCOME_9900',
      '첫 세션 9,900원 체험 할인권',
      9900,
      19900,
      false
    where not exists (
      select 1
      from public.coupons
      where user_id = new.id
        and code = 'WELCOME_9900'
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

notify pgrst, 'reload schema';
