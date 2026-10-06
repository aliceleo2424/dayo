-- Admin ticket audit: nullable metadata, existing grant idempotency, read-only admin projection.
-- No backfill, browser ledger policy, or payment/booking/refund writer changes.
begin;
do $preflight$
begin
  if pg_catalog.to_regprocedure('public.admin_grant_tickets(uuid,integer,text,uuid)') is null
     or pg_catalog.md5(pg_catalog.pg_get_functiondef('public.admin_grant_tickets(uuid,integer,text,uuid)'::regprocedure)) <> '45a0fa97d4375a6afbaac9dd758907f5' then
    raise exception 'Admin grant function drift: re-audit production before applying 096.';
  end if;
  if pg_catalog.to_regclass('public.ticket_allocations') is null then
    raise exception 'Ticket allocation foundation is required.';
  end if;
end;
$preflight$;
alter table public.credit_ledgers add column reason text,
  add column granted_by uuid;
alter table public.credit_ledgers add constraint credit_ledgers_reason_length
  check (reason is null or (pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 500));
comment on column public.credit_ledgers.reason is 'Explicit admin grant reason. NULL means not recorded; historical rows are not inferred.';
comment on column public.credit_ledgers.granted_by is 'auth.uid() of the granting admin. Nullable historical actor; retained if profile is removed.';
create or replace function public.admin_grant_tickets(
  p_user_id uuid,
  p_quantity integer,
  p_reason text,
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_existing public.ticket_lots%rowtype;
  v_ledger public.credit_ledgers%rowtype;
  v_issued_at timestamptz;
  v_balance integer;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_source_id is null or p_quantity is null or p_quantity < 1
     or v_reason = '' or pg_catalog.length(v_reason) > 500 then
    raise exception 'Valid user, quantity, reason, and source ID are required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.ticket_lots
     where source = 'admin_grant' and source_id = p_source_id and user_id <> p_user_id
  ) then
    raise exception 'Grant source ID belongs to another user.' using errcode = '23505';
  end if;

  select * into v_existing
    from public.ticket_lots
   where user_id = p_user_id and source = 'admin_grant' and source_id = p_source_id
   for update;

  if found then
    if v_existing.quantity_issued is distinct from p_quantity then
      raise exception 'Grant source ID has different quantity.' using errcode = '23505';
    end if;
    select * into v_ledger from public.credit_ledgers where id = p_source_id;
    if not found
       or v_ledger.user_id is distinct from p_user_id
       or v_ledger.change_amount is distinct from p_quantity
       or v_ledger.ledger_type is distinct from 'admin_grant'
       or v_ledger.balance_after is null then
      raise exception 'Grant source ID has different or missing audit data.' using errcode = '23505';
    end if;
    select ticket_count into v_balance from public.profiles where id = p_user_id;
    return pg_catalog.jsonb_build_object(
      'success', true, 'duplicate', true, 'ticket_count', v_balance,
      'added_tickets', 0, 'source_id', p_source_id
    );
  end if;

  v_issued_at := pg_catalog.now();
  insert into public.ticket_lots (
    user_id, source, source_id, quantity_issued, quantity_remaining, issued_at, expires_at
  ) values (
    p_user_id, 'admin_grant', p_source_id, p_quantity, p_quantity, v_issued_at,
    (((v_issued_at at time zone 'UTC') + interval '90 days') at time zone 'UTC')
  );

  v_balance := public.refresh_ticket_balance_cache(p_user_id);
  insert into public.credit_ledgers (
    id, user_id, change_amount, ledger_type, balance_after, created_at, reason, granted_by
  ) values (
    p_source_id, p_user_id, p_quantity, 'admin_grant', v_balance, pg_catalog.now(), v_reason, auth.uid()
  );

  return pg_catalog.jsonb_build_object(
    'success', true, 'duplicate', false, 'ticket_count', v_balance,
    'added_tickets', p_quantity, 'source_id', p_source_id
  );
end;
$$;

revoke all on function public.admin_grant_tickets(uuid, integer, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_grant_tickets(uuid, integer, text, uuid)
  to authenticated;


create function public.admin_get_ticket_audit(p_user_id uuid, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $audit$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_user_id is null then raise exception 'User is required.' using errcode = '22023';end if;
  with events as (
    select 'ledger:' || c.id::text as id, c.user_id, c.change_amount as delta,
      c.ledger_type::text as source, c.created_at, c.balance_after,
      l.id as lot_id, c.id as transaction_id, coalesce(l.source_id,c.id) as source_id,
      null::uuid as booking_id, c.reason, c.granted_by,
      a.nickname as admin_name, a.email as admin_email
    from public.credit_ledgers c
    left join public.ticket_lots l on l.source_id=c.id and l.user_id=c.user_id and l.source=c.ledger_type
    left join public.profiles a on a.id=c.granted_by
    where c.user_id=p_user_id
    union all
    select 'allocation:' || a.id::text || ':use', l.user_id, -a.quantity,
      'booking_use', a.consumed_at, null::integer,
      l.id, a.id, l.source_id, a.booking_id, null::text, null::uuid, null::text, null::text
    from public.ticket_allocations a join public.ticket_lots l on l.id=a.ticket_lot_id
    where l.user_id=p_user_id
    union all
    select 'allocation:' || a.id::text || ':refund', l.user_id, a.quantity,
      'booking_refund', a.refunded_at, null::integer,
      l.id, a.id, l.source_id, a.booking_id, a.refund_reason, null::uuid, null::text, null::text
    from public.ticket_allocations a join public.ticket_lots l on l.id=a.ticket_lot_id
    where l.user_id=p_user_id and a.refunded_at is not null
  ), page as (
    select * from events order by created_at desc nulls last,id
    limit greatest(1,least(coalesce(p_limit,50),200)) offset greatest(coalesce(p_offset,0),0)
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc nulls last,id),'[]'::jsonb)
    into v_result from page;
  return v_result;
end;
$audit$;
revoke all on function public.admin_get_ticket_audit(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_get_ticket_audit(uuid,integer,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
