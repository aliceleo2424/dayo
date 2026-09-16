-- Repair profile provider values from Supabase Auth's source of truth.

alter table public.profiles
  add column if not exists provider text;

update public.profiles as profile
set provider = case
  when exists (
    select 1 from auth.identities as identity
    where identity.user_id = auth_user.id
      and lower(identity.provider) = 'kakao'
  ) then 'kakao'
  when exists (
    select 1 from auth.identities as identity
    where identity.user_id = auth_user.id
      and lower(identity.provider) = 'google'
  ) then 'google'
  when lower(coalesce(auth_user.raw_app_meta_data ->> 'provider', '')) = 'kakao' then 'kakao'
  when lower(coalesce(auth_user.raw_app_meta_data ->> 'provider', '')) = 'google' then 'google'
  else 'email'
end
from auth.users as auth_user
where (profile.user_id = auth_user.id or profile.id = auth_user.id)
  and profile.provider is distinct from case
    when exists (
      select 1 from auth.identities as identity
      where identity.user_id = auth_user.id
        and lower(identity.provider) = 'kakao'
    ) then 'kakao'
    when exists (
      select 1 from auth.identities as identity
      where identity.user_id = auth_user.id
        and lower(identity.provider) = 'google'
    ) then 'google'
    when lower(coalesce(auth_user.raw_app_meta_data ->> 'provider', '')) = 'kakao' then 'kakao'
    when lower(coalesce(auth_user.raw_app_meta_data ->> 'provider', '')) = 'google' then 'google'
    else 'email'
  end;

update public.profiles
set provider = null
where provider is not null
  and lower(trim(provider)) not in ('email', 'google', 'kakao');
