begin;

-- Approved applicants become partners automatically when an account with the same,
-- verified email exists (signup, email confirmation, or a later approval).
-- Only final_status = 'approved' qualifies, so the admin decision stays in charge.
-- Admin / already-partner profiles are never touched; any failure is swallowed so
-- signup and application review can never be blocked by this helper.
create function public.apply_approved_partner_role(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_profile_id uuid;
  v_role text;
begin
  select lower(trim(email)) into v_email
  from auth.users where id = p_user_id and email_confirmed_at is not null;
  if v_email is null or v_email = '' then return false; end if;

  if not exists (select 1 from public.partner_applications
                 where lower(trim(email)) = v_email and final_status = 'approved') then
    return false;
  end if;

  select id, role into v_profile_id, v_role from public.profiles
  where user_id = p_user_id or (user_id is null and id = p_user_id)
  order by (user_id = p_user_id) desc nulls last limit 1
  for update;
  if v_profile_id is null or v_role not in ('user', 'learner') then return false; end if;

  -- Same marker admin_set_user_role uses; guard_profiles_role_write also checks the function owner.
  perform pg_catalog.set_config('dayo.admin_role_rpc', 'on', true);
  update public.profiles set role = 'partner' where id = v_profile_id;
  return true;
exception when others then
  raise warning 'Partner auto-approval skipped.';
  return false;
end;
$$;
revoke all on function public.apply_approved_partner_role(uuid) from public, anon, authenticated;

create function public.partner_auto_role_on_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_approved_partner_role(new.id);
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.partner_auto_role_on_auth_user() from public, anon, authenticated;

-- Sorts after on_auth_user_created / on_social_user_created, so the profile row exists.
create trigger partner_application_auto_role_insert after insert on auth.users
  for each row execute function public.partner_auto_role_on_auth_user();
create trigger partner_application_auto_role_confirm after update of email_confirmed_at, email on auth.users
  for each row when (new.email_confirmed_at is not null) execute function public.partner_auto_role_on_auth_user();

create function public.partner_auto_role_on_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  for v_uid in select id from auth.users
               where lower(trim(email)) = lower(trim(new.email)) and email_confirmed_at is not null loop
    perform public.apply_approved_partner_role(v_uid);
  end loop;
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function public.partner_auto_role_on_application() from public, anon, authenticated;
create trigger partner_application_auto_role after update of final_status on public.partner_applications
  for each row when (new.final_status = 'approved' and old.final_status is distinct from 'approved')
  execute function public.partner_auto_role_on_application();

-- Admin view: does each application already have a DayO account (same email), and its role?
create function public.admin_partner_application_accounts(p_ids uuid[])
returns table(application_id uuid, has_account boolean, role text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.dayo_is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  return query
    select a.id, p.id is not null, p.role::text
    from public.partner_applications a
    left join lateral (
      select pr.id, pr.role from public.profiles pr
      where lower(trim(pr.email)) = lower(trim(a.email)) order by pr.created_at limit 1
    ) p on true
    where a.id = any(p_ids);
end;
$$;
revoke all on function public.admin_partner_application_accounts(uuid[]) from public, anon;
grant execute on function public.admin_partner_application_accounts(uuid[]) to authenticated;

commit;
