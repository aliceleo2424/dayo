-- 099: Admin-only, append-only payout records linked to exact unpaid reward sources.
-- Production was inspected read-only on 2026-10-07. Do not apply without a separate release.
-- No reward/cancellation writer, historical row, booking, ticket or payment logic is changed.
begin;

do $preflight$
begin
  if to_regprocedure('public.dayo_is_admin()') is null
    or to_regclass('public.partner_session_rewards') is null
    or to_regclass('public.partner_cancellation_penalty_offsets') is null
    or to_regclass('public.session_tech_issue_reports') is null
    or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='bookings' and column_name='is_test_session' and is_nullable='NO') then
    raise exception 'Canonical payout source contract is missing; audit production before release.';
  end if;
  -- The audited production has neither legacy object. Never silently merge historical payouts.
  if to_regprocedure('public.settle_partner_payout(uuid)') is not null
    or to_regclass('public.settlement_logs') is not null then
    raise exception 'Legacy settlement contract exists; review historical payout linkage first.';
  end if;
end;
$preflight$;

create table public.partner_payouts (
  id uuid primary key,
  partner_user_id uuid not null references public.profiles(id) on delete restrict,
  amount bigint not null check(amount > 0),
  currency text not null default 'KRW' check(currency='KRW'),
  payout_method text not null check(payout_method in ('bank_transfer','cash','paypal','wise','other')),
  payout_destination_label text not null check(length(payout_destination_label) between 1 and 160),
  payout_reference text check(length(payout_reference) between 1 and 200),
  note text check(length(note) between 1 and 1000),
  paid_at timestamptz not null,
  processed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  status text not null default 'paid' check(status='paid')
);
create index partner_payouts_partner_paid_idx on public.partner_payouts(partner_user_id,paid_at desc,id);

create table public.partner_payout_items (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  payout_id uuid not null references public.partner_payouts(id) on delete restrict,
  source_type text not null check(source_type in ('session_reward','legacy_session_reward','late_cancellation','admin_compensation')),
  reward_booking_id uuid references public.partner_session_rewards(booking_id) on delete restrict,
  tech_report_id uuid references public.session_tech_issue_reports(id) on delete restrict,
  gross_amount integer not null check(gross_amount=6000),
  offset_amount integer not null check(offset_amount between 0 and gross_amount),
  net_amount integer not null check(net_amount=gross_amount-offset_amount),
  earned_at timestamptz not null,
  check((source_type='session_reward' and reward_booking_id=booking_id and reward_booking_id is not null and tech_report_id is null)
    or (source_type='admin_compensation' and reward_booking_id is null and tech_report_id is not null and offset_amount=0)
    or (source_type in ('legacy_session_reward','late_cancellation') and reward_booking_id is null and tech_report_id is null and offset_amount=0))
);
create index partner_payout_items_payout_idx on public.partner_payout_items(payout_id);

alter table public.partner_payouts enable row level security;
alter table public.partner_payout_items enable row level security;
revoke all on public.partner_payouts,public.partner_payout_items from public,anon,authenticated,service_role;
-- Access is through explicitly authorized RPCs; no broad table policies.
create function public.dayo_immutable_partner_payout()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Recorded payouts and source links are immutable.' using errcode='42501';
end;
$$;
revoke all on function public.dayo_immutable_partner_payout() from public,anon,authenticated,service_role;
create trigger immutable_partner_payout before update or delete on public.partner_payouts
  for each row execute function public.dayo_immutable_partner_payout();
create trigger immutable_partner_payout_item before update or delete on public.partner_payout_items
  for each row execute function public.dayo_immutable_partner_payout();

-- Read existing evidence only. In particular, do not fabricate legacy reward ledger rows.
create function public.dayo_unpaid_partner_payout_sources(p_partner_id uuid)
returns table(booking_id uuid,source_type text,reward_booking_id uuid,tech_report_id uuid,
  gross_amount integer,offset_amount integer,net_amount integer,earned_at timestamptz)
