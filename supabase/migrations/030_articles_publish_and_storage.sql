-- Secure article publishing, legacy publication-field compatibility, and magazine uploads.

alter table public.articles
  add column if not exists published boolean;

update public.articles
set published = coalesce(is_published, true)
where published is null;

alter table public.articles
  alter column published set default true;

create or replace function public.sync_article_publish_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.is_published := coalesce(new.is_published, new.published, true);
    new.published := new.is_published;
  elsif new.is_published is distinct from old.is_published then
    new.published := new.is_published;
  elsif new.published is distinct from old.published then
    new.is_published := new.published;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_article_publish_state_trigger on public.articles;
create trigger sync_article_publish_state_trigger
before insert or update on public.articles
for each row execute function public.sync_article_publish_state();

alter table public.articles enable row level security;

drop policy if exists "articles_select_published" on public.articles;
drop policy if exists "articles_select_all_authenticated" on public.articles;
drop policy if exists "articles_write_anon" on public.articles;
drop policy if exists "articles_select_admin" on public.articles;
drop policy if exists "articles_insert_admin" on public.articles;
drop policy if exists "articles_update_admin" on public.articles;
drop policy if exists "articles_delete_admin" on public.articles;

create policy "articles_select_published"
  on public.articles for select
  using (coalesce(is_published, published, false) = true);

create policy "articles_select_admin"
  on public.articles for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

create policy "articles_insert_admin"
  on public.articles for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

create policy "articles_update_admin"
  on public.articles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

create policy "articles_delete_admin"
  on public.articles for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

grant select on public.articles to anon;
grant select, insert, update, delete on public.articles to authenticated;

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
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'articles'
  ) then
    alter publication supabase_realtime add table public.articles;
  end if;
end
$$;
