-- LOCAL PROPOSAL ONLY. Create the two public-read buckets separately in Dashboard first.
-- Public-schema DB migration only; no Storage DDL, policies, ownership or catalog writes.
-- Reviewed after 098 and the exact live PERMISSIVE/RESTRICTIVE Storage audit.
begin;
do $preflight$
begin
 if to_regclass('public.profile_image_assets') is not null
  or to_regclass('public.profile_image_cleanup') is not null then raise exception 'profile_image_contract_already_exists'; end if;
 if to_regclass('public.partner_profile_details') is null
  or to_regprocedure('public.save_partner_profile_completion(jsonb)') is null
  or md5(pg_get_functiondef('public.save_partner_profile_completion(jsonb)'::regprocedure)) <> 'f2bd651dafb500cd3a6d3c82a08927c4' then
  raise exception 'profile_image_completion_contract_changed';
 end if;
 if md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) <> '9e60737c03d5c2c63d4b754ba6f15e35' then raise exception 'profile_image_auth_contract_changed'; end if;
 if md5(pg_get_functiondef('public.handle_social_user_signup()'::regprocedure)) <> 'e2b6bcb0281bd357afbc952e77aed90b' then raise exception 'profile_image_auth_contract_changed'; end if;
 if to_regprocedure('public.get_partner_booking_brief(uuid)') is null
  or md5(pg_get_functiondef('public.get_partner_booking_brief(uuid)'::regprocedure)) <> 'd2ee4114f6da40714cefa9b382a579f9' then raise exception 'profile_image_booking_brief_contract_changed'; end if;
 -- Storage configuration is a SEPARATE Dashboard step; this migration only reads it.
 -- Public reads bypass object RLS; browser writes require matching allow policies.
 -- Abort if the audited allow-policy baseline changes; never modify Storage owners/policies.
 if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
  raise exception 'profile_image_storage_rls_required';
 end if;
 if exists (
  with expected(policyname,cmd,roles,qual,with_check) as (values
   ('Authenticated users can update','UPDATE',array['authenticated']::text[],'(bucket_id = ''public-assets''::text)',null::text),
   ('Authenticated users can upload','INSERT',array['authenticated']::text[],null::text,'(bucket_id = ''public-assets''::text)'),
   ('Public Access','SELECT',array['public']::text[],'(bucket_id = ''public-assets''::text)',null::text),
   ('partner_application_media_admin_read','SELECT',array['authenticated']::text[],'((bucket_id = ''partner-application-videos''::text) AND dayo_is_admin())',null::text)),
  actual as (select policyname::text,cmd::text,roles::text[],qual,with_check from pg_policies
   where schemaname='storage' and tablename='objects' and permissive='PERMISSIVE')
  select 1 from expected e full join actual a using(policyname)
   where e.policyname is null or a.policyname is null
    or e.cmd is distinct from a.cmd or e.roles is distinct from a.roles
    or e.qual is distinct from a.qual or e.with_check is distinct from a.with_check
 ) then raise exception 'profile_image_storage_allow_policies_changed'; end if;
 if (select count(*) from storage.buckets where id in ('partner-profile-images','user-profile-images')
   and public=true and file_size_limit=2097152 and allowed_mime_types=array['image/webp']::text[]) <> 2 then
  raise exception 'profile_image_public_buckets_required';
 end if;
end;
$preflight$;

