-- Restore the two tables defined by 024 and required by the live 035 RPC.
-- This migration is independent of the ticket-lot cutover and changes no RPC.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.submit_safety_report_only(uuid,uuid,text,jsonb)') is null then
    raise exception 'The live submit_safety_report_only RPC is missing.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc
     where oid = 'public.submit_safety_report_only(uuid,uuid,text,jsonb)'::pg_catalog.regprocedure
       and prosecdef
  ) then
    raise exception 'The live safety RPC must remain SECURITY DEFINER.';
  end if;
  if pg_catalog.to_regprocedure('public.dayo_is_admin()') is null then
    raise exception 'The existing admin guard is required.';
  end if;
end;
$$;

create table if not exists public.safety_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  session_id uuid,
  reporter_id uuid not null,
  target_id uuid,
  reason text not null,
  transcript_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'urgent',
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.admin_notifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  kind text not null default 'info',
  title text not null,
  message text not null,
  session_id uuid,
  safety_report_id uuid references public.safety_reports(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

-- CREATE TABLE IF NOT EXISTS must not silently accept an incompatible table.
do $$
declare
  v_mismatches integer;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'safety_reports' and c.relkind = 'r'
  ) or not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'admin_notifications' and c.relkind = 'r'
  ) then
    raise exception 'Safety reporting objects must be ordinary tables.';
  end if;

  with expected(table_name, column_name, type_oid, required, default_expr) as (
    values
      ('safety_reports', 'id', 'uuid'::pg_catalog.regtype, true, 'gen_random_uuid()'),
      ('safety_reports', 'session_id', 'uuid'::pg_catalog.regtype, false, null),
      ('safety_reports', 'reporter_id', 'uuid'::pg_catalog.regtype, true, null),
      ('safety_reports', 'target_id', 'uuid'::pg_catalog.regtype, false, null),
      ('safety_reports', 'reason', 'text'::pg_catalog.regtype, true, null),
      ('safety_reports', 'transcript_snapshot', 'jsonb'::pg_catalog.regtype, true, '''[]''::jsonb'),
      ('safety_reports', 'status', 'text'::pg_catalog.regtype, true, '''urgent''::text'),
      ('safety_reports', 'created_at', 'timestamptz'::pg_catalog.regtype, true, 'now()'),
      ('admin_notifications', 'id', 'uuid'::pg_catalog.regtype, true, 'gen_random_uuid()'),
      ('admin_notifications', 'kind', 'text'::pg_catalog.regtype, true, '''info''::text'),
      ('admin_notifications', 'title', 'text'::pg_catalog.regtype, true, null),
      ('admin_notifications', 'message', 'text'::pg_catalog.regtype, true, null),
      ('admin_notifications', 'session_id', 'uuid'::pg_catalog.regtype, false, null),
      ('admin_notifications', 'safety_report_id', 'uuid'::pg_catalog.regtype, false, null),
      ('admin_notifications', 'read_at', 'timestamptz'::pg_catalog.regtype, false, null),
      ('admin_notifications', 'created_at', 'timestamptz'::pg_catalog.regtype, true, 'now()')
  ), actual as (
    select c.relname::text as table_name, a.attname::text as column_name,
           a.atttypid as type_oid, a.attnotnull as required,
           pg_catalog.pg_get_expr(d.adbin, d.adrelid) as default_expr
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid
      left join pg_catalog.pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
     where n.nspname = 'public'
       and c.relname in ('safety_reports', 'admin_notifications')
       and a.attnum > 0 and not a.attisdropped
  )
  select count(*) into v_mismatches
    from expected e full join actual a using (table_name, column_name)
   where e.type_oid is distinct from a.type_oid
      or e.required is distinct from a.required
      or e.default_expr is distinct from a.default_expr;
  if v_mismatches <> 0 then
    raise exception 'Existing safety reporting table columns differ from the 024 contract (% mismatches).', v_mismatches;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.safety_reports'::pg_catalog.regclass
       and contype = 'p'
       and pg_catalog.pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.admin_notifications'::pg_catalog.regclass
       and contype = 'p'
       and pg_catalog.pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    raise exception 'Safety reporting primary key differs from the 024 contract.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
     where c.conrelid = 'public.admin_notifications'::pg_catalog.regclass
       and c.confrelid = 'public.safety_reports'::pg_catalog.regclass
       and c.contype = 'f' and c.confdeltype = 'n'
       and c.conkey = array[
         (select attnum from pg_catalog.pg_attribute
           where attrelid = c.conrelid and attname = 'safety_report_id')
       ]::smallint[]
       and c.confkey = array[
         (select attnum from pg_catalog.pg_attribute
           where attrelid = c.confrelid and attname = 'id')
       ]::smallint[]
  ) then
    raise exception 'Safety notification FK differs from the 024 contract.';
  end if;

  if (select count(*) from pg_catalog.pg_constraint
       where conrelid = 'public.safety_reports'::pg_catalog.regclass) <> 1
     or (select count(*) from pg_catalog.pg_constraint
       where conrelid = 'public.admin_notifications'::pg_catalog.regclass) <> 2 then
    raise exception 'Unexpected safety reporting constraint requires manual review.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'safety_reports'
       and policyname <> 'safety_reports_select_admin'
  ) or exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'admin_notifications'
       and policyname not in ('admin_notifications_select_admin', 'admin_notifications_update_admin')
  ) then
    raise exception 'Unexpected safety reporting RLS policy requires manual review.';
  end if;
end;
$$;

create index if not exists safety_reports_created_at_idx
  on public.safety_reports (created_at desc);
create unique index if not exists safety_reports_session_reporter_unique
  on public.safety_reports (session_id, reporter_id);
create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (read_at, created_at desc);

-- The ON CONFLICT clause in 035 requires this exact non-partial unique key.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    join pg_catalog.pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0]
    join pg_catalog.pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[1]
    where i.indrelid = 'public.safety_reports'::pg_catalog.regclass
      and idx.relname = 'safety_reports_session_reporter_unique'
      and i.indisunique and i.indisvalid and i.indpred is null and i.indexprs is null
      and i.indnkeyatts = 2 and a1.attname = 'session_id' and a2.attname = 'reporter_id'
  ) then
    raise exception 'Safety report duplicate-prevention index is incompatible.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = 'public.safety_reports'::pg_catalog.regclass
      and idx.relname = 'safety_reports_created_at_idx'
      and i.indisvalid and i.indnkeyatts = 1
      and i.indpred is null and i.indexprs is null
      and a.attname = 'created_at' and (i.indoption[0] & 1) = 1
  ) or not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    join pg_catalog.pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0]
    join pg_catalog.pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[1]
    where i.indrelid = 'public.admin_notifications'::pg_catalog.regclass
      and idx.relname = 'admin_notifications_unread_idx'
      and i.indisvalid and i.indnkeyatts = 2
      and i.indpred is null and i.indexprs is null
      and a1.attname = 'read_at' and a2.attname = 'created_at'
      and (i.indoption[1] & 1) = 1
  ) then
    raise exception 'Safety reporting read index differs from the 024 contract.';
  end if;
end;
$$;

alter table public.safety_reports enable row level security;
alter table public.admin_notifications enable row level security;

drop policy if exists safety_reports_select_admin on public.safety_reports;
create policy safety_reports_select_admin on public.safety_reports
  for select to authenticated using (public.dayo_is_admin());

drop policy if exists admin_notifications_select_admin on public.admin_notifications;
create policy admin_notifications_select_admin on public.admin_notifications
  for select to authenticated using (public.dayo_is_admin());

drop policy if exists admin_notifications_update_admin on public.admin_notifications;
create policy admin_notifications_update_admin on public.admin_notifications
  for update to authenticated
  using (public.dayo_is_admin()) with check (public.dayo_is_admin());

revoke all on table public.safety_reports, public.admin_notifications
  from public, anon, authenticated, service_role;
grant select on table public.safety_reports, public.admin_notifications
  to authenticated, service_role;
grant update (read_at) on table public.admin_notifications to authenticated;

-- Restore the original admin INSERT notification subscription when available.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'admin_notifications'
     ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
