-- DRAFT: requires separate approval. Replaces only three existing keepsake functions.
-- No migration replay, data mutation, new schema objects/grants, or quota changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
 if md5(pg_get_functiondef('public.dayo_keepsake_can_read(text)'::regprocedure))<>'bf354fcb42dc6443f20ecc2032f69d90'
 or md5(pg_get_functiondef('public.dayo_keepsake_review_guard()'::regprocedure))<>'9fbd425d33a9f108deea3530ba3797e1'
 or md5(pg_get_functiondef('public.dayo_keepsake_review(text,uuid,uuid,text,text,text,smallint)'::regprocedure))<>'038dfe4dab5919067047db0555e3f314'
 or not exists(select 1 from storage.buckets where id='dayo-keepsakes' and public=false)
 or not exists(select 1 from public.profiles where id='d6e284f0-5d38-4994-85d6-36930ea50869' and role='admin') then
  raise exception 'partner_review_preflight_mismatch';
 end if;
end $$;
create or replace function public.dayo_keepsake_review_guard() returns trigger
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
create or replace function public.dayo_keepsake_can_read(p_object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (storage.allow_only_operation('object.get_authenticated')
 or storage.allow_only_operation('object.get_authenticated_info'))
 and exists(select 1 from public.keepsake_illustration_attempts a
 join public.bookings b on b.id=a.booking_id
 join storage.objects o on o.bucket_id='dayo-keepsakes' and o.name=a.object_path and o.version=a.storage_version
 where a.object_path=p_object_path and a.state='ready' and a.image_sha256 is not null
 and public.dayo_keepsake_beta_access(b.id)
 and (public.dayo_keepsake_review_owner() or
   (a.review_state='pending' and auth.uid()=b.partner_user_id and auth.uid()=a.actor_id) or
   (a.review_state='approved' and (auth.uid()=b.learner_id or auth.uid()=b.partner_user_id))))
$$;
create or replace function public.dayo_keepsake_review(p_action text,p_booking_id uuid default null,
 p_attempt_id uuid default null,p_sha256 text default null,p_object_path text default null,
 p_storage_version text default null,p_slot smallint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.keepsake_illustration_attempts%rowtype; result jsonb; target text; v_owner boolean;
begin
 v_owner:=public.dayo_keepsake_review_owner();
 if auth.uid() is null then raise exception 'partner_review_required' using errcode='42501'; end if;
 if p_action in ('enroll','disable') then
  if not v_owner then raise exception 'owner_review_required' using errcode='42501'; end if;
 elsif p_action='list' then
  if not v_owner and (p_booking_id is null or not public.dayo_keepsake_beta_access(p_booking_id)
   or not exists(select 1 from public.bookings b where b.id=p_booking_id and b.partner_user_id=auth.uid())) then
   raise exception 'partner_review_required' using errcode='42501';
  end if;
 elsif not v_owner and not exists(select 1 from public.bookings b
  join public.keepsake_illustration_attempts image on image.booking_id=b.id
  where b.id=p_booking_id and b.partner_user_id=auth.uid() and image.id=p_attempt_id
  and image.actor_id=auth.uid() and public.dayo_keepsake_beta_access(b.id)) then
  raise exception 'partner_review_required' using errcode='42501';
 end if;
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
    (p_booking_id is null or booking_id=p_booking_id) and (v_owner or actor_id=auth.uid()) order by created_at desc limit 20) q;
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
commit;
