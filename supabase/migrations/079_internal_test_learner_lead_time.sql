-- E2E learner may bypass only the four-hour booking lead time.
-- Keep the legacy internal/cancellation allowlist and every ticket/slot contract.
begin;

do $$
declare
  v_contract record;
  v_oid oid;
begin
  if (select count(*) from auth.users where lower(email) = 'aliceleo2424+test@gmail.com') <> 1
     or not exists (
       select 1 from auth.users u join public.profiles p on p.id = u.id
        where u.id = '85d0f35c-2af3-4170-8cbe-5d40a7706d25'::uuid
          and lower(u.email) = 'aliceleo2424+test@gmail.com'
          and u.email_confirmed_at is not null and p.role in ('user', 'learner')
     ) then
    raise exception 'Verified E2E learner identity does not match production.';
  end if;
  -- Exact pg_get_functiondef hashes from the read-only production audit.
  for v_contract in select * from (values
    ('dayo_can_create_preopen_booking()', '5886d270754d3225c5e39a53a07b939c'),
    ('cancel_my_booking(uuid)', 'e7a7c6e9e6b711a84409d7e912fa74e5'),
    ('confirm_booking_with_cutoff_cleanup(uuid,uuid)', 'bd8d0efff14836022c2e57ffe25d707b'),
    ('dayo_is_admin()', 'b932d95fb53315d3521fc15648ea116b'),
    ('deduct_ticket_and_confirm_booking(uuid,uuid)', '24abf9abab920277efc9a5e00ea9e3e8'),
    ('deduct_ticket_and_confirm_booking(uuid,uuid,uuid,uuid)', '4e11a2af5cb84190660fb09912e4a906'),
    ('enforce_booking_four_hour_minimum()', '6d0b29b733d62a114ad8a8dab6de799c')
  ) as contracts(signature, definition_md5) loop
    v_oid := pg_catalog.to_regprocedure('public.' || v_contract.signature);
    if v_oid is null or pg_catalog.md5(pg_catalog.pg_get_functiondef(v_oid))
       is distinct from v_contract.definition_md5 then
      raise exception 'Production booking contract changed: %', v_contract.signature;
    end if;
  end loop;
  if pg_catalog.to_regprocedure('public.dayo_can_bypass_booking_lead_time()') is not null then
    raise exception 'Lead-time-only helper already exists; review before applying.';
  end if;
  if exists (select 1 from pg_catalog.pg_policies
              where schemaname = 'public' and tablename = 'bookings'
                and (coalesce(qual, '') || coalesce(with_check, ''))
                    like '%dayo_can_create_preopen_booking%')
     or exists (select 1 from pg_catalog.pg_trigger
                 where tgrelid = 'public.bookings'::pg_catalog.regclass
                   and not tgisinternal
                   and tgfoid = pg_catalog.to_regprocedure('public.enforce_preopen_booking_confirmation()')) then
    raise exception 'Expected public-booking cutover is not present.';
  end if;
end;
$$;

create function public.dayo_can_bypass_booking_lead_time()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.dayo_can_create_preopen_booking(), false)
    or coalesce(auth.uid() in ('85d0f35c-2af3-4170-8cbe-5d40a7706d25'::uuid), false);
$$;
revoke all on function public.dayo_can_bypass_booking_lead_time() from public, anon, authenticated;
grant execute on function public.dayo_can_bypass_booking_lead_time() to authenticated, service_role;

do $$
declare
  v_signature text;
  v_oid oid;
  v_before text;
  v_after text;
  v_metadata jsonb;
  v_old_call text := 'public.dayo_can_create_preopen_booking()';
  v_new_call text := 'public.dayo_can_bypass_booking_lead_time()';
begin
  foreach v_signature in array array[
    'enforce_booking_four_hour_minimum()',
    'confirm_booking_with_cutoff_cleanup(uuid,uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure('public.' || v_signature);
    v_before := pg_catalog.pg_get_functiondef(v_oid);
    if (length(v_before) - length(replace(v_before, v_old_call, ''))) <> length(v_old_call) then
      raise exception 'Expected exactly one cutoff helper call in %', v_signature;
    end if;
    select jsonb_build_object('owner', proowner, 'acl', proacl, 'definer', prosecdef,
      'config', proconfig, 'volatility', provolatile)
      into v_metadata from pg_catalog.pg_proc where oid = v_oid;
    v_after := replace(v_before, v_old_call, v_new_call);
    execute v_after;
    if pg_catalog.pg_get_functiondef(v_oid) is distinct from v_after
       or (select jsonb_build_object('owner', proowner, 'acl', proacl, 'definer', prosecdef,
             'config', proconfig, 'volatility', provolatile)
             from pg_catalog.pg_proc where oid = v_oid) is distinct from v_metadata then
      raise exception 'Change exceeded the cutoff helper call in %', v_signature;
    end if;
  end loop;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.dayo_can_create_preopen_booking()'::regprocedure)) <> '5886d270754d3225c5e39a53a07b939c' then
    raise exception 'Legacy internal/cancellation allowlist changed.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
