-- Monthly date overrides; concrete availability_slots remain booking authority.
-- Apply separately after review. No backfill, old migration edits, or booking RPC replacement.
begin;

-- Production uses role='partner', not the unapplied legacy partner_status column.
-- Preserve every existing slot and booking. Hidden is an explicit non-bookable
-- state used by date overrides; fail closed if the deployed check has drifted.
do $slot_contract$
begin
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.availability_slots'::regclass and conname='availability_slots_status_check')
      is distinct from 'CHECK ((status = ANY (ARRAY[''available''::text, ''booked''::text])))' then
    raise exception 'availability_status_contract_mismatch';
  end if;
end;
$slot_contract$;
alter table public.availability_slots drop constraint availability_slots_status_check;
alter table public.availability_slots add constraint availability_slots_status_check
  check (status in ('available','booked','hidden'));

create table public.partner_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.profiles(id),
  date date not null,
  mode text not null check (mode in ('default','closed','custom')),
  custom_slots text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(partner_id,date),
  check (mode='custom' or cardinality(custom_slots)=0)
);
alter table public.partner_availability_overrides enable row level security;
create policy partner_override_read on public.partner_availability_overrides for select to authenticated
  using ((partner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='partner')) or public.dayo_is_admin());
revoke all on public.partner_availability_overrides from public,anon,authenticated;
grant select on public.partner_availability_overrides to authenticated;

create function public.availability_kst_start(p_text text) returns timestamptz
language plpgsql immutable set search_path='' as $$
begin
  if btrim(p_text) !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:(00|30):00' then return null; end if;
  if p_text ~* '(Z|[+-][0-9]{2}(:[0-9]{2}|[0-9]{2})?)$' then return p_text::timestamptz; end if;
  return p_text::timestamp at time zone 'Asia/Seoul';
exception when others then return null;
end;
$$;

-- Keep rolling-window reconciliation efficient across legacy time-zone formats.
create index availability_slots_partner_kst_start_idx
  on public.availability_slots(partner_id,public.availability_kst_start(slot_time));

-- pending is an unconfirmed draft, not a held reservation.
-- Existing confirmed rows stay valid; pending confirmation rechecks availability.
-- A closed/custom day cannot be reopened by a legacy weekly save, cancellation,
-- or partner status visibility trigger. Existing booked reservations stay intact.
create function public.guard_availability_override() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_start timestamptz; v_override public.partner_availability_overrides; v_time text;
begin
  v_start:=public.availability_kst_start(case when tg_op='DELETE' then old.slot_time else new.slot_time end);
  if v_start is null then if tg_op='DELETE' then return old; end if; return new; end if;
  select * into v_override from public.partner_availability_overrides
    where partner_id=case when tg_op='DELETE' then old.partner_id else new.partner_id end
      and date=(v_start at time zone 'Asia/Seoul')::date;
  v_time:=to_char(v_start at time zone 'Asia/Seoul','HH24:MI');
  if tg_op='DELETE' then
    if old.status='booked' or exists(select 1 from public.bookings b where b.slot_id=old.id and b.status='confirmed') then return null; end if;
    if v_override.mode='custom' and v_time=any(v_override.custom_slots) then return null; end if;
    return old;
  end if;
  if tg_op='UPDATE' and (old.status='booked' or new.status='hidden') and exists(select 1 from public.bookings b where b.slot_id=old.id and b.status='confirmed') then return old; end if;
  if new.status='available' and (v_override.mode='closed' or (v_override.mode='custom' and not(v_time=any(v_override.custom_slots)))) then new.status:='hidden'; end if;
  return new;
end;
$$;
create trigger guard_availability_override before insert or update or delete on public.availability_slots
  for each row execute function public.guard_availability_override();

