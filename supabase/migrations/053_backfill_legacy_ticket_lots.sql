-- Stage 2 only: shadow-copy current scalar balances into non-expiring legacy lots.
-- Existing ticket writers and profiles.ticket_count remain unchanged.
begin;

-- Block concurrent scalar balance writes and lot writes until the snapshot,
-- insert, and validation have all committed or rolled back together.
lock table public.profiles in share row exclusive mode;
lock table public.ticket_lots in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.profiles p where p.ticket_count < 0
  ) then
    raise exception 'Legacy ticket backfill: negative profile ticket_count exists.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.ticket_count > 0
      and not exists (select 1 from auth.users u where u.id = p.id)
  ) then
    raise exception 'Legacy ticket backfill: positive balance has no auth user.';
  end if;
end;
$$;

-- profiles.id is the canonical auth UID for this backfill. Its primary key
-- also guarantees one snapshot identity per profile.
-- No permanent snapshot table or guessed issue date.
create temporary table dayo_legacy_ticket_snapshot (
  user_id uuid primary key,
  ticket_count integer not null check (ticket_count > 0)
) on commit drop;

insert into pg_temp.dayo_legacy_ticket_snapshot (user_id, ticket_count)
select p.id, p.ticket_count
from public.profiles p
where p.ticket_count > 0;

-- A rerun is safe only when every pre-existing legacy lot already matches
-- the current scalar balance and the canonical source identity exactly.
do $$
begin
  if exists (
    select 1
    from public.ticket_lots l
    left join pg_temp.dayo_legacy_ticket_snapshot s on s.user_id = l.user_id
    where l.source = 'legacy_balance'
      and (
        s.user_id is null
        or l.source_id is distinct from l.user_id
        or l.quantity_issued is distinct from s.ticket_count
        or l.quantity_remaining is distinct from s.ticket_count
        or l.issued_at is not null
        or l.expires_at is not null
      )
  ) then
    raise exception 'Legacy ticket backfill: existing legacy lot differs from profile balance or identity.';
  end if;

  if exists (
    select 1
    from public.ticket_lots l
    where l.source = 'legacy_balance'
    group by l.user_id
    having count(*) > 1
  ) then
    raise exception 'Legacy ticket backfill: duplicate legacy lots for one user.';
  end if;
end;
$$;

insert into public.ticket_lots (
  user_id,
  source,
  source_id,
  quantity_issued,
  quantity_remaining,
  issued_at,
  expires_at
)
select
  s.user_id,
  'legacy_balance',
  s.user_id,
  s.ticket_count,
  s.ticket_count,
  null,
  null
from pg_temp.dayo_legacy_ticket_snapshot s
on conflict (user_id, source, source_id) do nothing;

-- Validate the complete legacy population, including zero-balance users
-- (who must have no legacy lot), before committing any inserted row.
do $$
begin
  if (select count(*) from public.profiles p where p.ticket_count > 0)
     <> (select count(*) from pg_temp.dayo_legacy_ticket_snapshot) then
    raise exception 'Legacy ticket backfill: profile snapshot count changed.';
  end if;

  if exists (
    select 1
    from pg_temp.dayo_legacy_ticket_snapshot s
    join public.profiles p on p.id = s.user_id
    where p.ticket_count is distinct from s.ticket_count
  ) then
    raise exception 'Legacy ticket backfill: profile balance changed during backfill.';
  end if;

  if (select count(*) from pg_temp.dayo_legacy_ticket_snapshot)
     <> (select count(*) from public.ticket_lots l where l.source = 'legacy_balance') then
    raise exception 'Legacy ticket backfill: positive-balance user and legacy lot counts differ.';
  end if;

  if exists (
    select 1
    from pg_temp.dayo_legacy_ticket_snapshot s
    left join public.ticket_lots l
      on l.user_id = s.user_id and l.source = 'legacy_balance'
    group by s.user_id, s.ticket_count
    having count(l.id) <> 1
      or bool_or(
        l.source_id is distinct from s.user_id
        or l.quantity_issued is distinct from s.ticket_count
        or l.quantity_remaining is distinct from s.ticket_count
        or l.issued_at is not null
        or l.expires_at is not null
      )
  ) then
    raise exception 'Legacy ticket backfill: per-user legacy lot does not match the snapshot.';
  end if;

  if exists (
    select 1
    from public.ticket_lots l
    left join pg_temp.dayo_legacy_ticket_snapshot s on s.user_id = l.user_id
    where l.source = 'legacy_balance' and s.user_id is null
  ) then
    raise exception 'Legacy ticket backfill: zero-balance or unknown user has a legacy lot.';
  end if;
end;
$$;

commit;