create table public.profile_image_assets (
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 asset_id uuid not null unique,
 bucket_id text not null check(bucket_id in ('partner-profile-images','user-profile-images')),
 object_path text not null unique,
 visibility text not null check(visibility in ('partner_public','user_public')),
 mime_type text not null default 'image/webp' check(mime_type='image/webp'),
 byte_size integer not null check(byte_size between 1 and 2097152),
 width integer not null check(width between 1 and 1200),
 height integer not null check(height between 1 and 1200),
 fallback_avatar_url text,
 updated_at timestamptz not null default now(),
 check(object_path=owner_id::text||'/'||asset_id::text||'.webp'),
 check((visibility='partner_public' and bucket_id='partner-profile-images') or (visibility='user_public' and bucket_id='user-profile-images'))
);
create table public.profile_image_cleanup (
 bucket_id text not null check(bucket_id in ('partner-profile-images','user-profile-images')),
 object_path text not null,
 created_at timestamptz not null default now(),
 primary key(bucket_id,object_path)
);
alter table public.profile_image_assets enable row level security;
alter table public.profile_image_cleanup enable row level security;
revoke all on public.profile_image_assets,public.profile_image_cleanup from public,anon,authenticated;
grant select,insert,update,delete on public.profile_image_assets,public.profile_image_cleanup to service_role;

create function public.profile_image_asset_url(p_user_id uuid,p_asset_id uuid,p_bucket text)
returns text language sql immutable set search_path='' as $$
 select 'https://mmhapsimcngmtefqfrcg.supabase.co/storage/v1/object/public/'||p_bucket||'/'||p_user_id::text||'/'||p_asset_id::text||'.webp';
