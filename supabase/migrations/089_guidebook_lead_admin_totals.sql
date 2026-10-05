-- Guidebook administration: anonymous daily totals survive the existing 30-day cleanup.
-- Local only. Apply after 088; do not reapply 088 or backfill deleted email addresses.
begin;
create table public.guidebook_lead_expiry_totals (
  application_date date primary key,
  applications bigint not null check (applications >= 0),
  consented bigint not null check (consented between 0 and applications),
  unsent bigint not null check (unsent between 0 and applications),
  withdrawn bigint not null check (withdrawn between 0 and applications)
);
comment on table public.guidebook_lead_expiry_totals is
  'Daily counts only for expired speaking_sense_guidebook leads; no emails, IDs, tokens or individual timestamps. Counts are not an email/contact list.';
alter table public.guidebook_lead_expiry_totals enable row level security;
revoke all on public.guidebook_lead_expiry_totals from public, anon, authenticated;
grant select on public.guidebook_lead_expiry_totals to authenticated;
grant all on public.guidebook_lead_expiry_totals to service_role;
create policy guidebook_expiry_totals_admin_read on public.guidebook_lead_expiry_totals
  for select to authenticated using (public.dayo_is_admin());

-- Preserve the existing retention condition and cron schedule. Archive only rows
-- actually deleted by this call, in the same transaction. Concurrent/repeated runs
-- cannot double-count. Other lead sources and consenting leads remain untouched.
create or replace function public.purge_expired_guidebook_leads()
returns bigint language plpgsql set search_path=public as $$
declare deleted_count bigint;
begin
  with deleted as (
    delete from public.leads
    where source='speaking_sense_guidebook' and marketing_consent=false
      and coalesce(guidebook_sent_at, created_at) <= now() - interval '30 days'
    returning created_at, marketing_consented_at, guidebook_sent_at, marketing_withdrawn_at
  ), archived as (
    insert into public.guidebook_lead_expiry_totals(application_date, applications, consented, unsent, withdrawn)
    select (created_at at time zone 'Asia/Seoul')::date, count(*),
      count(*) filter (where marketing_consented_at is not null),
      count(*) filter (where guidebook_sent_at is null),
      count(*) filter (where marketing_withdrawn_at is not null)
    from deleted group by (created_at at time zone 'Asia/Seoul')::date
    on conflict (application_date) do update set
      applications=guidebook_lead_expiry_totals.applications+excluded.applications,
      consented=guidebook_lead_expiry_totals.consented+excluded.consented,
      unsent=guidebook_lead_expiry_totals.unsent+excluded.unsent,
      withdrawn=guidebook_lead_expiry_totals.withdrawn+excluded.withdrawn
    returning application_date
  ) select count(*) into deleted_count from deleted;
  return deleted_count;
end $$;
revoke all on function public.purge_expired_guidebook_leads() from public, anon, authenticated;
grant execute on function public.purge_expired_guidebook_leads() to service_role;

-- Summary = currently retained rows + daily totals of expired rows.
-- Consent count means a lead has an opt-in timestamp, including a later withdrawal.
-- It is not a campaign recipient count. No individual records are reconstructed.
create function public.admin_guidebook_lead_summary()
returns table(total bigint, consented bigint, unsent bigint, withdrawn bigint, archived bigint)
language plpgsql stable set search_path=public as $$
begin
  if not public.dayo_is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  return query
  with counts as (
    select count(*) as total,
      count(*) filter (where marketing_consented_at is not null) as consented,
      count(*) filter (where guidebook_sent_at is null) as unsent,
      count(*) filter (where marketing_withdrawn_at is not null) as withdrawn,
      0::bigint as archived
    from public.leads where source='speaking_sense_guidebook'
    union all
    select a.applications, a.consented, a.unsent, a.withdrawn, a.applications
    from public.guidebook_lead_expiry_totals a
  ) select coalesce(sum(c.total),0)::bigint, coalesce(sum(c.consented),0)::bigint,
      coalesce(sum(c.unsent),0)::bigint, coalesce(sum(c.withdrawn),0)::bigint,
      coalesce(sum(c.archived),0)::bigint from counts c;
end $$;
revoke all on function public.admin_guidebook_lead_summary() from public, anon, authenticated;
grant execute on function public.admin_guidebook_lead_summary() to authenticated;

-- Match the operator's conservative eligibility contract exactly. A previous
-- withdrawal is never silently cleared or treated as renewed marketing permission.
create or replace function public.guidebook_marketing_recipients()
returns table(email text, marketing_consented_at timestamptz, unsubscribe_url text)
language sql stable set search_path=public as $$
  select l.email, l.marketing_consented_at,
    'https://www.dayotalk.com/unsubscribe#token=' || l.marketing_unsubscribe_token
  from public.leads l
  where l.source='speaking_sense_guidebook' and l.marketing_consent=true
    and l.marketing_withdrawn_at is null
$$;
revoke all on function public.guidebook_marketing_recipients() from public, anon, authenticated;
grant execute on function public.guidebook_marketing_recipients() to service_role;
commit;