-- Private materializer. Read refresh fills missing default slots without inferring
-- or deleting legacy manual availability. Explicit partner saves may replace defaults.
create function public.refresh_partner_monthly_slots(p_partner uuid,p_replace_default boolean default false,p_only_date date default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date; v_day date; v_mode text; v_times text[];
  v_time text; v_start timestamptz; v_active boolean; v_dow text; v_existing uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_partner::text,83));
  select role='partner' into v_active from public.profiles where id=p_partner;
  for v_day in select (v_today+i)::date from generate_series(0,29) i where p_only_date is null or v_today+i=p_only_date loop
    v_mode:=null;v_times:='{}';
    select mode,custom_slots into v_mode,v_times from public.partner_availability_overrides where partner_id=p_partner and date=v_day;
    if v_mode is null or v_mode='default' then
      v_dow:=(array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from v_day)::integer+1];
      select coalesce(array_agg(distinct split_part(slot_time,'|',2)),'{}') into v_times from public.availability_slots
        where partner_id=p_partner and slot_time like 'weekly:'||v_dow||'|%'
          and split_part(slot_time,'|',2) ~ '^(08:30|09:(00|30)|1[0-9]:(00|30)|2[0-2]:(00|30)|23:00)$';
    elsif v_mode='closed' then v_times:='{}'; end if;
    -- Row predicates are rechecked after booking RPC locks; never mutate booked slots.
    if v_mode in ('closed','custom') or p_replace_default then
      update public.availability_slots s set status='hidden',updated_at=now()
        where s.partner_id=p_partner and s.status='available'
          and (public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul')::date=v_day
          and public.availability_kst_start(s.slot_time)>clock_timestamp()
          and not(to_char(public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul','HH24:MI')=any(v_times));
    end if;
    if coalesce(v_active,false) then
      foreach v_time in array coalesce(v_times,'{}') loop
        v_start:=(v_day+v_time::time) at time zone 'Asia/Seoul';
        if v_start<=clock_timestamp() or exists(select 1 from public.bookings b where b.partner_id=p_partner and b.status='confirmed' and b.scheduled_at=v_start) then continue; end if;
        select s.id into v_existing from public.availability_slots s where s.partner_id=p_partner and public.availability_kst_start(s.slot_time)=v_start order by s.id limit 1 for update;
        if found then
          update public.availability_slots set status='available',updated_at=now() where id=v_existing and status='hidden';
        else
          insert into public.availability_slots(partner_id,slot_time,status) values(p_partner,to_char(v_start at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS'),'available') on conflict(partner_id,slot_time) do nothing;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

create function public.save_partner_availability_override(p_date date,p_mode text,p_custom_slots text[] default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='partner') then raise exception 'Partner access required' using errcode='42501';end if;
  if p_date is null or p_date<v_today or p_date>v_today+29 or p_mode is null or p_mode not in ('default','closed','custom') then raise exception 'Invalid date or mode' using errcode='22023';end if;
  if p_custom_slots is null or cardinality(p_custom_slots)>30 or exists(select 1 from unnest(p_custom_slots) t where t is null or t !~ '^(08:30|09:(00|30)|1[0-9]:(00|30)|2[0-2]:(00|30)|23:00)$')
    or cardinality(p_custom_slots)<>(select count(distinct t) from unnest(p_custom_slots) t)
    or (p_mode<>'custom' and cardinality(p_custom_slots)<>0) then raise exception 'Invalid half-hour slots' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,83));
  insert into public.partner_availability_overrides(partner_id,date,mode,custom_slots) values(v_uid,p_date,p_mode,p_custom_slots)
    on conflict(partner_id,date) do update set mode=excluded.mode,custom_slots=excluded.custom_slots,updated_at=now();
  perform public.refresh_partner_monthly_slots(v_uid,true,p_date);
end;
$$;

create function public.save_partner_weekly_template(p_slots jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_slot jsonb;
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='partner') then raise exception 'Partner access required' using errcode='42501';end if;
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots)>210 then raise exception 'Invalid weekly template' using errcode='22023';end if;
  for v_slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_slot) is distinct from 'object' or coalesce(v_slot->>'dayId','') not in ('mon','tue','wed','thu','fri','sat','sun')
      or coalesce(v_slot->>'time','') !~ '^(08:30|09:(00|30)|1[0-9]:(00|30)|2[0-2]:(00|30)|23:00)$' then raise exception 'Invalid weekly slot' using errcode='22023';end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,83));
  delete from public.availability_slots where partner_id=v_uid and slot_time like 'weekly:%' and status<>'booked';
  insert into public.availability_slots(partner_id,slot_time,status)
    select distinct v_uid,'weekly:'||(x->>'dayId')||'|'||(x->>'time'),'available' from jsonb_array_elements(p_slots) x on conflict(partner_id,slot_time) do nothing;
  perform public.refresh_partner_monthly_slots(v_uid,true);
end;
$$;

