-- Public CMS images: anyone may read, only admins may upload or manage files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cms',
  'cms',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cms_assets_public_read" on storage.objects;
create policy "cms_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'cms');

drop policy if exists "cms_assets_admin_insert" on storage.objects;
create policy "cms_assets_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cms'
    and (storage.foldername(name))[1] = 'hero-cards'
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "cms_assets_admin_update" on storage.objects;
create policy "cms_assets_admin_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'cms'
    and (storage.foldername(name))[1] = 'hero-cards'
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'cms'
    and (storage.foldername(name))[1] = 'hero-cards'
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "cms_assets_admin_delete" on storage.objects;
create policy "cms_assets_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cms'
    and (storage.foldername(name))[1] = 'hero-cards'
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

-- Remove only the original all-Dicebear seed set from already migrated projects.
update public.site_settings
set value = jsonb_set(value, '{rolling_cards}', '[]'::jsonb, true),
    updated_at = now()
where key = 'hero_section'
  and jsonb_typeof(value -> 'rolling_cards') = 'array'
  and coalesce((
    select bool_and(lower(coalesce(card ->> 'image_url', '')) like 'https://api.dicebear.com/%')
    from jsonb_array_elements(value -> 'rolling_cards') as card
  ), false);
