-- Owner request 2026-10-20: one shared mobile number per account for booking alerts (KakaoTalk later).
-- Stored in the existing user_contact_info.mobile_phone (also used by checkout), so a number entered
-- by the partner, by the learner at checkout, or by an admin shows up everywhere.
-- Self or admin only. No new table, no change to existing RLS policies.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $preflight$ begin
 if to_regclass('public.user_contact_info') is null then raise exception 'user_contact_info_missing'; end if;
 if to_regprocedure('public.dayo_is_admin()') is null then raise exception 'dayo_is_admin_missing'; end if;
end $preflight$;

create or replace function public.dayo_contact_phone(p_user_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v text;
begin
 if p_user_id is null or not ((select auth.uid()) = p_user_id or public.dayo_is_admin()) then
  raise exception 'not_allowed' using errcode='42501';
 end if;
 select mobile_phone into v from public.user_contact_info where user_id = p_user_id;
 return v;
end;$$;

create or replace function public.dayo_set_contact_phone(p_user_id uuid, p_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare digits text; mail text;
begin
 if p_user_id is null or not ((select auth.uid()) = p_user_id or public.dayo_is_admin()) then
  raise exception 'not_allowed' using errcode='42501';
 end if;
 digits := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
 if digits like '8210%' then digits := '0' || substr(digits, 3); end if;
 if digits !~ '^010[0-9]{8}$' then raise exception 'invalid_phone' using errcode='22023'; end if;
 select coalesce(c.contact_email, u.email) into mail
   from auth.users u left join public.user_contact_info c on c.user_id = u.id
  where u.id = p_user_id;
 if mail is null or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'email_missing' using errcode='22023';
 end if;
 insert into public.user_contact_info(user_id, contact_email, mobile_phone)
 values (p_user_id, btrim(mail), digits)
 on conflict (user_id) do update set mobile_phone = excluded.mobile_phone;
 return jsonb_build_object('ok', true, 'mobile_phone', digits);
end;$$;

revoke all on function public.dayo_contact_phone(uuid) from public, anon;
revoke all on function public.dayo_set_contact_phone(uuid, text) from public, anon;
grant execute on function public.dayo_contact_phone(uuid) to authenticated;
grant execute on function public.dayo_set_contact_phone(uuid, text) to authenticated;
commit;
