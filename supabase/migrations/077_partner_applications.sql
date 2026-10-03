begin;

create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  email text not null check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  contact_method text not null check (length(trim(contact_method)) between 1 and 300),
  nationality text not null check (length(trim(nationality)) between 1 and 100),
  current_city text not null check (length(trim(current_city)) between 1 and 100),
  university text not null default '' check (length(university) <= 200),
  visa_type text not null check (visa_type in ('D-2','D-4','F-series','Other')),
  strongest_language text not null check (length(trim(strongest_language)) between 1 and 100),
  other_languages text not null default '' check (length(other_languages) <= 300),
  partner_languages text[] not null check (cardinality(partner_languages) between 1 and 10 and length(array_to_string(partner_languages, ',')) <= 300),
  korean_level text not null check (korean_level in ('none','basic','conversational','advanced')),
  stranger_conversation_comfort text not null check (stranger_conversation_comfort in ('very_comfortable','comfortable','slightly_nervous','uncomfortable')),
  availability_periods text[] not null check (cardinality(availability_periods) between 1 and 6 and availability_periods <@ array['weekday_morning','weekday_afternoon','weekday_evening','weekend_morning','weekend_afternoon','weekend_evening']::text[]),
  weekly_session_capacity text not null check (weekly_session_capacity in ('1-2','3-5','6-10','10+')),
  device text not null check (device in ('laptop_pc','tablet','smartphone')),
  video_environment text not null check (video_environment in ('yes','mostly','no')),
  scenario_answer text not null check (length(trim(scenario_answer)) between 1 and 3000),
  motivation text not null check (length(trim(motivation)) between 1 and 3000),
  acquisition_source text not null default '' check (length(acquisition_source) <= 200),
  referral_code text not null default '' check (length(referral_code) <= 100),
  privacy_consent boolean not null check (privacy_consent),
  review_score integer not null default 0 check (review_score between 0 and 7),
  review_status text not null default 'review' check (review_status in ('ready','review','hold')),
  review_note text not null default '' check (length(review_note) <= 5000),
  reviewed_at timestamptz,
  test_status text not null default 'not_invited' check (test_status in ('not_invited','invited','scheduled','completed')),
  final_status text not null default 'pending' check (final_status in ('pending','approved','rejected','hold'))
);
create unique index partner_applications_email_unique
on public.partner_applications (lower(trim(email)))
where final_status <> 'rejected';

-- All triage rules live here. Visa type never contributes to rejection or score.
create function public.triage_partner_application() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  new.created_at := now();
  new.submitted_at := now();
  new.review_score :=
    case when new.video_environment = 'yes' then 2 else 0 end +
    case when new.stranger_conversation_comfort in ('very_comfortable','comfortable') then 2 else 0 end +
    case when new.weekly_session_capacity in ('3-5','6-10','10+') then 2 else 0 end +
    case when length(trim(new.scenario_answer)) >= 80 then 1 else 0 end;
  new.review_status := case when new.review_score >= 6 then 'ready' when new.review_score >= 3 then 'review' else 'hold' end;
  new.review_note := '';
  new.reviewed_at := null;
  new.test_status := 'not_invited';
  new.final_status := 'pending';
  return new;
end;
$$;
create trigger partner_application_triage before insert on public.partner_applications
for each row execute function public.triage_partner_application();
revoke all on function public.triage_partner_application() from public, anon, authenticated;

alter table public.partner_applications enable row level security;
revoke all on public.partner_applications from public, anon, authenticated;
grant insert (full_name,email,contact_method,nationality,current_city,university,visa_type,strongest_language,other_languages,partner_languages,korean_level,stranger_conversation_comfort,availability_periods,weekly_session_capacity,device,video_environment,scenario_answer,motivation,acquisition_source,referral_code,privacy_consent)
on public.partner_applications to anon, authenticated;
grant select on public.partner_applications to authenticated;
grant update (review_status,review_note,reviewed_at,test_status,final_status) on public.partner_applications to authenticated;
create policy partner_application_submit on public.partner_applications for insert to anon, authenticated with check (privacy_consent = true);
create policy partner_application_admin_read on public.partner_applications for select to authenticated using (public.dayo_is_admin());
create policy partner_application_admin_review on public.partner_applications for update to authenticated using (public.dayo_is_admin()) with check (public.dayo_is_admin());

commit;