language sql stable security definer set search_path='' as $$
  with sources as (
    select b.id,'session_reward'::text,r.booking_id,null::uuid,r.reward_amount,
      coalesce(o.amount,0)::integer,r.reward_amount-coalesce(o.amount,0)::integer,r.created_at
    from public.partner_session_rewards r join public.bookings b on b.id=r.booking_id
    left join lateral (select sum(x.offset_amount) amount from public.partner_cancellation_penalty_offsets x
      where x.reward_booking_id=r.booking_id and x.partner_id=r.partner_id) o on true
    where r.partner_id=p_partner_id and b.partner_user_id=p_partner_id and b.partner_rewarded=true
      and not b.is_test_session and b.status='completed' and b.end_reason='normal'
      and b.ended_at is not null and b.completed_at is not null
    union all
    select b.id,'legacy_session_reward',null::uuid,null::uuid,6000,0,6000,b.completed_at
    from public.bookings b where b.partner_user_id=p_partner_id and b.partner_rewarded=true
      and not b.is_test_session and b.status='completed' and b.end_reason='normal'
      and b.ended_at is not null and b.completed_at is not null
      and not exists(select 1 from public.partner_session_rewards r where r.booking_id=b.id)
    union all
    select b.id,'late_cancellation',null::uuid,null::uuid,6000,0,6000,b.ended_at
    from public.bookings b where b.partner_user_id=p_partner_id and b.partner_rewarded=true
      and not b.is_test_session and b.status='cancelled' and b.end_reason='user_cancelled_late'
      and b.ended_at is not null and b.completed_at is null and b.ticket_refunded=false
      and not exists(select 1 from public.partner_session_rewards r where r.booking_id=b.id)
    union all
    select b.id,'admin_compensation',null::uuid,t.id,6000,0,6000,t.resolved_at
    from public.bookings b join lateral (
      select r.id,r.resolved_at from public.session_tech_issue_reports r
      where r.booking_id=b.id and r.decision='approved' and r.partner_reward_decision=true
        and r.resolved_by is not null and r.resolved_at is not null
      order by r.resolved_at,r.id limit 1
    ) t on true
    where b.partner_user_id=p_partner_id and b.partner_rewarded=true and not b.is_test_session
      and b.status='cancelled' and b.end_reason in ('tech_issue_approved','partner_no_show_resolved','learner_no_show_resolved')
      and b.ended_at is not null and b.completed_at is null
      and not exists(select 1 from public.partner_session_rewards r where r.booking_id=b.id)
  )
  select * from sources s where not exists(select 1 from public.partner_payout_items i where i.booking_id=s.id);
$$;
revoke all on function public.dayo_unpaid_partner_payout_sources(uuid) from public,anon,authenticated,service_role;

