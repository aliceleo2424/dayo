begin;

-- Additive profile fields; existing 077 rows are not rewritten.
create table public.partner_application_uploads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_hash text not null check (length(request_hash) = 64),
  video_path text not null unique,
  claimed_at timestamptz
);
create index partner_application_uploads_request_time on public.partner_application_uploads (request_hash, created_at);
alter table public.partner_application_uploads enable row level security;
revoke all on public.partner_application_uploads from public, anon, authenticated;
grant select, insert, update on public.partner_application_uploads to service_role;

alter table public.partner_applications
  add column current_country text check (length(trim(current_country)) between 1 and 100),
  add column native_languages text[] check (cardinality(native_languages) between 1 and 14 and length(array_to_string(native_languages, ',')) <= 1500),
  add column other_language_proficiencies jsonb not null default '{}'::jsonb,
  add column acquisition_source_other text not null default '' check (length(acquisition_source_other) <= 200),
  add column media_upload_id uuid references public.partner_application_uploads(id),
  add column intro_video_path text,
  add column intro_video_language text;

-- Keep historical answers intact; new applications do not collect motivation.
alter table public.partner_applications alter column motivation drop not null;

alter table public.partner_applications drop constraint partner_applications_visa_type_check;
alter table public.partner_applications add constraint partner_applications_visa_type_check
  check (visa_type in ('D-2','D-4','F-series','Other','outside_korea'));
alter table public.partner_applications drop constraint partner_applications_korean_level_check;
alter table public.partner_applications add constraint partner_applications_korean_level_check
  check (korean_level in ('none','basic','conversational','advanced','native'));
alter table public.partner_applications drop constraint partner_applications_availability_periods_check;
alter table public.partner_applications add constraint partner_applications_availability_periods_check
  check (cardinality(availability_periods) between 1 and 10 and availability_periods <@ array[
    'weekday_early_morning','weekday_morning','weekday_afternoon','weekday_evening','weekday_late_night',
    'weekend_early_morning','weekend_morning','weekend_afternoon','weekend_evening','weekend_late_night'
  ]::text[]);
alter table public.partner_applications drop constraint partner_applications_partner_languages_check;
alter table public.partner_applications add constraint partner_applications_partner_languages_check
  check (cardinality(partner_languages) between 1 and 20 and length(array_to_string(partner_languages, ',')) <= 1500);
create unique index partner_applications_media_upload_unique on public.partner_applications (media_upload_id) where media_upload_id is not null;

grant insert (current_country,native_languages,other_language_proficiencies,acquisition_source_other,media_upload_id,intro_video_path,intro_video_language)
  on public.partner_applications to anon, authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
  ('partner-application-videos','partner-application-videos',false,52428800,array['video/mp4','video/webm','video/quicktime']);

-- Fence these private buckets even if another bucket has broader policies.
-- Avoid referencing the applicant table directly in a Storage policy: anon has
-- no SELECT grant there, which would also break reads of unrelated public assets.
create function public.partner_application_media_admin_access(p_bucket text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.dayo_is_admin() and exists (
    select 1 from public.partner_applications a where
      (p_bucket = 'partner-application-videos' and a.intro_video_path = p_path)
  );
$$;
revoke all on function public.partner_application_media_admin_access(text,text) from public;
grant execute on function public.partner_application_media_admin_access(text,text) to anon, authenticated;
create policy partner_application_media_fence on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id not in ('partner-application-videos') or public.partner_application_media_admin_access(bucket_id,name))
  with check (bucket_id not in ('partner-application-videos'));
create policy partner_application_media_admin_read on storage.objects for select to authenticated
  using (bucket_id in ('partner-application-videos') and public.dayo_is_admin());

