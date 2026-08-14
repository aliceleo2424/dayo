-- Link auth.users to profiles + session_logs (run in Supabase SQL editor)
-- Also enable Email + Google providers in Authentication > Providers,
-- and add the site URL to Authentication > URL Configuration > Redirect URLs.
alter table public.profiles
  add column if not exists user_id uuid unique;

create index if not exists profiles_user_id_idx on public.profiles (user_id);

alter table public.session_logs
  add column if not exists user_id uuid;

create index if not exists session_logs_user_id_idx on public.session_logs (user_id);

-- New signup: create a profile with 1 ticket
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
    streak_count,
    last_login_date,
    updated_at
  )
  values (
    new.id,
    'user:' || new.id::text,
    display_name,
    coalesce(new.email, ''),
    1,
    1,
    to_char(timezone('utc', now()), 'YYYY-MM-DD'),
    timezone('utc', now())
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
