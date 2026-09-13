-- Admin back-office access: profiles.role
-- Default is learner/user. Set role = 'admin' only for operators.
alter table public.profiles
  add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('user', 'learner', 'partner', 'admin'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles (role);
