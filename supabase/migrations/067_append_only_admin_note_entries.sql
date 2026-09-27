-- Append-only admin timelines. Preserve profiles.admin_memo and
-- booking_cs_notes.note as undated legacy snapshots; do not backfill them.
begin;

create table public.member_admin_note_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  note text not null check (
    pg_catalog.btrim(note) <> '' and pg_catalog.char_length(note) <= 2000
  ),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users(id) on delete set null
);

create index member_admin_note_entries_timeline_idx
  on public.member_admin_note_entries (profile_id, created_at desc, id desc);

create table public.booking_cs_note_entries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  note text not null check (
    pg_catalog.btrim(note) <> '' and pg_catalog.char_length(note) <= 2000
  ),
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users(id) on delete set null
);

create index booking_cs_note_entries_timeline_idx
  on public.booking_cs_note_entries (booking_id, created_at desc, id desc);

alter table public.member_admin_note_entries enable row level security;
alter table public.booking_cs_note_entries enable row level security;
-- No direct client policies or writes. Only the admin-checked RPCs below.
revoke all on table public.member_admin_note_entries from public, anon, authenticated;
revoke all on table public.booking_cs_note_entries from public, anon, authenticated;

create function public.list_member_admin_notes(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy text;
  v_entries jsonb;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_profile_id is null then
    raise exception 'A profile is required.' using errcode = '22023';
  end if;

  select admin_memo into v_legacy
    from public.profiles
   where id = p_profile_id;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', e.id, 'note', e.note, 'created_at', e.created_at
      ) order by e.created_at desc, e.id desc
    ), '[]'::jsonb
  ) into v_entries
    from public.member_admin_note_entries e
   where e.profile_id = p_profile_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'entries', v_entries,
    'legacy_note', nullif(pg_catalog.btrim(v_legacy), '')
  );
end;
$$;

create function public.add_member_admin_note(p_profile_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_entry public.member_admin_note_entries%rowtype;
begin
  if v_admin_id is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_profile_id is null then
    raise exception 'A profile is required.' using errcode = '22023';
  end if;
  if v_note = '' or pg_catalog.char_length(v_note) > 2000 then
    raise exception 'Note must contain 1 to 2000 characters.' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  insert into public.member_admin_note_entries (profile_id, note, created_by)
  values (p_profile_id, v_note, v_admin_id)
  returning * into v_entry;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'entry', pg_catalog.jsonb_build_object(
      'id', v_entry.id, 'note', v_entry.note, 'created_at', v_entry.created_at
    )
  );
end;
$$;

create function public.list_booking_cs_notes(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legacy text;
  v_entries jsonb;
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_booking_id is null then
    raise exception 'A booking is required.' using errcode = '22023';
  end if;
  perform 1 from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  select note into v_legacy
    from public.booking_cs_notes
   where booking_id = p_booking_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', e.id, 'note', e.note, 'created_at', e.created_at
      ) order by e.created_at desc, e.id desc
    ), '[]'::jsonb
  ) into v_entries
    from public.booking_cs_note_entries e
   where e.booking_id = p_booking_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'entries', v_entries,
    'legacy_note', nullif(pg_catalog.btrim(v_legacy), '')
  );
end;
$$;

create function public.add_booking_cs_note(p_booking_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_entry public.booking_cs_note_entries%rowtype;
begin
  if v_admin_id is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_booking_id is null then
    raise exception 'A booking is required.' using errcode = '22023';
  end if;
  if v_note = '' or pg_catalog.char_length(v_note) > 2000 then
    raise exception 'Note must contain 1 to 2000 characters.' using errcode = '22023';
  end if;
  perform 1 from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  insert into public.booking_cs_note_entries (booking_id, note, created_by)
  values (p_booking_id, v_note, v_admin_id)
  returning * into v_entry;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'entry', pg_catalog.jsonb_build_object(
      'id', v_entry.id, 'note', v_entry.note, 'created_at', v_entry.created_at
    )
  );
end;
$$;

revoke all on function public.list_member_admin_notes(uuid) from public, anon, authenticated;
revoke all on function public.add_member_admin_note(uuid, text) from public, anon, authenticated;
revoke all on function public.list_booking_cs_notes(uuid) from public, anon, authenticated;
revoke all on function public.add_booking_cs_note(uuid, text) from public, anon, authenticated;

grant execute on function public.list_member_admin_notes(uuid) to authenticated;
grant execute on function public.add_member_admin_note(uuid, text) to authenticated;
grant execute on function public.list_booking_cs_notes(uuid) to authenticated;
grant execute on function public.add_booking_cs_note(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