create function public.dayo_partner_payout_summary(p_partner_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with source as (select * from public.dayo_unpaid_partner_payout_sources(p_partner_id)),
  amounts as (
    select coalesce(sum(net_amount),0)::bigint amount,coalesce(sum(gross_amount),0)::bigint gross,
      coalesce(sum(offset_amount),0)::bigint offsets,count(*) source_count,
      count(*) filter(where source_type in ('session_reward','legacy_session_reward')) session_count,
      count(*) filter(where source_type='legacy_session_reward') legacy_count,
      count(*) filter(where source_type='late_cancellation') cancellation_count,
      count(*) filter(where source_type='admin_compensation') compensation_count,
      coalesce(bool_and(net_amount>=0 and offset_amount between 0 and gross_amount),true) valid
    from source
  ), paid as (select coalesce(sum(amount),0)::bigint amount,count(*) payout_count,max(paid_at) last_paid_at
    from public.partner_payouts where partner_user_id=p_partner_id)
  select jsonb_build_object('partner_user_id',p.id,'partner_name',
    coalesce(nullif(btrim(p.nickname),''),nullif(btrim(p.user_name),''),'이름 미등록'),
    'point_balance',coalesce(p.point_balance,0),'amount',a.amount,'gross_amount',a.gross,'offset_amount',a.offsets,
    'source_count',a.source_count,'session_count',a.session_count,'legacy_count',a.legacy_count,
    'cancellation_count',a.cancellation_count,'compensation_count',a.compensation_count,
    'paid_total',d.amount,'payout_count',d.payout_count,'last_paid_at',d.last_paid_at,
    'total_offset_amount',(select coalesce(sum(offset_amount),0)::bigint from public.partner_cancellation_penalty_offsets where partner_id=p.id),
    'can_record',a.valid and a.amount>0 and a.amount=coalesce(p.point_balance,0),
    'status',case when not a.valid or a.amount<>coalesce(p.point_balance,0) then 'needs_review'
      when a.amount>0 then 'unpaid' when d.payout_count>0 then 'paid' else 'no_rewards' end)
  from public.profiles p cross join amounts a cross join paid d where p.id=p_partner_id and p.role='partner';
$$;
revoke all on function public.dayo_partner_payout_summary(uuid) from public,anon,authenticated,service_role;

create function public.admin_get_partner_payout_summary(p_partner_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(public.dayo_partner_payout_summary(p.id) order by p.id),'[]'::jsonb)
    into v_result from public.profiles p where p.role='partner' and (p_partner_user_id is null or p.id=p_partner_user_id);
  return v_result;
end;
$$;

create function public.admin_get_partner_payout_audit(p_partner_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_summary jsonb; v_sources jsonb; v_payouts jsonb;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  v_summary:=public.dayo_partner_payout_summary(p_partner_user_id);
  if v_summary is null then raise exception 'Partner profile required.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.earned_at,s.booking_id),'[]'::jsonb)
    into v_sources from public.dayo_unpaid_partner_payout_sources(p_partner_user_id) s;
  select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
      'processed_by_name',coalesce(nullif(a.nickname,''),nullif(a.user_name,''),'운영자'),
      'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.earned_at,i.booking_id),'[]'::jsonb)
        from public.partner_payout_items i where i.payout_id=p.id)) order by p.paid_at desc,p.id),'[]'::jsonb)
    into v_payouts from public.partner_payouts p left join public.profiles a on a.id=p.processed_by
    where p.partner_user_id=p_partner_user_id;
  return jsonb_build_object('summary',v_summary,'unpaid_items',v_sources,'payouts',v_payouts);
end;
$$;

