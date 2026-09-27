-- Explicit admin-only clearing of the two legacy overwrite snapshots.
-- Keep the booking CS row and all append-only entries; never clear notes automatically.
begin;

create function public.clear_legacy_member_admin_memo(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_profile_id is null then
    raise exception 'A profile is required.' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  update public.profiles
     set admin_memo = null
   where id = p_profile_id and admin_memo is not null;

  return pg_catalog.jsonb_build_object('success', true);
end;
$$;

create function public.clear_legacy_booking_cs_note(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- note is NOT NULL in 064; its existing writer uses '' for an empty note.
  -- Preserve the row, PK/FK, and its metadata rather than deleting it.
  update public.booking_cs_notes
     set note = ''
   where booking_id = p_booking_id and note <> '';

  return pg_catalog.jsonb_build_object('success', true);
end;
$$;

revoke all on function public.clear_legacy_member_admin_memo(uuid)
  from public, anon, authenticated;
revoke all on function public.clear_legacy_booking_cs_note(uuid)
  from public, anon, authenticated;

grant execute on function public.clear_legacy_member_admin_memo(uuid)
  to authenticated;
grant execute on function public.clear_legacy_booking_cs_note(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
