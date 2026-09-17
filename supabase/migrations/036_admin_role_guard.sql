-- Restrict profile role changes to an authenticated admin RPC. Keep existing
-- profiles RLS policies and all non-role column grants unchanged.
-- Before applying, audit existing admin rows against a trusted operator roster:
-- the prior broad policies may already have allowed an illegitimate admin role.

begin;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_profile_id uuid;
  v_current_role text;
begin
  if v_actor_id is null then
    raise exception 'Login is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where role = 'admin'
      and (user_id = v_actor_id or (user_id is null and id = v_actor_id))
  ) then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;

  -- Match profiles_role_check; the current admin UI only sends user/partner.
  if p_role is null or p_role not in ('user', 'learner', 'partner', 'admin') then
    raise exception 'Invalid role.' using errcode = '22023';
  end if;

  if p_user_id is null then
    raise exception 'A target user is required.' using errcode = '22023';
  end if;

  select id, role into v_profile_id, v_current_role
  from public.profiles
  where user_id = p_user_id
  for update;

  if not found then
    -- Older profiles can have a profile id without a linked auth user id.
    select id, role into v_profile_id, v_current_role
    from public.profiles
    where id = p_user_id and user_id is null
    for update;
  end if;

  if v_profile_id is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  if v_current_role = 'admin' then
    raise exception 'Admin profiles cannot be changed here.' using errcode = '42501';
  end if;

  if v_current_role is distinct from p_role then
    -- The trigger also checks the SECURITY DEFINER owner. A client setting
    -- this custom setting cannot bypass that owner check.
    perform pg_catalog.set_config('dayo.admin_role_rpc', 'on', true);
    update public.profiles set role = p_role where id = v_profile_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_profile_id,
    'role', p_role,
    'changed', v_current_role is distinct from p_role
  );
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, text)
  to authenticated;

create or replace function public.guard_profiles_role_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rpc_owner name;
begin
  if tg_op = 'INSERT' then
    -- Defaults and the Auth signup trigger insert 'user'. A browser must
    -- not create a privileged profile via the existing broad INSERT policy.
    if new.role is distinct from 'user' then
      raise exception 'Profile role must start as user.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Without this narrow guard, broad UPDATE policies could let a client
  -- rebind an existing admin row to its own auth.uid() without editing role.
  if old.role = 'admin' and (
    new.id is distinct from old.id or
    new.user_id is distinct from old.user_id or
    new.client_key is distinct from old.client_key
  ) then
    raise exception 'Admin profile identity cannot be changed here.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    select pg_catalog.pg_get_userbyid(proowner) into v_rpc_owner
    from pg_catalog.pg_proc
    where oid = 'public.admin_set_user_role(uuid,text)'::pg_catalog.regprocedure;

    if v_rpc_owner is null
       or current_user <> v_rpc_owner
       or pg_catalog.current_setting('dayo.admin_role_rpc', true) is distinct from 'on' then
      raise exception 'Profile role can only be changed by the admin RPC.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profiles_role_write()
  from public, anon, authenticated;

drop trigger if exists profiles_role_write_guard on public.profiles;
create trigger profiles_role_write_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profiles_role_write();

notify pgrst, 'reload schema';

commit;
