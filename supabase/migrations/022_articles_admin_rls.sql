-- Finalize lounge magazine CMS: ensure articles exists and anon admin can INSERT/UPDATE/DELETE.
-- Run this in the Supabase SQL editor if 018 was skipped or publish still fails RLS.

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text default '꿀팁',
  summary text,
  content text not null,
  thumbnail_url text,
  is_published boolean default true,
  created_at timestamptz default now()
);

create index if not exists articles_published_created_at_idx
  on public.articles (is_published, created_at desc);

alter table public.articles enable row level security;

drop policy if exists "articles_select_published" on public.articles;
drop policy if exists "articles_select_all_authenticated" on public.articles;
drop policy if exists "articles_write_anon" on public.articles;
drop policy if exists "articles_select_admin" on public.articles;
drop policy if exists "articles_insert_admin" on public.articles;
drop policy if exists "articles_update_admin" on public.articles;
drop policy if exists "articles_delete_admin" on public.articles;

-- Lounge (and admin list): published rows are visible to everyone.
create policy "articles_select_published"
  on public.articles for select
  using (is_published = true);

-- Admin CMS uses the anon key without login, so drafts must also be readable.
create policy "articles_select_admin"
  on public.articles for select
  using (true);

create policy "articles_insert_admin"
  on public.articles for insert
  with check (true);

create policy "articles_update_admin"
  on public.articles for update
  using (true)
  with check (true);

create policy "articles_delete_admin"
  on public.articles for delete
  using (true);

grant select, insert, update, delete on public.articles to anon, authenticated;
grant usage on schema public to anon, authenticated;
