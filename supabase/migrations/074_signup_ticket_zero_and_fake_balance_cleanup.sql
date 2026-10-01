-- One-time production correction for the observed 2026-10-01 pre-open state.
-- This migration is intentionally fail-closed and contains exact production IDs.
-- The five consumed admin grants, their allocations, ledgers, and bookings are preserved.
-- Do not run on another database or after paid ticket sales begin.
begin;

lock table auth.users in share row exclusive mode;
lock table public.orders, public.profiles, public.bookings, public.ticket_lots,
  public.ticket_allocations, public.credit_ledgers in share row exclusive mode;

do $preflight$
declare
  v_unused_lot constant uuid := '24003bdd-b457-49b9-9e14-40e6b870f3ab';
  v_unused_ledger constant uuid := 'd183aa3f-cf18-4fe2-8e59-075129845267';
  v_profile_ids constant uuid[] := array[
    '131a43d2-8a90-41bb-a17a-2217b1ef283f',
    '0ba6945d-8745-4f79-91a6-c20ed6725b29',
    '85d0f35c-2af3-4170-8cbe-5d40a7706d25',
    'ca3f7de4-45e7-4190-9c80-ee5226e411d8',
    '85c041c7-c58c-44fb-89b8-97eb1acbf403'
  ]::uuid[];
begin
  if pg_catalog.to_regclass('public.coupons') is not null
     or (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles'
            and column_name = 'has_welcome_coupon') is distinct from 'true' then
    raise exception 'Welcome coupon contract changed; aborting.';
  end if;

  if (select count(*) from public.orders) <> 0
     or exists (select 1 from public.ticket_lots where source = 'purchase') then
    raise exception 'Paid order or purchase lot exists; aborting.';
  end if;

  if (select count(*) from public.profiles where ticket_count > 0) <> 5
     or exists (select 1 from public.profiles where ticket_count < 0)
     or exists (
       select 1 from public.profiles
       where ticket_count > 0 and id <> all(v_profile_ids)
     )
     or (select count(*) from public.profiles
         where id = any(v_profile_ids) and ticket_count = 1
           and tickets = 0 and has_welcome_coupon is true) <> 5 then
    raise exception 'Expected five exact one-ticket profiles with welcome coupon; aborting.';
  end if;

  if (select count(*) from public.ticket_lots) <> 6
     or exists (select 1 from public.ticket_lots where source <> 'admin_grant')
     or (select count(*) from public.ticket_lots where quantity_remaining > 0) <> 1
     or (select count(*) from public.ticket_lots
           where id = v_unused_lot
             and user_id = '131a43d2-8a90-41bb-a17a-2217b1ef283f'
             and source = 'admin_grant'
             and source_id = v_unused_ledger
             and quantity_issued = 1 and quantity_remaining = 1) <> 1
     or exists (select 1 from public.ticket_allocations
                where ticket_lot_id = v_unused_lot) then
    raise exception 'Expected sole unused admin grant is missing or allocated; aborting.';
  end if;

  if (select count(*) from public.ticket_allocations) <> 5
     or exists (
       select 1 from public.ticket_lots l
       left join public.ticket_allocations a on a.ticket_lot_id = l.id
       where l.id <> v_unused_lot
       group by l.id, l.quantity_remaining
       having l.quantity_remaining <> 0 or count(a.id) <> 1
     ) then
    raise exception 'Consumed grant/allocation history changed; aborting.';
  end if;

  if (select count(*) from public.credit_ledgers) <> 6
     or exists (
       select 1 from public.ticket_lots l
       left join public.credit_ledgers c on c.id = l.source_id
       where c.id is null or c.user_id is distinct from l.user_id
          or c.change_amount is distinct from l.quantity_issued
          or c.ledger_type is distinct from 'admin_grant'
     )
     or (select count(*) from public.credit_ledgers
          where id = v_unused_ledger
            and user_id = '131a43d2-8a90-41bb-a17a-2217b1ef283f'
            and change_amount = 1 and ledger_type = 'admin_grant') <> 1 then
    raise exception 'Admin grant ledger history changed; aborting.';
  end if;

  if not exists (
       select 1 from pg_catalog.pg_trigger
       where tgrelid = 'auth.users'::pg_catalog.regclass
         and tgname = 'on_auth_user_created'
         and tgfoid = 'public.handle_new_user()'::pg_catalog.regprocedure
         and tgenabled in ('O', 'A') and not tgisinternal
     )
     or not exists (
       select 1 from pg_catalog.pg_trigger
       where tgrelid = 'auth.users'::pg_catalog.regclass
         and tgname = 'on_social_user_created'
         and tgfoid = 'public.handle_social_user_signup()'::pg_catalog.regprocedure
         and tgenabled in ('O', 'A') and not tgisinternal
     )
     or (select count(*) from pg_catalog.pg_trigger
          where tgrelid = 'auth.users'::pg_catalog.regclass
            and tgenabled in ('O', 'A') and not tgisinternal) <> 2
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
          'public.handle_new_user()'::pg_catalog.regprocedure))
          <> 'be330f661b667a6e7d315d6ca46721b5'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
          'public.handle_social_user_signup()'::pg_catalog.regprocedure))
          <> '052ff667bf0718db807a4f6e42698074' then
    raise exception 'Live signup trigger/function contract changed; aborting.';
  end if;
