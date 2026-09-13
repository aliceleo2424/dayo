-- Published lounge articles shown on the logged-in home grid.
create table if not exists public.lounge_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  category text not null default '',
  summary text not null default '',
  read_time text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lounge_posts_published_created_at_idx
  on public.lounge_posts (is_published, created_at desc);

alter table public.lounge_posts enable row level security;

drop policy if exists "lounge_posts_select_published" on public.lounge_posts;
create policy "lounge_posts_select_published"
  on public.lounge_posts for select
  using (is_published = true);
