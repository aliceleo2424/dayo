-- Hide individual admin note entries without erasing their audit history.
-- Legacy profiles.admin_memo and booking_cs_notes.note are not changed.
begin;

alter table public.member_admin_note_entries
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;

alter table public.booking_cs_note_entries
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;

create or replace function public.list_member_admin_notes(p_profile_id uuid)
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
   where e.profile_id = p_profile_id
     and e.deleted_at is null;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'entries', v_entries,
    'legacy_note', nullif(pg_catalog.btrim(v_legacy), '')
  );
end;
$$;

create or replace function public.list_booking_cs_notes(p_booking_id uuid)
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
   where e.booking_id = p_booking_id
     and e.deleted_at is null;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'entries', v_entries,
    'legacy_note', nullif(pg_catalog.btrim(v_legacy), '')
  );
end;
$$;

create function public.delete_member_admin_note(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_admin_id is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_entry_id is null then
    raise exception 'A note entry is required.' using errcode = '22023';
  end if;

  select deleted_at into v_deleted_at
    from public.member_admin_note_entries
   where id = p_entry_id
   for update;
  if not found then
    raise exception 'Note entry not found.' using errcode = 'P0002';
  end if;
  if v_deleted_at is null then
    update public.member_admin_note_entries
       set deleted_at = pg_catalog.now(), deleted_by = v_admin_id
     where id = p_entry_id;
  end if;

  return pg_catalog.jsonb_build_object('success', true);
end;
$$;

create function public.delete_booking_cs_note(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_admin_id is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_entry_id is null then
    raise exception 'A note entry is required.' using errcode = '22023';
  end if;

  select deleted_at into v_deleted_at
    from public.booking_cs_note_entries
   where id = p_entry_id
   for update;
  if not found then
    raise exception 'Note entry not found.' using errcode = 'P0002';
  end if;
  if v_deleted_at is null then
    update public.booking_cs_note_entries
       set deleted_at = pg_catalog.now(), deleted_by = v_admin_id
     where id = p_entry_id;
  end if;

  return pg_catalog.jsonb_build_object('success', true);
end;
$$;

revoke all on function public.list_member_admin_notes(uuid) from public, anon, authenticated;
revoke all on function public.list_booking_cs_notes(uuid) from public, anon, authenticated;
revoke all on function public.delete_member_admin_note(uuid) from public, anon, authenticated;
revoke all on function public.delete_booking_cs_note(uuid) from public, anon, authenticated;

grant execute on function public.list_member_admin_notes(uuid) to authenticated;
grant execute on function public.list_booking_cs_notes(uuid) to authenticated;
grant execute on function public.delete_member_admin_note(uuid) to authenticated;
grant execute on function public.delete_booking_cs_note(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