$$;
revoke all on function public.profile_image_asset_url(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.profile_image_asset_url(uuid,uuid,text) to service_role;

create function public.replace_profile_image_asset(p_user_id uuid,p_asset_id uuid,p_bucket text,p_bytes integer,p_width integer,p_height integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles; v_previous public.profile_image_assets;
 v_fallback text; v_url text; v_path text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server image API required.' using errcode='42501'; end if;
 select * into v_profile from public.profiles where id=p_user_id for update;
 if not found or v_profile.role not in ('user','partner') then raise exception 'Image owner unavailable.' using errcode='42501'; end if;
 if p_asset_id is null or p_bucket is distinct from (case when v_profile.role='partner' then 'partner-profile-images' else 'user-profile-images' end) then
  raise exception 'Invalid image owner/bucket.' using errcode='22023';
 end if;
 select * into v_previous from public.profile_image_assets where owner_id=p_user_id;
 if v_previous.asset_id=p_asset_id then
  return jsonb_build_object('avatar_url',public.profile_image_asset_url(p_user_id,p_asset_id,p_bucket),'previous',null);
 end if;
 -- Preserve only a provider photo, never generated/catalog fallback.
 v_fallback:=case when v_profile.avatar_url ~ '^https://([^/]+[.])?(googleusercontent[.]com|kakaocdn[.]net|kakao[.]com)/' then v_profile.avatar_url else null end;
 v_path:=p_user_id::text||'/'||p_asset_id::text||'.webp';
 v_url:=public.profile_image_asset_url(p_user_id,p_asset_id,p_bucket);
 insert into public.profile_image_assets(owner_id,asset_id,bucket_id,object_path,visibility,byte_size,width,height,fallback_avatar_url)
 values(p_user_id,p_asset_id,p_bucket,v_path,case when v_profile.role='partner' then 'partner_public' else 'user_public' end,p_bytes,p_width,p_height,v_fallback)
 on conflict(owner_id) do update set asset_id=excluded.asset_id,bucket_id=excluded.bucket_id,object_path=excluded.object_path,
  visibility=excluded.visibility,byte_size=excluded.byte_size,width=excluded.width,height=excluded.height,updated_at=now();
 update public.profiles set avatar_url=v_url,updated_at=now() where id=p_user_id;
 if v_previous.owner_id is not null then
  insert into public.profile_image_cleanup(bucket_id,object_path) values(v_previous.bucket_id,v_previous.object_path) on conflict do nothing;
 end if;
 return jsonb_build_object('avatar_url',v_url,'previous',case when v_previous.owner_id is not null then jsonb_build_object('bucket',v_previous.bucket_id,'path',v_previous.object_path) else null end);
end;
$$;
create function public.remove_user_profile_image_asset(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles; v_previous public.profile_image_assets; v_fallback text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server image API required.' using errcode='42501'; end if;
 select * into v_profile from public.profiles where id=p_user_id for update;
 if not found or v_profile.role is distinct from 'user' then raise exception 'Partner photos must be replaced.' using errcode='42501'; end if;
 select * into v_previous from public.profile_image_assets where owner_id=p_user_id;
 if not found then return jsonb_build_object('avatar_url',case when v_profile.avatar_url ~ '^https://([^/]+[.])?(googleusercontent[.]com|kakaocdn[.]net|kakao[.]com)/' then v_profile.avatar_url else null end,'previous',null); end if;
 v_fallback:=v_previous.fallback_avatar_url;
 delete from public.profile_image_assets where owner_id=p_user_id;
 update public.profiles set avatar_url=v_fallback,updated_at=now() where id=p_user_id;
 insert into public.profile_image_cleanup(bucket_id,object_path) values(v_previous.bucket_id,v_previous.object_path) on conflict do nothing;
 return jsonb_build_object('avatar_url',v_fallback,'previous',jsonb_build_object('bucket',v_previous.bucket_id,'path',v_previous.object_path));
end;
$$;
revoke all on function public.replace_profile_image_asset(uuid,uuid,text,integer,integer,integer),public.remove_user_profile_image_asset(uuid) from public,anon,authenticated;
grant execute on function public.replace_profile_image_asset(uuid,uuid,text,integer,integer,integer),public.remove_user_profile_image_asset(uuid) to service_role;

-- OAuth sync and old profile editors cannot overwrite an active manual photo,
-- including a stale sync that read an empty avatar before the upload committed.
create function public.preserve_managed_profile_image()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_asset public.profile_image_assets;
begin
 select * into v_asset from public.profile_image_assets where owner_id=new.id;
 if found then
  if new.avatar_url ~ '^https://([^/]+[.])?(googleusercontent[.]com|kakaocdn[.]net|kakao[.]com)/' then
   update public.profile_image_assets set fallback_avatar_url=new.avatar_url where owner_id=new.id;
  end if;
  new.avatar_url:=public.profile_image_asset_url(new.id,v_asset.asset_id,v_asset.bucket_id);
 end if;
 return new;
end;
$$;
revoke all on function public.preserve_managed_profile_image() from public,anon,authenticated;
create trigger profiles_managed_image_guard before update of avatar_url on public.profiles
 for each row execute function public.preserve_managed_profile_image();

-- Completed legacy Partners keep their existing grace. Only a NEW completion
-- needs a photo; no approval, capability, booking, or reward contract changes.
create function public.require_partner_completion_photo()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_avatar text;
begin
 if new.completed_at is null then return new; end if;
 if tg_op='UPDATE' and old.completed_at is not null then return new; end if;
 -- INSERT ... ON CONFLICT runs the INSERT trigger before conflict resolution.
 -- Existing completed Partners must retain grace on that RPC path too.
 if exists(select 1 from public.partner_profile_details where partner_id=new.partner_id and completed_at is not null) then return new; end if;
 select avatar_url into v_avatar from public.profiles where id=new.partner_id and role='partner';
 if exists(select 1 from public.profile_image_assets where owner_id=new.partner_id and visibility='partner_public') then return new; end if;
 if v_avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
  or (v_avatar ~ '^https://' and v_avatar !~* '^https://([^/]+[.])?(dicebear[.]com|dicebear[.]net)/' and v_avatar !~ '/images/partner-avatars/') then return new; end if;
 raise exception 'Add your profile photo before completing your Partner Profile.' using errcode='22023';
end;
$$;
revoke all on function public.require_partner_completion_photo() from public,anon,authenticated;
create trigger partner_completion_photo_guard before insert or update of completed_at on public.partner_profile_details
 for each row execute function public.require_partner_completion_photo();
-- Exact live signup bodies with image-source expressions changed only.
-- No provider/identity/nickname/role/ticket behavior changes or existing-user backfill.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  detected_provider text;
BEGIN
  detected_provider := COALESCE(
    NEW.raw_app_meta_data->>'provider',
    CASE 
      WHEN NEW.raw_user_meta_data->>'iss' LIKE '%kakao%' THEN 'kakao'
      WHEN NEW.raw_user_meta_data->>'iss' LIKE '%google%' THEN 'google'
      WHEN NEW.email IS NOT NULL THEN 'email'
      ELSE '미확인'
    END
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    nickname,
    role,
    ticket_count,
    provider,
    admin_memo,
    avatar_url,
    created_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'user',
    0,
    detected_provider,
    NULL,
    CASE WHEN detected_provider IN ('google','kakao') THEN COALESCE(NULLIF(NEW.raw_user_meta_data->>'profile_image',''),NULLIF(NEW.raw_user_meta_data->>'avatar_url',''),NULLIF(NEW.raw_user_meta_data->>'picture','')) ELSE NULL END,
    timezone('utc', now())
  )
  ON CONFLICT (id) DO UPDATE SET
    provider = EXCLUDED.provider;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_social_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  raw_meta jsonb;
  user_provider text;
  kakao_uid text;
  user_nick text;
  user_mail text;
  user_avatar text;
BEGIN
  raw_meta := new.raw_user_meta_data;
  user_provider := COALESCE(new.raw_app_meta_data->>'provider', 'email');
  
  -- 카카오 고유 ID 추출 (sub 또는 provider_id)
  kakao_uid := COALESCE(raw_meta->>'provider_id', raw_meta->>'sub', new.id::text);
  
  -- 닉네임 추출 (name, nickname, full_name 순서로 확인)
  user_nick := COALESCE(
    raw_meta->>'name',
    raw_meta->>'nickname',
    raw_meta->>'full_name',
    CASE WHEN user_provider = 'kakao' THEN '카카오 회원 (' || SUBSTRING(new.id::text, 1, 5) || ')' ELSE '새싹 회원' END
  );
  
  -- 이메일 추출
  user_mail := COALESCE(new.email, raw_meta->>'email', '');
  user_avatar := CASE WHEN user_provider IN ('google','kakao') THEN COALESCE(NULLIF(raw_meta->>'profile_image',''),NULLIF(raw_meta->>'avatar_url',''),NULLIF(raw_meta->>'picture','')) ELSE NULL END;

  -- profiles 테이블 생성/업데이트
  INSERT INTO public.profiles (
    id,
    user_id,
    email,
    nickname,
    user_name,
    avatar_url,
    provider,
    kakao_id,
    role,
    ticket_count,
    tickets
  )
  VALUES (
    new.id,
    new.id,
    user_mail,
    user_nick,
    user_nick,
    user_avatar,
    user_provider,
    CASE WHEN user_provider = 'kakao' THEN kakao_uid ELSE NULL END,
    'user',
    0,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nickname = CASE WHEN profiles.nickname IS NULL OR profiles.nickname = '' OR profiles.nickname = '미등록' THEN EXCLUDED.nickname ELSE profiles.nickname END,
    provider = EXCLUDED.provider,
    kakao_id = COALESCE(profiles.kakao_id, EXCLUDED.kakao_id);

  RETURN new;
END;
$function$
;

-- Preserve the live assigned-partner/exact-booking authorization and other Brief fields.
do $brief$
declare v_before text; v_after text;
begin
 v_before:=pg_get_functiondef('public.get_partner_booking_brief(uuid)'::regprocedure);
 v_after:=replace(v_before,'''learner_display_name'', v_nickname,',
  '''learner_avatar_url'', (select case when p.avatar_url ~* ''^https://([^/]+[.])?(dicebear[.]com|dicebear[.]net)/'' or p.avatar_url like ''%/images/partner-avatars/%'' then null else p.avatar_url end from public.profiles p where p.id=v_learner_id),
    ''learner_display_name'', v_nickname,');
 if v_before=v_after then raise exception 'profile_image_booking_brief_return_changed'; end if;
 execute v_after;
end;
$brief$;

notify pgrst,'reload schema';
commit;
