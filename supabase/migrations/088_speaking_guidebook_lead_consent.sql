-- Guidebook delivery and optional marketing consent. Apply separately, not yet production.
begin;
alter table public.leads
  add column if not exists source text,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consented_at timestamptz,
  add column if not exists marketing_withdrawn_at timestamptz,
  add column if not exists guidebook_sent_at timestamptz,
  add column if not exists marketing_unsubscribe_token uuid not null default gen_random_uuid();
create unique index leads_guidebook_unsubscribe_token_unique on public.leads(marketing_unsubscribe_token)
  where source='speaking_sense_guidebook';
alter table public.leads add constraint leads_marketing_consent_timestamp_check
  check (not marketing_consent or (marketing_consented_at is not null
    and (marketing_withdrawn_at is null or marketing_consented_at > marketing_withdrawn_at)));
-- Remove browser access inherited from table or column grants. Preserve existing data.
revoke all on public.leads from anon, authenticated;
do $$
declare columns_sql text;
begin
  select string_agg(quote_ident(column_name), ', ') into columns_sql
  from information_schema.columns where table_schema='public' and table_name='leads';
  execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.leads from anon, authenticated', columns_sql);
end $$;
grant insert (id, email, language, level, score) on public.leads to anon, authenticated;
grant select on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
-- Existing SELECT/ALL policies could expose emails or allow duplicate-status probing.
-- Replace policies, without changing any stored leads. Browser insert needs no read.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='leads'
  loop execute format('drop policy %I on public.leads', p.policyname); end loop;
end $$;
create policy leads_public_submit on public.leads for insert to anon, authenticated
  with check (source is null and marketing_consent=false and marketing_consented_at is null
    and marketing_withdrawn_at is null and guidebook_sent_at is null);
create policy leads_admin_read on public.leads for select to authenticated
  using (public.dayo_is_admin());
-- Server-only campaign source. No implicit opt-in for legacy/unknown records.
create function public.guidebook_marketing_recipients()
returns table (email text, marketing_consented_at timestamptz, unsubscribe_url text)
language sql stable set search_path=public as $$
  select l.email, l.marketing_consented_at, 'https://www.dayotalk.com/unsubscribe#token=' || l.marketing_unsubscribe_token from public.leads l
  where l.source='speaking_sense_guidebook' and l.marketing_consent=true
    and l.marketing_consented_at is not null
    and (l.marketing_withdrawn_at is null or l.marketing_consented_at > l.marketing_withdrawn_at)
$$;
-- Call only after the operator verifies the withdrawal request. Never expose an email lookup API.
create function public.withdraw_guidebook_marketing(p_email text)
returns void language sql set search_path=public as $$
  update public.leads set marketing_consent=false,
    marketing_withdrawn_at=now()
  where source='speaking_sense_guidebook' and lower(trim(email))=lower(trim(p_email))
    and marketing_consent=true
$$;
-- Opaque bearer token; server API only. No email address in the public link.
create function public.unsubscribe_guidebook_marketing(p_token uuid)
returns void language sql set search_path=public as $$
  update public.leads set marketing_consent=false, marketing_withdrawn_at=now()
  where source='speaking_sense_guidebook' and marketing_unsubscribe_token=p_token
    and marketing_consent=true
$$;
revoke all on function public.unsubscribe_guidebook_marketing(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_guidebook_marketing(uuid) to service_role;
-- Failed-delivery requests expire from created_at; sent requests from first accepted send.
create function public.purge_expired_guidebook_leads()
returns bigint language plpgsql set search_path=public as $$
declare deleted_count bigint;
begin
  delete from public.leads where source='speaking_sense_guidebook' and marketing_consent=false
    and coalesce(guidebook_sent_at, created_at) <= now() - interval '30 days';
  get diagnostics deleted_count=row_count;
  return deleted_count;
end $$;
revoke all on function public.guidebook_marketing_recipients(),
  public.withdraw_guidebook_marketing(text), public.purge_expired_guidebook_leads()
  from public, anon, authenticated;
grant execute on function public.guidebook_marketing_recipients(),
  public.withdraw_guidebook_marketing(text), public.purge_expired_guidebook_leads() to service_role;
comment on column public.leads.guidebook_sent_at is 'First provider-accepted guidebook send. No-consent leads expire after 30 days; idempotent retries do not extend retention.';
comment on column public.leads.marketing_consented_at is 'Current opt-in period start, preserved on repeated requests; supports biennial consent reminders.';
comment on column public.leads.marketing_withdrawn_at is 'Last verified withdrawal. Unchecked guidebook requests are not withdrawal requests.';
-- pg_cron was verified in production preflight; schedule runs daily 03:15 KST.
-- Only this named job is created/updated. The function never touches other sources.
select cron.schedule('dayo-guidebook-leads-cleanup', '15 18 * * *',
  'select public.purge_expired_guidebook_leads();');
comment on column public.leads.marketing_unsubscribe_token is 'Server-only opaque capability. Never expose via lead SELECT or email query parameters.';
commit;


