-- Standardized CMS keys consumed by admin/cms and the public landing page.

insert into public.site_settings (key, value)
values
  (
    'banner_popup',
    '{
      "enabled": false,
      "text": "",
      "link": "",
      "popup_enabled": false,
      "popup_title": "",
      "popup_content": "",
      "popup_image_url": ""
    }'::jsonb
  ),
  ('magazine_posts', '[]'::jsonb),
  ('real_reviews', '[]'::jsonb)
on conflict (key) do nothing;

do $$
begin
  if to_regclass('public.articles') is not null
    and coalesce((select value from public.site_settings where key = 'magazine_posts'), '[]'::jsonb) = '[]'::jsonb
  then
    update public.site_settings
    set value = coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'title', title,
        'category', coalesce(category, ''),
        'thumbnail_url', coalesce(thumbnail_url, ''),
        'summary', coalesce(summary, ''),
        'link', '',
        'is_active', coalesce(is_published, true)
      ) order by created_at desc)
      from public.articles
    ), '[]'::jsonb),
    updated_at = now()
    where key = 'magazine_posts';
  end if;

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
