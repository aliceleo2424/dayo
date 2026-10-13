-- Keepsake-only correction for the observed authenticated metadata preflight.
-- No data mutation, new table, grant, quota change, or historical migration replay.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
 if to_regprocedure('public.dayo_keepsake_can_read(text)') is null
 or md5(pg_get_functiondef('public.dayo_keepsake_can_read(text)'::regprocedure))<>'70cfc69613a22df88cfa5aedfe008734'
 or to_regprocedure('storage.allow_only_operation(text)') is null
 or not exists(select 1 from storage.buckets where id='dayo-keepsakes' and public=false)
 or not exists(select 1 from public.profiles where id='d6e284f0-5d38-4994-85d6-36930ea50869' and role='admin') then
  raise exception 'keepsake_metadata_preflight_mismatch';
 end if;
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
   (a.review_state='approved' and (auth.uid()=b.learner_id or auth.uid()=b.partner_user_id))))
$$;
commit;