create function public.get_partner_monthly_schedule() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='partner') then raise exception 'Partner access required' using errcode='42501';end if;
  perform public.refresh_partner_monthly_slots(v_uid,false);
  select jsonb_build_object('start',v_today,'end',v_today+29,
    'weekly',coalesce((select jsonb_agg(jsonb_build_object('dayId',split_part(substr(slot_time,8),'|',1),'time',split_part(slot_time,'|',2))) from public.availability_slots where partner_id=v_uid and slot_time like 'weekly:%'),'[]'::jsonb),
    'overrides',coalesce((select jsonb_agg(to_jsonb(o)) from public.partner_availability_overrides o where partner_id=v_uid and date between v_today and v_today+29),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'slot_time',s.slot_time,'status',s.status,'reserved',exists(select 1 from public.bookings b where b.status='confirmed' and (b.slot_id=s.id or (b.partner_id=s.partner_id and b.scheduled_at=public.availability_kst_start(s.slot_time)))))) from public.availability_slots s where partner_id=v_uid and (public.availability_kst_start(slot_time) at time zone 'Asia/Seoul')::date between v_today and v_today+29),'[]'::jsonb)) into v_result;
  return v_result;
end;
$$;

create function public.apply_partner_weekly_template() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='partner') then raise exception 'Partner access required' using errcode='42501';end if;
  -- Refresh missing/default dates. Explicit closed/custom overrides are always retained.
  perform public.refresh_partner_monthly_slots(auth.uid(),true);
end;
$$;

create function public.get_booking_calendar_slots(p_partner_ids uuid[])
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_partner uuid;v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
  if p_partner_ids is null or cardinality(p_partner_ids)>100 then raise exception 'Invalid partner selection' using errcode='22023';end if;
  for v_partner in select distinct p.id from public.profiles p where p.id=any(p_partner_ids) and p.role='partner' order by p.id loop
    perform public.refresh_partner_monthly_slots(v_partner,false);
  end loop;
  -- A single JSON result avoids PostgREST's default row cap truncating calendar dates.
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'partner_id',s.partner_id,'slot_time',s.slot_time,'status',s.status)
    order by public.availability_kst_start(s.slot_time),s.partner_id,s.id),'[]'::jsonb) into v_result
    from public.availability_slots s join public.profiles p on p.id=s.partner_id
    where s.partner_id=any(p_partner_ids) and p.role='partner' and s.status='available'
      and public.availability_kst_start(s.slot_time)>clock_timestamp()
      and (public.availability_kst_start(s.slot_time) at time zone 'Asia/Seoul')::date between v_today and v_today+29
      and not exists(select 1 from public.bookings b where b.partner_id=s.partner_id and b.status='confirmed' and b.scheduled_at=public.availability_kst_start(s.slot_time));
  return v_result;
end;
$$;

create function public.enforce_booking_monthly_window() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_start timestamptz;v_day date;v_today date:=(clock_timestamp() at time zone 'Asia/Seoul')::date;v_override public.partner_availability_overrides;v_partner uuid;
begin
  if tg_op='UPDATE' and not ((old.status='pending' and new.status='confirmed') or (new.status in ('pending','confirmed') and (new.slot_id is distinct from old.slot_id or new.scheduled_at is distinct from old.scheduled_at))) then return new;end if;
  if new.status not in ('pending','confirmed') then return new;end if;
  select public.availability_kst_start(slot_time),partner_id into v_start,v_partner from public.availability_slots where id=new.slot_id;
  if v_start is null then raise exception 'Concrete slot required' using errcode='23514';end if;
  v_day:=(v_start at time zone 'Asia/Seoul')::date;
  if v_day<v_today or v_day>v_today+29 then raise exception 'Bookings open through the next 30 KST days' using errcode='23514';end if;
  select * into v_override from public.partner_availability_overrides where partner_id=v_partner and date=v_day;
  if v_override.mode='closed' or (v_override.mode='custom' and not(to_char(v_start at time zone 'Asia/Seoul','HH24:MI')=any(v_override.custom_slots))) then raise exception 'This date is no longer open' using errcode='23514';end if;
  return new;
end;
$$;
create trigger enforce_booking_monthly_window before insert or update of status,slot_id,scheduled_at on public.bookings
  for each row execute function public.enforce_booking_monthly_window();

revoke all on function public.availability_kst_start(text),public.guard_availability_override(),public.refresh_partner_monthly_slots(uuid,boolean,date),public.enforce_booking_monthly_window() from public,anon,authenticated;
revoke all on function public.save_partner_availability_override(date,text,text[]),public.save_partner_weekly_template(jsonb),public.get_partner_monthly_schedule(),public.apply_partner_weekly_template(),public.get_booking_calendar_slots(uuid[]) from public,anon,authenticated;
grant execute on function public.save_partner_availability_override(date,text,text[]),public.save_partner_weekly_template(jsonb),public.get_partner_monthly_schedule(),public.apply_partner_weekly_template(),public.get_booking_calendar_slots(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
