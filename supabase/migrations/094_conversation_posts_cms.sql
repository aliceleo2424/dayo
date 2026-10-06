-- Conversation posts reuse articles. Applied independently after live preflight, 2026-10-06.
begin;
alter table public.articles
 add column slug text,
 add column post_type text not null default 'conversation_starter',
 add column author_type text not null default 'editor',
 add column author_display_name text not null default 'DayO',
 add column partner_id uuid references public.profiles(id) on delete set null,
 add column country text,
 add column language text,
 add column interests text[] not null default '{}',
 add column purposes text[] not null default '{}',
 add column published_at timestamptz,
 add column featured boolean not null default false,
 add column sort_order integer not null default 0,
 add column updated_at timestamptz;
-- Reuse title/summary/content/thumbnail_url/is_published; no duplicate status/body fields.
alter table public.articles alter column is_published set default false;
alter table public.articles alter column published set default false;
alter table public.articles add constraint articles_post_metadata_check check (
 (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
 and post_type in ('partner_story','culture_note','conversation_starter')
 and author_type in ('editor','partner')
 and (language is null or language in ('en','es','fr','ko'))
 and cardinality(interests)<=4 and array_position(interests,null) is null
 and interests <@ array['drama','movies','youtube','music','travel','food_cafe','exercise','games','fashion_beauty','pets','books_webtoon','work_school']::text[]
 and cardinality(purposes)<=4 and array_position(purposes,null) is null
 and purposes <@ array['travel','work_school','abroad','casual']::text[]
);
create unique index articles_slug_unique on public.articles(slug) where slug is not null;
create function public.prepare_conversation_post()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if cardinality(new.interests)<>(select count(distinct x) from unnest(new.interests) x)
 or cardinality(new.purposes)<>(select count(distinct x) from unnest(new.purposes) x) then
  raise exception 'Duplicate topic keys' using errcode='22023';
 end if;
 if new.partner_id is not null and not exists(select 1 from public.profiles where id=new.partner_id and role='partner') then
  raise exception 'Partner reference required' using errcode='22023';
 end if;
 new.is_published:=coalesce(new.is_published,false);
 new.published:=new.is_published;
 new.updated_at:=clock_timestamp();
 if new.is_published and new.published_at is null then new.published_at:=clock_timestamp(); end if;
 return new;
end $$;
revoke all on function public.prepare_conversation_post() from public,anon,authenticated;
create trigger prepare_conversation_post before insert or update on public.articles
for each row execute function public.prepare_conversation_post();
alter table public.articles enable row level security;
-- Remove only the audited CMS policies; do not touch profile/storage/booking policies.
drop policy if exists "Anyone can read published articles" on public.articles;
drop policy if exists "Authenticated users can insert articles" on public.articles;
drop policy if exists "Authenticated users can delete articles" on public.articles;
drop policy if exists "Allow public read articles" on public.articles;
drop policy if exists "Allow authenticated insert articles" on public.articles;
drop policy if exists "Allow authenticated update articles" on public.articles;
drop policy if exists "Allow authenticated delete articles" on public.articles;
-- Also cover the named 030 policies when deployed to a compatible environment.
drop policy if exists articles_select_published on public.articles;
drop policy if exists articles_select_all_authenticated on public.articles;
drop policy if exists articles_write_anon on public.articles;
drop policy if exists articles_select_admin on public.articles;
drop policy if exists articles_insert_admin on public.articles;
drop policy if exists articles_update_admin on public.articles;
drop policy if exists articles_delete_admin on public.articles;
do $$ begin
 if exists(select 1 from pg_catalog.pg_policy where polrelid='public.articles'::regclass) then
  raise exception 'Unexpected articles policy: repeat read-only preflight before applying';
 end if;
end $$;
create policy conversation_posts_public_read on public.articles for select to anon,authenticated using(is_published is true);
create policy conversation_posts_admin_read on public.articles for select to authenticated using(public.dayo_is_admin());
create policy conversation_posts_admin_insert on public.articles for insert to authenticated with check(public.dayo_is_admin());
create policy conversation_posts_admin_update on public.articles for update to authenticated using(public.dayo_is_admin()) with check(public.dayo_is_admin());
create policy conversation_posts_admin_delete on public.articles for delete to authenticated using(public.dayo_is_admin());
revoke all on public.articles from public,anon,authenticated;
grant select on public.articles to anon,authenticated;
grant insert,update,delete on public.articles to authenticated;
-- Invoker functions: published-only, explicit public columns, no profile join/private fields.
create function public.list_published_conversation_posts(p_limit integer default 4)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'excerpt',a.summary,
 'cover_image',a.thumbnail_url,'post_type',a.post_type,'author_type',a.author_type,
 'author_display_name',a.author_display_name,'partner_id',a.partner_id,'country',a.country,
 'language',a.language,'interests',a.interests,'purposes',a.purposes,
 'published_at',coalesce(a.published_at,a.created_at),'featured',a.featured,'sort_order',a.sort_order)
 from public.articles a where a.is_published is true
 order by a.featured desc,a.sort_order,coalesce(a.published_at,a.created_at) desc nulls last,a.id
 limit least(greatest(coalesce(p_limit,4),1),24)
$$;
create function public.get_published_conversation_post(p_key text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'excerpt',a.summary,'body',a.content,
 'cover_image',a.thumbnail_url,'post_type',a.post_type,'author_type',a.author_type,
 'author_display_name',a.author_display_name,'partner_id',a.partner_id,'country',a.country,
 'language',a.language,'interests',a.interests,'purposes',a.purposes,
 'published_at',coalesce(a.published_at,a.created_at),'featured',a.featured,'sort_order',a.sort_order)
 from public.articles a where a.is_published is true and (a.id::text=p_key or a.slug=p_key) limit 1
$$;
revoke all on function public.list_published_conversation_posts(integer),public.get_published_conversation_post(text) from public;
grant execute on function public.list_published_conversation_posts(integer),public.get_published_conversation_post(text) to anon,authenticated;
-- Existing public-assets bucket/upload path is reused. Restrictive fences prevent
-- broad existing storage policies from allowing non-admin CMS image changes.
-- Other buckets and public-assets paths keep their existing contracts.
create policy conversation_posts_media_insert_admin on storage.objects as restrictive
for insert to authenticated with check (
 bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine' or public.dayo_is_admin()
);
create policy conversation_posts_media_update_admin on storage.objects as restrictive
for update to authenticated using (
 bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine' or public.dayo_is_admin()
) with check (
 bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine' or public.dayo_is_admin()
);
create policy conversation_posts_media_delete_admin on storage.objects as restrictive
for delete to authenticated using (
 bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine' or public.dayo_is_admin()
);
-- anon cannot execute dayo_is_admin in the live contract. Do not widen that ACL.
create policy conversation_posts_media_insert_anon on storage.objects as restrictive
for insert to anon with check (bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine');
create policy conversation_posts_media_update_anon on storage.objects as restrictive
for update to anon using (bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine')
with check (bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine');
create policy conversation_posts_media_delete_anon on storage.objects as restrictive
for delete to anon using (bucket_id <> 'public-assets' or split_part(name,'/',1) <> 'magazine');
commit;