-- Anonymous clients receive only a signed upload token, never table access or a read URL.
create function public.issue_partner_application_upload(p_request_hash text, p_video_extension text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_video text;
begin
  if p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_video_extension is null or p_video_extension not in ('mp4','webm','mov') then
    raise exception 'Invalid upload request.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_hash, 0));
  if (select count(*) from public.partner_application_uploads where request_hash = p_request_hash and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many upload requests. Please try later.' using errcode = 'P0001';
  end if;
  v_video := 'applications/' || v_id::text || '/intro.' || p_video_extension;
  insert into public.partner_application_uploads(id,request_hash,video_path) values (v_id,p_request_hash,v_video);
  return pg_catalog.jsonb_build_object('id',v_id,'video_path',v_video);
end;
$$;
revoke all on function public.issue_partner_application_upload(text,text) from public, anon, authenticated;
grant execute on function public.issue_partner_application_upload(text,text) to service_role;

create function public.validate_partner_application_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_upload public.partner_application_uploads%rowtype;
  v_language text;
  v_level text;
begin
  if exists (select 1 from public.partner_applications where lower(trim(email)) = lower(trim(new.email)) and final_status <> 'rejected') then
    raise exception 'An application with this email already exists.' using errcode = '23505';
  end if;
  if new.current_country is null or length(trim(new.current_country)) = 0
    or new.native_languages is null or cardinality(new.native_languages) not between 1 and 14 then
    raise exception 'Location and native languages are required.' using errcode = '23514';
  end if;
  if new.visa_type = 'outside_korea' and lower(trim(new.current_country)) in ('korea','south korea','republic of korea','한국','대한민국') then
    raise exception 'Overseas applicants must provide their current country.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.native_languages) l where l is null or length(trim(l)) not between 1 and 100)
    or cardinality(new.native_languages) <> (select count(distinct lower(trim(l))) from unnest(new.native_languages) l) then
    raise exception 'Invalid native languages.' using errcode = '23514';
  end if;
  if pg_catalog.jsonb_typeof(new.other_language_proficiencies) <> 'object' then
    raise exception 'Invalid language proficiency mapping.' using errcode = '23514';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(new.other_language_proficiencies)) > 14 then
    raise exception 'Too many languages.' using errcode = '23514';
  end if;
  for v_language, v_level in select key, value from pg_catalog.jsonb_each_text(new.other_language_proficiencies) loop
    if length(trim(v_language)) not between 1 and 100 or v_level not in ('basic','conversational','fluent','native') or v_level is null
      or exists (select 1 from unnest(new.native_languages) l where lower(trim(l)) = lower(trim(v_language))) then
      raise exception 'Invalid language proficiency.' using errcode = '23514';
    end if;
  end loop;
  if new.partner_languages is null or cardinality(new.partner_languages) not between 1 and 20
    or cardinality(new.partner_languages) <> (select count(distinct lower(trim(l))) from unnest(new.partner_languages) l)
    or exists (select 1 from unnest(new.partner_languages) l where l is null or length(trim(l)) not between 1 and 100 or (not (l = any(new.native_languages)) and coalesce(new.other_language_proficiencies ->> l, '') not in ('fluent','native'))) then
    raise exception 'Session languages must be native or fluent.' using errcode = '23514';
  end if;
  if new.acquisition_source not in ('','friend_referral','instagram','facebook_group','university_community','international_student_community','job_board','reddit_discord','google_search','flyer_qr','other')
    or (new.acquisition_source = 'other' and length(trim(new.acquisition_source_other)) = 0) then
    raise exception 'Invalid acquisition source.' using errcode = '23514';
  end if;
  if new.intro_video_language is null or not (new.intro_video_language = any(new.partner_languages)) then
    raise exception 'Video language must be a selected session language.' using errcode = '23514';
  end if;
  select * into v_upload from public.partner_application_uploads where id = new.media_upload_id for update;
  if not found or v_upload.claimed_at is not null or v_upload.created_at < now() - interval '24 hours'
    or new.intro_video_path is distinct from v_upload.video_path then
    raise exception 'Invalid or expired media upload.' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'partner-application-videos' and name = v_upload.video_path) then
    raise exception 'Upload your files before submitting.' using errcode = '23514';
  end if;
  update public.partner_application_uploads set claimed_at = now() where id = v_upload.id;
  -- Keep the existing columns for older admin clients; preserve 077 triage logic.
  new.strongest_language := new.native_languages[1];
  select left(coalesce(string_agg(key || ' (' || value || ')', ', ' order by key), ''),300)
    into new.other_languages from pg_catalog.jsonb_each_text(new.other_language_proficiencies);
  return new;
end;
$$;
revoke all on function public.validate_partner_application_profile() from public, anon, authenticated;
create trigger partner_application_profile_validation before insert on public.partner_applications
  for each row execute function public.validate_partner_application_profile();

commit;
