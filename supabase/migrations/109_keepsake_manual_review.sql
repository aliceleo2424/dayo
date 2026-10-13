-- Draft only: requires separate approval. Does not rerun/modify 107 or 108.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
 if to_regclass('public.keepsake_beta_bookings') is not null
 or exists(select 1 from information_schema.columns where table_schema='public' and table_name='keepsake_illustration_attempts' and column_name='image_sha256')
 or to_regprocedure('public.dayo_is_admin()') is null
 or to_regprocedure('storage.allow_only_operation(text)') is null
 or not exists(select 1 from public.profiles where id='d6e284f0-5d38-4994-85d6-36930ea50869' and role='admin')
 or not exists(select 1 from storage.buckets where id='dayo-keepsakes' and public=false)
 or not exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='version' and data_type='text') then
  raise exception 'manual_review_preflight_mismatch';
 end if;
end $$;
-- Exactly two lifetime beta slots. No enrollment is performed by this migration.
create table public.keepsake_beta_bookings (
 slot smallint primary key check(slot in (1,2)),
 booking_id uuid unique references public.bookings(id) on delete set null,
 enabled boolean not null default true,
 enrolled_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.keepsake_beta_bookings enable row level security;
revoke all on public.keepsake_beta_bookings from public,anon,authenticated;
grant select on public.keepsake_beta_bookings to service_role;
alter table public.keepsake_illustration_attempts
 add column image_sha256 text check(image_sha256 ~ '^[a-f0-9]{64}$'),
 add column storage_version text,
 add column review_state text not null default 'pending' check(review_state in ('pending','approved','rejected','revoked')),
 add column reviewed_by uuid references auth.users(id) on delete set null,
 add column reviewed_at timestamptz;
alter table public.keepsake_illustration_attempts add constraint keepsake_review_binding
 check(review_state<>'approved' or (image_sha256 is not null and storage_version is not null and reviewed_at is not null));

create function public.dayo_keepsake_review_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid()='d6e284f0-5d38-4994-85d6-36930ea50869'::uuid and public.dayo_is_admin()
$$;
create function public.dayo_keepsake_beta_access(p_booking_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.bookings b where b.id=p_booking_id
 and (auth.uid()=b.learner_id or auth.uid()=b.partner_user_id or public.dayo_keepsake_review_owner())
 and ((b.id='ea5289f9-41fe-4b94-9677-bd3b038c87eb' and b.is_test_session=true)
 or exists(select 1 from public.keepsake_beta_bookings x where x.booking_id=b.id and x.enabled)))
$$;
create function public.dayo_keepsake_review_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if current_setting('dayo.keepsake.manual_review',true) is distinct from 'v1'
   or new.review_state<>'pending' or new.image_sha256 is not null
  or not exists(select 1 from public.bookings b where b.id=new.booking_id and
   ((b.id='ea5289f9-41fe-4b94-9677-bd3b038c87eb' and b.is_test_session=true)
    or exists(select 1 from public.keepsake_beta_bookings x where x.booking_id=b.id and x.enabled))) then
   raise exception 'beta_booking_required' using errcode='42501';
  end if;
 else
  if new.id<>old.id or new.object_path<>old.object_path or new.request_id<>old.request_id
   or (old.image_sha256 is not null and (new.image_sha256 is distinct from old.image_sha256 or new.storage_version is distinct from old.storage_version)) then
   raise exception 'image_binding_immutable';
  end if;
  if new.review_state is distinct from old.review_state and not public.dayo_keepsake_review_owner() then
   raise exception 'owner_review_required' using errcode='42501';
  end if;
 end if;
 if new.booking_id is not null and new.object_path<>new.booking_id::text||'/'||new.id::text||'.png' then
  raise exception 'invalid_image_binding';
 end if;
 return new;
end $$;
create trigger dayo_keepsake_review_guard before insert or update on public.keepsake_illustration_attempts
for each row execute function public.dayo_keepsake_review_guard();

-- Only the new review-aware server path may reserve; legacy unreviewed code fails before a provider call.
create function public.dayo_keepsake_reserve_review(p_booking_id uuid,p_actor_id uuid,p_request_id uuid,
 p_source_version text,p_account_key text,p_plan text,p_verified_at timestamptz,p_proof_day date,p_remaining_neurons integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.set_config('dayo.keepsake.manual_review','v1',true);
 return public.dayo_keepsake_reserve(p_booking_id,p_actor_id,p_request_id,p_source_version,p_account_key,p_plan,p_verified_at,p_proof_day,p_remaining_neurons);
end $$;
revoke all on function public.dayo_keepsake_reserve_review(uuid,uuid,uuid,text,text,text,timestamptz,date,integer) from public,anon,authenticated;
grant execute on function public.dayo_keepsake_reserve_review(uuid,uuid,uuid,text,text,text,timestamptz,date,integer) to service_role;

-- Trusted upload records SHA-256 and immutable Storage object version, but never publishes.
create function public.dayo_keepsake_stage(p_token uuid,p_actor_id uuid,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.keepsake_illustration_attempts%rowtype; v text;
begin
 select * into a from public.keepsake_illustration_attempts where id=p_token for update;
 if not found or a.actor_id is distinct from p_actor_id or a.booking_id is null
 or a.state not in ('reserved','ready') or a.review_state<>'pending' or p_sha256 is null
 or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'reservation_inactive'; end if;
 select version into v from storage.objects where bucket_id='dayo-keepsakes' and name=a.object_path;
 if v is null then raise exception 'stored_image_required'; end if;
 if a.image_sha256 is not null and (a.image_sha256<>p_sha256 or a.storage_version<>v) then
  raise exception 'image_binding_conflict';
 end if;
 update public.keepsake_illustration_attempts set state='ready',image_sha256=p_sha256,storage_version=v,
 updated_at=clock_timestamp() where id=a.id;
 return jsonb_build_object('status','pending_review','booking_id',a.booking_id,'attempt_id',a.id);
end $$;

-- Existing restrictive bucket policy uses this function; no unrelated RLS is changed.
-- Signing/listing are intentionally denied, including to the reviewing admin.
create or replace function public.dayo_keepsake_can_read(p_object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and storage.allow_only_operation('object.get_authenticated')
 and exists(select 1 from public.keepsake_illustration_attempts a
 join public.bookings b on b.id=a.booking_id
 join storage.objects o on o.bucket_id='dayo-keepsakes' and o.name=a.object_path and o.version=a.storage_version
 where a.object_path=p_object_path and a.state='ready' and a.image_sha256 is not null
 and public.dayo_keepsake_beta_access(b.id)
 and (public.dayo_keepsake_review_owner() or
   (a.review_state='approved' and (auth.uid()=b.learner_id or auth.uid()=b.partner_user_id))))
$$;
create or replace function public.dayo_keepsake_asset(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.bookings where id=p_booking_id
 and (auth.uid()=learner_id or auth.uid()=partner_user_id)) then
  raise exception 'not_booking_participant' using errcode='42501';
 end if;
 if not public.dayo_keepsake_beta_access(p_booking_id) then return null; end if;
 select jsonb_build_object('bucket','dayo-keepsakes','object_path',a.object_path,
 'image_sha256',a.image_sha256,'storage_version',a.storage_version,'approved',true) into result
 from public.keepsake_illustration_attempts a join storage.objects o
 on o.bucket_id='dayo-keepsakes' and o.name=a.object_path and o.version=a.storage_version
 where a.booking_id=p_booking_id and a.state='ready' and a.review_state='approved'
 and a.image_sha256 is not null order by a.attempt desc limit 1;
 return result;
end $$;

-- Participant JWT, not a service-role/admin identity supplied in the request.
create function public.dayo_keepsake_review(p_action text,p_booking_id uuid default null,
 p_attempt_id uuid default null,p_sha256 text default null,p_object_path text default null,
 p_storage_version text default null,p_slot smallint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.keepsake_illustration_attempts%rowtype; result jsonb; target text;
begin
 if not public.dayo_keepsake_review_owner() then raise exception 'owner_review_required' using errcode='42501'; end if;
 if p_action='enroll' then
  if p_slot is null or p_slot not in (1,2) or not exists(select 1 from public.bookings
   where id=p_booking_id and status in ('confirmed','completed') and learner_id is not null and partner_user_id is not null) then
   raise exception 'invalid_beta_booking'; end if;
  insert into public.keepsake_beta_bookings(slot,booking_id,enrolled_by) values(p_slot,p_booking_id,auth.uid())
  on conflict(slot) do nothing;
  if not exists(select 1 from public.keepsake_beta_bookings where slot=p_slot and booking_id=p_booking_id) then
   raise exception 'beta_slot_already_used'; end if;
  return jsonb_build_object('status','enrolled');
 elsif p_action='disable' then
  update public.keepsake_beta_bookings set enabled=false where booking_id=p_booking_id;
  return jsonb_build_object('status','disabled');
 elsif p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from
   (select id,booking_id,object_path,image_sha256,storage_version,review_state,state,created_at
    from public.keepsake_illustration_attempts where image_sha256 is not null and
    (p_booking_id is null or booking_id=p_booking_id) order by created_at desc limit 20) q;
  return result;
 end if;
 select * into a from public.keepsake_illustration_attempts where id=p_attempt_id and booking_id=p_booking_id for update;
 if not found or a.image_sha256 is null or not public.dayo_keepsake_beta_access(p_booking_id)
 or not exists(select 1 from storage.objects where bucket_id='dayo-keepsakes' and name=a.object_path and version=a.storage_version) then
  raise exception 'review_image_unavailable'; end if;
 if p_action='preview' and a.state='ready' then
  return jsonb_build_object('bucket','dayo-keepsakes','object_path',a.object_path,'image_sha256',a.image_sha256,
   'storage_version',a.storage_version,'review_state',a.review_state);
 end if;
 if p_sha256 is distinct from a.image_sha256 or p_object_path is distinct from a.object_path
 or p_storage_version is distinct from a.storage_version then raise exception 'review_version_changed'; end if;
 target:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'revoke' then 'revoked' else null end;
 if target is null then raise exception 'invalid_review_action'; end if;
 if a.review_state=target then return jsonb_build_object('status',target,'reused',true); end if;
 if a.state<>'ready' or (p_action in ('approve','reject') and a.review_state<>'pending')
 or (p_action='revoke' and a.review_state<>'approved') then raise exception 'review_state_changed'; end if;
 update public.keepsake_illustration_attempts set review_state=target,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),
 state=case when target='approved' then 'ready' else 'cleanup' end,updated_at=clock_timestamp()
 where id=a.id;
 return jsonb_build_object('status',target);
end $$;
revoke all on function public.dayo_keepsake_review_owner(),public.dayo_keepsake_beta_access(uuid),
 public.dayo_keepsake_review_guard(),public.dayo_keepsake_stage(uuid,uuid,text),
 public.dayo_keepsake_review(text,uuid,uuid,text,text,text,smallint) from public,anon,authenticated;
grant execute on function public.dayo_keepsake_review_owner(),public.dayo_keepsake_beta_access(uuid),
 public.dayo_keepsake_review(text,uuid,uuid,text,text,text,smallint) to authenticated;
grant execute on function public.dayo_keepsake_stage(uuid,uuid,text) to service_role;
commit;