create function public.admin_record_partner_payout(
  p_partner_user_id uuid,p_amount bigint,p_payout_method text,p_payout_destination_label text,
  p_paid_at timestamptz,p_expected_booking_ids uuid[],p_request_id uuid,
  p_payout_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_balance integer; v_summary jsonb; v_existing public.partner_payouts%rowtype;
  v_ids uuid[]; v_expected uuid[]; v_sources jsonb; v_destination text:=btrim(p_payout_destination_label);
  v_reference text:=nullif(btrim(p_payout_reference),''); v_note text:=nullif(btrim(p_note),'');
begin
  if v_actor is null or not public.dayo_is_admin() then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  if p_partner_user_id is null or p_request_id is null or p_amount is null or p_amount<=0
    or p_payout_method is null or p_payout_method not in ('bank_transfer','cash','paypal','wise','other')
    or v_destination is null or length(v_destination) not between 1 and 160
    or v_destination ~ '[[:cntrl:]]' or length(coalesce(v_reference,''))>200 or length(coalesce(v_note,''))>1000
    or p_paid_at is null or p_paid_at>clock_timestamp() then
    raise exception 'Valid payout amount, method, safe destination and past/current paid time are required.' using errcode='22023';
  end if;
  -- Only display-safe labels: prohibit unmasked emails and full numeric account identifiers.
  if length(regexp_replace(v_destination,'[^0-9]','','g'))>4
    or v_destination ~ '(^|[[:space:]])[^[:space:]@*]+@[^[:space:]@]+'
    or (p_payout_method='bank_transfer' and position('*' in v_destination)=0) then
    raise exception 'Mask account numbers and email addresses in the destination label.' using errcode='22023';
  end if;
  select array_agg(x order by x) into v_expected from unnest(p_expected_booking_ids) x;
  if v_expected is null or array_position(v_expected,null) is not null
    or cardinality(v_expected)<>(select count(distinct x) from unnest(v_expected) x) then
    raise exception 'An exact, nonempty unique source set is required.' using errcode='22023';
  end if;
  -- The same profile mutex is used by reward and compensation writers.
  -- Never take booking locks here (writers already lock booking before profile).
  select coalesce(point_balance,0) into v_balance from public.profiles
    where id=p_partner_user_id and role='partner' for update;
  if not found then raise exception 'Partner profile required.' using errcode='22023'; end if;
  select * into v_existing from public.partner_payouts where id=p_request_id;
  if found then
    select array_agg(booking_id order by booking_id) into v_ids from public.partner_payout_items where payout_id=v_existing.id;
    if v_existing.partner_user_id is distinct from p_partner_user_id or v_existing.amount is distinct from p_amount
      or v_existing.payout_method is distinct from p_payout_method or v_existing.payout_destination_label is distinct from v_destination
      or v_existing.paid_at is distinct from p_paid_at or v_existing.payout_reference is distinct from v_reference
      or v_existing.note is distinct from v_note or v_ids is distinct from v_expected then
      raise exception 'Payout request ID was already used with different details.' using errcode='23505';
    end if;
    return jsonb_build_object('success',true,'already_recorded',true,'payout_id',v_existing.id,
      'amount',v_existing.amount,'updated_balance',v_balance);
  end if;
  -- Verify the frozen preview batch after acquiring the profile lock; newer rewards remain unpaid.
  select array_agg(s.booking_id order by s.booking_id),jsonb_agg(to_jsonb(s))
    into v_ids,v_sources from public.dayo_unpaid_partner_payout_sources(p_partner_user_id) s
    where s.booking_id=any(v_expected);
  v_summary:=public.dayo_partner_payout_summary(p_partner_user_id);
  if v_ids is distinct from v_expected then
    raise exception 'Payout source set changed or was already paid; reload before recording.' using errcode='40001';
  end if;
  if not (v_summary->>'can_record')::boolean or p_amount<>(select sum(x.net_amount) from jsonb_to_recordset(v_sources) x(net_amount integer)) then
    raise exception 'Payout amount does not match the selected unpaid sources or balance reconciliation failed; review required.' using errcode='23514';
  end if;
  insert into public.partner_payouts(id,partner_user_id,amount,payout_method,payout_destination_label,
    payout_reference,note,paid_at,processed_by)
    values(p_request_id,p_partner_user_id,p_amount,p_payout_method,v_destination,v_reference,v_note,p_paid_at,v_actor);
  insert into public.partner_payout_items(booking_id,payout_id,source_type,reward_booking_id,tech_report_id,
    gross_amount,offset_amount,net_amount,earned_at)
    select s.booking_id,p_request_id,s.source_type,s.reward_booking_id,s.tech_report_id,
      s.gross_amount,s.offset_amount,s.net_amount,s.earned_at
    from jsonb_to_recordset(v_sources) s(booking_id uuid,source_type text,reward_booking_id uuid,tech_report_id uuid,
      gross_amount integer,offset_amount integer,net_amount integer,earned_at timestamptz);
  update public.profiles set point_balance=point_balance-p_amount,updated_at=now()
    where id=p_partner_user_id and point_balance=v_balance;
  if not found then raise exception 'Partner balance changed; no payout recorded.' using errcode='40001'; end if;
  return jsonb_build_object('success',true,'already_recorded',false,'payout_id',p_request_id,'amount',p_amount,
    'updated_balance',v_balance-p_amount);
end;
$$;
revoke all on function public.admin_get_partner_payout_summary(uuid),public.admin_get_partner_payout_audit(uuid),
  public.admin_record_partner_payout(uuid,bigint,text,text,timestamptz,uuid[],uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_get_partner_payout_summary(uuid),public.admin_get_partner_payout_audit(uuid),
  public.admin_record_partner_payout(uuid,bigint,text,text,timestamptz,uuid[],uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
