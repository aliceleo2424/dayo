-- Idempotent production hotfix for hero CMS saves, uploads, and realtime refresh.

alter table public.site_settings
  add column if not exists updated_at timestamptz not null default now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-assets',
  'public-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public_assets_read" on storage.objects;
create policy "public_assets_read"
  on storage.objects for select
  using (bucket_id = 'public-assets');

drop policy if exists "public_assets_admin_insert" on storage.objects;
create policy "public_assets_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] in ('hero-cards', 'magazine')
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "public_assets_admin_update" on storage.objects;
create policy "public_assets_admin_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] in ('hero-cards', 'magazine')
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] in ('hero-cards', 'magazine')
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "public_assets_admin_delete" on storage.objects;
create policy "public_assets_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] in ('hero-cards', 'magazine')
    and exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'site_settings'
  ) then
    alter publication supabase_realtime add table public.site_settings;
  end if;
end
$$;
