-- Local draft only. No dependency on excluded 104; no historical data conversion.
-- Provision dayo-keepsakes through the Storage API with ensurePrivateBucket() first.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
 if to_regclass('public.keepsake_illustration_attempts') is not null
 or to_regclass('public.keepsake_illustration_daily_budget') is not null then
  raise exception 'Keepsake migration already present';
 end if;
 if to_regclass('public.bookings') is null or to_regclass('public.profiles') is null
 or to_regclass('auth.users') is null or to_regclass('storage.objects') is null
 or not exists(select 1 from pg_class where oid=to_regclass('storage.objects') and relrowsecurity)
 or not exists(select 1 from pg_class where oid=to_regclass('storage.buckets') and relrowsecurity)
 or not exists(select 1 from storage.buckets where id='dayo-keepsakes' and public=false
   and file_size_limit=5242880 and allowed_mime_types=array['image/png']::text[])
 or not exists(select 1 from information_schema.columns where table_schema='public'
   and table_name='session_reports' and column_name='feedback' and data_type='jsonb') then
  raise exception 'Missing verified private bucket or canonical schema';
 end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace
   and proname like 'dayo_keepsake_%') then raise exception 'Keepsake function collision'; end if;
end $$;

-- Budget debits are never refunded, including failed attempts and account deletion.
create table public.keepsake_illustration_daily_budget (
 account_key text not null check(account_key ~ '^[a-f0-9]{64}$'),
 utc_day date not null, reserved_neurons integer not null default 0
 check(reserved_neurons between 0 and 2000), primary key(account_key,utc_day)
);
-- This ledger doubles as the durable deletion outbox. Tombstones retain no user IDs.
create table public.keepsake_illustration_attempts (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid references public.bookings(id) on delete set null,
 actor_id uuid references auth.users(id) on delete set null
   references public.profiles(id) on delete set null,
 request_id uuid not null, attempt smallint not null check(attempt between 1 and 2),
 source_version text not null check(length(source_version) between 1 and 100),
 account_key text not null, utc_day date not null,
 reserved_neurons integer not null default 200 check(reserved_neurons=200),
 state text not null default 'reserved' check(state in ('reserved','ready','failed','cleanup','deleted')),
 object_path text not null unique, failure_code text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(booking_id,request_id), unique(booking_id,attempt),
 foreign key(account_key,utc_day) references public.keepsake_illustration_daily_budget(account_key,utc_day),
 check(object_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.png$'),
 check(failure_code is null or failure_code in ('timeout','provider_unavailable','provider_request_failed',
   'quota_unavailable','provider_http_error','invalid_image','save_failed','interrupted'))
);
create index keepsake_cleanup_pending on public.keepsake_illustration_attempts(updated_at)
 where state in ('cleanup','reserved');
create index keepsake_actor on public.keepsake_illustration_attempts(actor_id) where actor_id is not null;
alter table public.keepsake_illustration_attempts enable row level security;
alter table public.keepsake_illustration_daily_budget enable row level security;
revoke all on public.keepsake_illustration_attempts,public.keepsake_illustration_daily_budget from public,anon,authenticated;
grant select,insert,update,delete on public.keepsake_illustration_attempts,public.keepsake_illustration_daily_budget to service_role;

-- Only trusted server code can submit an account-bound Workers Free dashboard attestation.
-- Cloudflare enforces free exhaustion; remaining balance is deliberately unknown.
create function public.dayo_keepsake_reserve(p_booking_id uuid,p_actor_id uuid,p_request_id uuid,
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
 if p_plan is distinct from 'workers_free' or p_verified_at is null or p_verified_at>t
 or p_verified_at<t-interval '12 hours' or p_proof_day is distinct from today
 or p_remaining_neurons is not null then
  return jsonb_build_object('allowed',false,'error','free_allowance_unverified');
 end if;
 insert into public.keepsake_illustration_daily_budget(account_key,utc_day) values(p_account_key,today)
 on conflict do nothing;
 select reserved_neurons into used from public.keepsake_illustration_daily_budget
 where account_key=p_account_key and utc_day=today for update;
 -- Atomic 2000/day local reservation ceiling, without fabricating account-wide balance.
 -- Other account usage may exhaust Workers Free; provider rejection falls back cleanly.
 if used+200>2000 then
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

create function public.dayo_keepsake_finish(p_token uuid,p_actor_id uuid,p_failure_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.keepsake_illustration_attempts%rowtype;
begin
 select * into a from public.keepsake_illustration_attempts where id=p_token for update;
 if not found or a.actor_id is distinct from p_actor_id or a.booking_id is null
 or a.state not in ('reserved','ready') then raise exception 'reservation_inactive' using errcode='42501'; end if;
 if a.state='ready' then return jsonb_build_object('state','ready','object_path',a.object_path); end if;
 -- Error paths go through cleanup, because an upload may have succeeded before an ACK failed.
 update public.keepsake_illustration_attempts set state=case when p_failure_code is null then 'ready' else 'cleanup' end,
 failure_code=p_failure_code,updated_at=clock_timestamp() where id=a.id;
 return jsonb_build_object('state',case when p_failure_code is null then 'ready' else 'cleanup' end,'object_path',a.object_path);
end $$;

create function public.dayo_keepsake_can_read(p_object_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.keepsake_illustration_attempts a
 join public.bookings b on b.id=a.booking_id where a.object_path=p_object_path and a.state='ready'
 and (auth.uid()=b.learner_id or auth.uid()=b.partner_user_id))
$$;
create function public.dayo_keepsake_asset(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.bookings where id=p_booking_id
 and (auth.uid()=learner_id or auth.uid()=partner_user_id)) then
 raise exception 'not_booking_participant' using errcode='42501'; end if;
 select jsonb_build_object('bucket','dayo-keepsakes','object_path',object_path) into result
 from public.keepsake_illustration_attempts where booking_id=p_booking_id and state='ready'
 order by attempt desc limit 1;
 return result;
end $$;
-- Restrictive bucket-only gates prevent broader existing storage policies granting access.
create policy dayo_keepsake_read_guard on storage.objects as restrictive for select to public
 using(bucket_id<>'dayo-keepsakes' or public.dayo_keepsake_can_read(name));
create policy dayo_keepsake_participant_read on storage.objects for select to authenticated
 using(bucket_id='dayo-keepsakes' and public.dayo_keepsake_can_read(name));
create policy dayo_keepsake_insert_guard on storage.objects as restrictive for insert to public
 with check(bucket_id<>'dayo-keepsakes');
create policy dayo_keepsake_update_guard on storage.objects as restrictive for update to public
 using(bucket_id<>'dayo-keepsakes') with check(bucket_id<>'dayo-keepsakes');
create policy dayo_keepsake_delete_guard on storage.objects as restrictive for delete to public
 using(bucket_id<>'dayo-keepsakes');

-- Prevent an existing broad bucket-write policy exposing this private bucket later.
create policy dayo_keepsake_bucket_insert_guard on storage.buckets as restrictive for insert to public
 with check(id<>'dayo-keepsakes');
create policy dayo_keepsake_bucket_update_guard on storage.buckets as restrictive for update to public
 using(id<>'dayo-keepsakes') with check(id<>'dayo-keepsakes');
create policy dayo_keepsake_bucket_delete_guard on storage.buckets as restrictive for delete to public
 using(id<>'dayo-keepsakes');

-- BEFORE deletion: revoke new access and keep object-path tombstones for Storage API cleanup.
create function public.dayo_keepsake_before_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='bookings' then
  update public.keepsake_illustration_attempts set booking_id=null,actor_id=null,state='cleanup',
   source_version='deleted',updated_at=clock_timestamp() where booking_id=old.id and state<>'deleted';
 else
  update public.keepsake_illustration_attempts a set booking_id=null,actor_id=null,state='cleanup',
   source_version='deleted',updated_at=clock_timestamp() where a.state<>'deleted' and
   (a.actor_id=old.id or a.booking_id in (select id from public.bookings
      where learner_id=old.id or partner_user_id=old.id));
 end if;
 return old;
end $$;
create trigger dayo_keepsake_booking_delete before delete on public.bookings
 for each row execute function public.dayo_keepsake_before_delete();
create trigger dayo_keepsake_profile_delete before delete on public.profiles
 for each row execute function public.dayo_keepsake_before_delete();
create trigger dayo_keepsake_auth_delete before delete on auth.users
 for each row execute function public.dayo_keepsake_before_delete();

-- Claim deletion work atomically; crashed workers may retry REMOVE (idempotent).
create function public.dayo_keepsake_cleanup_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.keepsake_illustration_attempts%rowtype;
begin
 select * into a from public.keepsake_illustration_attempts
 where (state='cleanup' and updated_at<clock_timestamp()-interval '2 minutes')
 or (state='reserved' and created_at<clock_timestamp()-interval '2 minutes')
 order by updated_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.keepsake_illustration_attempts set state='cleanup',
 failure_code=coalesce(failure_code,'interrupted'),updated_at=clock_timestamp() where id=a.id;
 return jsonb_build_object('token',a.id,'object_path',a.object_path);
end $$;
create function public.dayo_keepsake_cleanup_done(p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.keepsake_illustration_attempts where id=p_token and state='cleanup' and booking_id is null;
 update public.keepsake_illustration_attempts set state='failed',updated_at=clock_timestamp()
 where id=p_token and state='cleanup';
end $$;

revoke all on function public.dayo_keepsake_reserve(uuid,uuid,uuid,text,text,text,timestamptz,date,integer),
 public.dayo_keepsake_finish(uuid,uuid,text),public.dayo_keepsake_cleanup_claim(),
 public.dayo_keepsake_cleanup_done(uuid),public.dayo_keepsake_before_delete() from public,anon,authenticated;
grant execute on function public.dayo_keepsake_reserve(uuid,uuid,uuid,text,text,text,timestamptz,date,integer),
 public.dayo_keepsake_finish(uuid,uuid,text),public.dayo_keepsake_cleanup_claim(),
 public.dayo_keepsake_cleanup_done(uuid) to service_role;
revoke all on function public.dayo_keepsake_can_read(text),public.dayo_keepsake_asset(uuid) from public,anon;
grant execute on function public.dayo_keepsake_can_read(text) to anon,authenticated;
grant execute on function public.dayo_keepsake_asset(uuid) to authenticated;

-- Reuse existing pg_cron/pg_net/Vault; never alter notification jobs or secrets.
-- The dedicated job is INACTIVE until the scoped code is deployed and owner approves.
do $$ begin
 if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
 or to_regprocedure('cron.schedule(text,text,text)') is null
 or to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') is null
 or not exists(select 1 from vault.decrypted_secrets where name='dayo_booking_notification_retry_secret' and length(decrypted_secret)>=32)
 or exists(select 1 from cron.job where jobname='dayo-keepsake-cleanup') then
  raise exception 'Missing verified cleanup scheduler or job collision';
 end if;
end $$;
create function public.dayo_keepsake_dispatch_cleanup()
returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; request bigint;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='dayo_booking_notification_retry_secret';
 if secret is null or length(secret)<32 then raise exception 'cleanup_auth_unavailable'; end if;
 -- Only enqueue work when eligible tombstones/stale reservations exist.
 if not exists(select 1 from public.keepsake_illustration_attempts where
  (state='cleanup' and updated_at<clock_timestamp()-interval '2 minutes') or
  (state='reserved' and created_at<clock_timestamp()-interval '2 minutes')) then return null; end if;
 select net.http_post(url:='https://www.dayotalk.com/api/conversation-recap',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),
  body:=jsonb_build_object('action','keepsake_cleanup'),timeout_milliseconds:=10000) into request;
 return request;
end $$;
revoke all on function public.dayo_keepsake_dispatch_cleanup() from public,anon,authenticated;
grant execute on function public.dayo_keepsake_dispatch_cleanup() to service_role;
do $$ declare job bigint; begin
 job:=cron.schedule('dayo-keepsake-cleanup','*/10 * * * *','select public.dayo_keepsake_dispatch_cleanup();');
 perform cron.alter_job(job_id:=job,active:=false);
end $$;

commit;
