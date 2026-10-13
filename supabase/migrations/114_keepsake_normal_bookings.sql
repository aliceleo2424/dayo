-- DRAFT ONLY. Requires separate owner approval before Production application.
-- Existing three keepsake functions and one quota constraint only; no record updates,
-- grants, new tables, migration replay, or changes to booking/STT/Letter/financial data.
-- Cloudflare dashboard verified Workers Free. Free exhaustion is provider-enforced.
-- 200 neurons covers 1024px FLUX/reference (~110) + bounded 2000-token Clef (~28).
-- Account-level usage outside DayO can exhaust Free earlier; no retries or upgrades.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $preflight$ begin
 if md5(pg_get_functiondef('public.dayo_keepsake_beta_access(uuid)'::regprocedure))<>'093372ef6034aea921001d7e7cb1e659'
 or md5(pg_get_functiondef('public.dayo_keepsake_review_guard()'::regprocedure))<>'8cf5ef8fdddc314f3ab3a36b0b3d7752'
 or md5(pg_get_functiondef('public.dayo_keepsake_reserve(uuid,uuid,uuid,text,text,text,timestamptz,date,integer)'::regprocedure))<>'a1088c7210ac44b4349528936c3b5cf7'
 or not exists(select 1 from pg_constraint where conrelid='public.keepsake_illustration_daily_budget'::regclass
  and conname='keepsake_illustration_daily_budget_reserved_neurons_check'
  and pg_get_constraintdef(oid)='CHECK (((reserved_neurons >= 0) AND (reserved_neurons <= 2000)))')
 or not exists(select 1 from storage.buckets where id='dayo-keepsakes' and public=false) then
  raise exception 'keepsake_normal_booking_preflight_mismatch';
 end if;
end $preflight$;
alter table public.keepsake_illustration_daily_budget
 drop constraint keepsake_illustration_daily_budget_reserved_neurons_check,
 add constraint keepsake_illustration_daily_budget_reserved_neurons_check check(reserved_neurons between 0 and 10000);
create or replace function public.dayo_keepsake_beta_access(p_booking_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.bookings b where b.id=p_booking_id
 and (auth.uid()=b.learner_id or auth.uid()=b.partner_user_id or public.dayo_keepsake_review_owner()))
$$;
create or replace function public.dayo_keepsake_review_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if current_setting('dayo.keepsake.manual_review',true) is distinct from 'v1'
   or new.review_state<>'pending' or new.image_sha256 is not null
  or not exists(select 1 from public.bookings b where b.id=new.booking_id and
   b.partner_user_id=new.actor_id and b.learner_id is not null
   and b.status in ('confirmed','completed')) then
   raise exception 'booking_partner_required' using errcode='42501';
  end if;
 else
  if new.id<>old.id or new.object_path<>old.object_path or new.request_id<>old.request_id
   or (old.image_sha256 is not null and (new.image_sha256 is distinct from old.image_sha256 or new.storage_version is distinct from old.storage_version)) then
   raise exception 'image_binding_immutable';
  end if;
  if new.actor_id is not null and new.actor_id is distinct from old.actor_id then
   raise exception 'image_actor_immutable';
  end if;
  if new.review_state is distinct from old.review_state and
   (auth.uid() is null or new.reviewed_by is distinct from auth.uid() or
    ((public.dayo_keepsake_review_owner() or
     (old.actor_id=auth.uid() and public.dayo_keepsake_beta_access(old.booking_id)
      and exists(select 1 from public.bookings b where b.id=old.booking_id and b.partner_user_id=auth.uid()))) is not true)) then
   raise exception 'partner_review_required' using errcode='42501';
  end if;
 end if;
 if new.booking_id is not null and new.object_path<>new.booking_id::text||'/'||new.id::text||'.png' then
  raise exception 'invalid_image_binding';
 end if;
 return new;
end $$;
create or replace function public.dayo_keepsake_reserve(p_booking_id uuid,p_actor_id uuid,p_request_id uuid,
 p_source_version text,p_account_key text,p_plan text,p_verified_at timestamptz,
 p_proof_day date,p_remaining_neurons integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; a public.keepsake_illustration_attempts%rowtype;
 n integer; used integer; today date:=(clock_timestamp() at time zone 'UTC')::date;
 token uuid; t timestamptz:=clock_timestamp();
begin
 -- All callers lock booking before budget; atomic across bookings and concurrent retries.
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.partner_user_id is distinct from p_actor_id
 or b.status not in ('confirmed','completed')
 or not exists(select 1 from public.profiles where id=p_actor_id and role='partner') then
  raise exception 'not_booking_partner' using errcode='42501';
 end if;
 if p_request_id is null or p_source_version is null or length(p_source_version) not between 1 and 100
 or p_account_key is null or p_account_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid_request'; end if;
 select * into a from public.keepsake_illustration_attempts where booking_id=b.id and request_id=p_request_id;
 if found then
  if a.actor_id is distinct from p_actor_id or a.source_version<>p_source_version
   or a.account_key<>p_account_key then raise exception 'request_identity_conflict'; end if;
  return jsonb_build_object('allowed',false,'reused',true,'state',a.state,'token',a.id,
    'attempt',a.attempt,'object_path',a.object_path);
 end if;
 select count(*) into n from public.keepsake_illustration_attempts where booking_id=b.id;
 if n>=2 then return jsonb_build_object('allowed',false,'error','attempt_limit'); end if;
 if exists(select 1 from public.keepsake_illustration_attempts where booking_id=b.id and state='reserved') then
  return jsonb_build_object('allowed',false,'error','generation_pending');
 end if;
 if p_plan is distinct from 'workers_free' or p_remaining_neurons is not null then
  return jsonb_build_object('allowed',false,'error','free_allowance_unverified');
 end if;
 insert into public.keepsake_illustration_daily_budget(account_key,utc_day) values(p_account_key,today)
 on conflict do nothing;
 select reserved_neurons into used from public.keepsake_illustration_daily_budget
 where account_key=p_account_key and utc_day=today for update;
 -- Atomic 10000/day Workers Free reservation ceiling, without fabricating account-wide balance.
 -- Other account usage may exhaust Workers Free; provider rejection falls back cleanly.
 if used+200>10000 then
  return jsonb_build_object('allowed',false,'error','daily_budget_exhausted');
 end if;
 update public.keepsake_illustration_daily_budget set reserved_neurons=used+200
 where account_key=p_account_key and utc_day=today;
 token:=gen_random_uuid();
 insert into public.keepsake_illustration_attempts(id,booking_id,actor_id,request_id,attempt,
 source_version,account_key,utc_day,object_path) values(token,b.id,p_actor_id,p_request_id,n+1,
 p_source_version,p_account_key,today,b.id::text||'/'||token::text||'.png');
 return jsonb_build_object('allowed',true,'plan','workers_free','attempt',n+1,
 'token',token,'object_path',b.id::text||'/'||token::text||'.png');
end $$;

commit;
