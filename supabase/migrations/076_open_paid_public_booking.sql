-- Open normal ticket-backed booking without changing the internal lead-time
-- exception, ticket consumption, cancellation or room-entry contracts.
-- Apply this file explicitly: 075 is a separate, unapplied work item.
begin;

do $$
declare
  v_policy_check text;
  v_rpc_definition text;
  v_rpc_after text;
  -- Match one simple rejection IF, not its message text or encoding.
  -- A nested IF or an extra statement will not match this shape.
  v_gate_pattern text := $pattern$[[:space:]]+if[[:space:]]+not[[:space:]]+public[.]dayo_can_create_preopen_booking[(][)][[:space:]]+then[[:space:]]+return[[:space:]]+pg_catalog[.]jsonb_build_object[(][[:space:]]*'success'[[:space:]]*,[[:space:]]*false[[:space:]]*,[[:space:]]*'message'[[:space:]]*,[[:space:]]*'[^']*'[[:space:]]*[)][[:space:]]*;[[:space:]]+end[[:space:]]+if[[:space:]]*;$pattern$;
  v_gate text;
begin
  select with_check into v_policy_check
    from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename = 'bookings'
     and policyname = 'bookings_insert_own_pending';
  if v_policy_check is null
     or pg_catalog.strpos(v_policy_check, 'dayo_can_create_preopen_booking') = 0 then
    raise exception 'Expected pre-open booking INSERT policy is missing or changed.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.bookings'::pg_catalog.regclass
       and tgname = 'enforce_preopen_booking_confirmation'
       and not tgisinternal
  ) then
    raise exception 'Expected pre-open booking confirmation trigger is missing.';
  end if;

  if pg_catalog.to_regprocedure('public.deduct_ticket_and_confirm_booking(uuid,uuid)') is null
     or pg_catalog.to_regprocedure('public.enforce_booking_four_hour_minimum()') is null
     or pg_catalog.to_regprocedure('public.confirm_booking_with_cutoff_cleanup(uuid,uuid)') is null then
    raise exception 'Expected lot-aware booking and cutoff functions are missing.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.deduct_ticket_and_confirm_booking(uuid,uuid)'::pg_catalog.regprocedure
  ) into v_rpc_definition;
  v_gate := pg_catalog.substring(v_rpc_definition, v_gate_pattern);
  if v_gate is null
     or (pg_catalog.length(v_rpc_definition) - pg_catalog.length(pg_catalog.replace(
       v_rpc_definition, 'public.dayo_can_create_preopen_booking(', ''
     ))) <> pg_catalog.length('public.dayo_can_create_preopen_booking(')
     or pg_catalog.strpos(v_rpc_definition, 'public.ticket_allocations') = 0
     or pg_catalog.strpos(v_rpc_definition, 'public.ticket_lots') = 0 then
    raise exception 'Booking confirmation RPC differs from the expected lot-aware pre-open contract.';
  end if;

  -- Preserve every other live RPC statement, including identity, lot locks,
  -- allocation, slot state and idempotency. Remove only the matched IF.
  execute pg_catalog.replace(v_rpc_definition, v_gate, '');
  select pg_catalog.pg_get_functiondef(
    'public.deduct_ticket_and_confirm_booking(uuid,uuid)'::pg_catalog.regprocedure
  ) into v_rpc_after;
  if v_rpc_after is distinct from pg_catalog.replace(v_rpc_definition, v_gate, '') then
    raise exception 'Booking confirmation RPC changed beyond the pre-open IF block.';
  end if;
end;
$$;

drop policy "bookings_insert_own_pending" on public.bookings;
create policy "bookings_insert_own_pending"
  on public.bookings
  for insert
  to authenticated
  with check (
    learner_id = auth.uid()
    and exists (
      select 1 from public.profiles
       where id = auth.uid()
         and role in ('user', 'learner', 'admin')
    )
    and status = 'pending'
    and partner_user_id = partner_id
    and ticket_deducted = false
    and partner_rewarded = false
    and ticket_refunded = false
    and ended_at is null
    and completed_at is null
    and end_reason is null
    and rating is null
  );

drop trigger enforce_preopen_booking_confirmation on public.bookings;

do $$
declare
  v_check text;
  v_rpc_definition text;
begin
  select with_check into v_check
    from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename = 'bookings'
     and policyname = 'bookings_insert_own_pending';
  if v_check is null or pg_catalog.strpos(v_check, 'dayo_can_create_preopen_booking') <> 0
     or pg_catalog.strpos(v_check, 'learner_id = auth.uid()') = 0 then
    raise exception 'Public booking INSERT policy verification failed.';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.deduct_ticket_and_confirm_booking(uuid,uuid)'::pg_catalog.regprocedure
  ) into v_rpc_definition;
  if pg_catalog.strpos(v_rpc_definition, 'dayo_can_create_preopen_booking') <> 0
     or pg_catalog.strpos(v_rpc_definition, 'public.ticket_lots') = 0
     or pg_catalog.strpos(v_rpc_definition, 'public.ticket_allocations') = 0 then
    raise exception 'Booking confirmation RPC gate or ticket-lot contract verification failed.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc
     where oid = 'public.deduct_ticket_and_confirm_booking(uuid,uuid)'::pg_catalog.regprocedure
       and prosecdef
       and 'search_path=""' = any(proconfig)
  ) then
    raise exception 'Booking confirmation RPC security contract verification failed.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.bookings'::pg_catalog.regclass
       and tgname = 'enforce_preopen_booking_confirmation'
       and not tgisinternal
  ) then
    raise exception 'Pre-open booking confirmation trigger remains active.';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(
       'public.enforce_booking_four_hour_minimum()'::pg_catalog.regprocedure
     ), 'dayo_can_create_preopen_booking') = 0 then
    raise exception 'Internal four-hour exception was unexpectedly removed.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
