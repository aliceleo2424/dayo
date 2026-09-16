-- Public landing CMS settings with admin-only writes.

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read"
  on public.site_settings for select
  using (true);

drop policy if exists "site_settings_admin_insert" on public.site_settings;
create policy "site_settings_admin_insert"
  on public.site_settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where (profiles.id = auth.uid() or profiles.user_id = auth.uid())
        and profiles.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "site_settings_admin_update" on public.site_settings;
create policy "site_settings_admin_update"
  on public.site_settings for update
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

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

insert into public.site_settings (key, value)
values (
  'hero_section',
  '{
    "title": "외국인과 이야기해보고 싶지만,\n어디서 어떻게 시작할지 몰랐다면",
    "subtitle": "관심사가 맞는 사람과 준비된 이야기로 가볍게 만나보세요.\n단어가 생각나지 않을 때에는 AI 매니저가 함께해요.",
    "primary_cta_text": "어떤 대화를 나누나요? 👉",
    "primary_cta_link": "#topics",
    "secondary_cta_text": "내 스피킹 감각 알아보기 >",
    "secondary_cta_link": "#quiz",
    "rolling_cards": [
      {
        "id": 1,
        "tag": "🌸 AI 코파일럿 실시간 지원 중",
        "partner_name": "Yui",
        "country": "Japan",
        "image_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=Yui",
        "speech_bubble": "こんにちは！今日もお疲れ様です✨"
      },
      {
        "id": 2,
        "tag": "☕ 따뜻한 일상 대화",
        "partner_name": "Camille",
        "country": "France",
        "image_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=Camille",
        "speech_bubble": "Salut ! On parle de quoi aujourd’hui ?"
      },
      {
        "id": 3,
        "tag": "🗽 실전 여행 영어",
        "partner_name": "Alex",
        "country": "USA",
        "image_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
        "speech_bubble": "Hey there! Ready to practice some real English?"
      }
    ]
  }'::jsonb
)
on conflict (key) do nothing;