end;
$preflight$;

-- Snapshot historical rows for byte-for-byte JSONB comparison after cleanup.
create temporary table dayo_ticket_history_before on commit drop as
select 'lot'::text as kind, l.id, pg_catalog.to_jsonb(l) as payload
  from public.ticket_lots l
 where l.id <> '24003bdd-b457-49b9-9e14-40e6b870f3ab'::uuid
union all
select 'ledger', c.id, pg_catalog.to_jsonb(c)
  from public.credit_ledgers c
 where c.id <> 'd183aa3f-cf18-4fe2-8e59-075129845267'::uuid
union all
select 'allocation', a.id, pg_catalog.to_jsonb(a)
  from public.ticket_allocations a
union all
select 'booking', b.id, pg_catalog.to_jsonb(b)
  from public.bookings b
  join public.ticket_allocations a on a.booking_id = b.id;

do $correct_triggers$
declare
  v_definition text;
  v_fragment text;
begin
  -- Rewrite only the known literal in the current function body. All other
  -- profile/provider behavior and the function's attributes remain intact.
  v_definition := pg_catalog.pg_get_functiondef(
    'public.handle_new_user()'::pg_catalog.regprocedure);
  v_fragment := pg_catalog.substring(v_definition,
    $pattern$'user'[[:space:]]*,[[:space:]]*1[[:space:]]*,[[:space:]]*detected_provider$pattern$);
  if v_fragment is null
     or pg_catalog.length(v_definition) - pg_catalog.length(
          pg_catalog.replace(v_definition, v_fragment, ''))
        <> pg_catalog.length(v_fragment) then
    raise exception 'Email signup ticket literal is not unique; aborting.';
  end if;
  execute pg_catalog.replace(v_definition, v_fragment,
    pg_catalog.replace(v_fragment, '1', '0'));

  v_definition := pg_catalog.pg_get_functiondef(
    'public.handle_social_user_signup()'::pg_catalog.regprocedure);
  v_fragment := pg_catalog.substring(v_definition,
    $pattern$'user'[[:space:]]*,[[:space:]]*1[[:space:]]*,[[:space:]]*1$pattern$);
  if v_fragment is null
     or pg_catalog.length(v_definition) - pg_catalog.length(
          pg_catalog.replace(v_definition, v_fragment, ''))
        <> pg_catalog.length(v_fragment) then
    raise exception 'Social signup ticket literals are not unique; aborting.';
  end if;
  execute pg_catalog.replace(v_definition, v_fragment,
    pg_catalog.replace(v_fragment, '1', '0'));
end;
$correct_triggers$;

do $cleanup$
declare
  v_rows integer;
begin
  delete from public.ticket_lots
   where id = '24003bdd-b457-49b9-9e14-40e6b870f3ab'::uuid
     and source = 'admin_grant' and quantity_remaining = 1;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Unused lot deletion affected % rows, expected 1.', v_rows;
  end if;

  delete from public.credit_ledgers
   where id = 'd183aa3f-cf18-4fe2-8e59-075129845267'::uuid
     and change_amount = 1 and ledger_type = 'admin_grant';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Unused grant ledger deletion affected % rows, expected 1.', v_rows;
  end if;

  update public.profiles set ticket_count = 0
   where id = any(array[
     '131a43d2-8a90-41bb-a17a-2217b1ef283f',
     '0ba6945d-8745-4f79-91a6-c20ed6725b29',
     '85d0f35c-2af3-4170-8cbe-5d40a7706d25',
     'ca3f7de4-45e7-4190-9c80-ee5226e411d8',
     '85c041c7-c58c-44fb-89b8-97eb1acbf403'
   ]::uuid[])
     and ticket_count = 1;
  get diagnostics v_rows = row_count;
  if v_rows <> 5 then
    raise exception 'Profile balance reset affected % rows, expected 5.', v_rows;
  end if;
end;
$cleanup$;

do $verify$
begin
  if (select count(*) from public.profiles where ticket_count > 0) <> 0
     or (select count(*) from public.ticket_lots) <> 5
     or exists (select 1 from public.ticket_lots where quantity_remaining > 0)
     or (select count(*) from public.ticket_allocations) <> 5
     or (select count(*) from public.credit_ledgers) <> 5
     or (select count(*) from public.orders) <> 0
     or exists (select 1 from public.ticket_lots where source = 'purchase')
     or exists (select 1 from public.ticket_lots
                where id = '24003bdd-b457-49b9-9e14-40e6b870f3ab'::uuid)
     or exists (select 1 from public.credit_ledgers
                where id = 'd183aa3f-cf18-4fe2-8e59-075129845267'::uuid)
     or (select count(*) from public.profiles
          where id = any(array[
            '131a43d2-8a90-41bb-a17a-2217b1ef283f',
            '0ba6945d-8745-4f79-91a6-c20ed6725b29',
            '85d0f35c-2af3-4170-8cbe-5d40a7706d25',
            'ca3f7de4-45e7-4190-9c80-ee5226e411d8',
            '85c041c7-c58c-44fb-89b8-97eb1acbf403'
          ]::uuid[])
            and ticket_count = 0 and tickets = 0
            and has_welcome_coupon is true) <> 5 then
    raise exception 'Post-cleanup balance, purchase, or coupon validation failed.';
  end if;

  if (select count(*) from pg_temp.dayo_ticket_history_before) <> 20
     or exists (
       select 1 from pg_temp.dayo_ticket_history_before s
       where (s.kind = 'lot' and not exists (
                select 1 from public.ticket_lots l
                 where l.id = s.id and pg_catalog.to_jsonb(l) = s.payload))
          or (s.kind = 'ledger' and not exists (
                select 1 from public.credit_ledgers c
                 where c.id = s.id and pg_catalog.to_jsonb(c) = s.payload))
          or (s.kind = 'allocation' and not exists (
                select 1 from public.ticket_allocations a
                 where a.id = s.id and pg_catalog.to_jsonb(a) = s.payload))
          or (s.kind = 'booking' and not exists (
                select 1 from public.bookings b
                 where b.id = s.id and pg_catalog.to_jsonb(b) = s.payload))
     ) then
    raise exception 'Consumed ticket, allocation, ledger, or booking history changed.';
  end if;

  if pg_catalog.substring(pg_catalog.pg_get_functiondef(
       'public.handle_new_user()'::pg_catalog.regprocedure),
       $pattern$'user'[[:space:]]*,[[:space:]]*0[[:space:]]*,[[:space:]]*detected_provider$pattern$)
       is null
     or pg_catalog.substring(pg_catalog.pg_get_functiondef(
       'public.handle_social_user_signup()'::pg_catalog.regprocedure),
       $pattern$'user'[[:space:]]*,[[:space:]]*0[[:space:]]*,[[:space:]]*0$pattern$)
       is null then
    raise exception 'Corrected signup ticket values were not installed.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
