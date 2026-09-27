-- Keep internal booking CS notes separate from profiles.admin_memo.
-- This migration does not copy or reinterpret existing profile-wide notes.
begin;

create table public.booking_cs_notes (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  note text not null default ''
    check (pg_catalog.char_length(note) <= 2000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.booking_cs_notes enable row level security;

-- No table policies: only the admin-checked SECURITY DEFINER functions below
-- may read or write these internal notes. service_role retains its bypass.
revoke all on table public.booking_cs_notes from public, anon, authenticated;

create function public.get_booking_cs_note(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_updated_at timestamptz;
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

  select note, updated_at into v_note, v_updated_at
    from public.booking_cs_notes
   where booking_id = p_booking_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'note', coalesce(v_note, ''),
    'updated_at', v_updated_at
  );
end;
$$;

create function public.set_booking_cs_note(
  p_booking_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_updated_at timestamptz;
begin
  if v_admin_id is null or not public.dayo_is_admin() then
    raise exception 'Admin access is required.' using errcode = '42501';
  end if;
  if p_booking_id is null then
    raise exception 'A booking is required.' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_note) > 2000 then
    raise exception 'CS note must be 2000 characters or fewer.' using errcode = '22023';
  end if;
  perform 1 from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  -- Empty notes remain as an explicit, auditable booking-scoped value.
  insert into public.booking_cs_notes (
    booking_id, note, updated_by
  ) values (
    p_booking_id, v_note, v_admin_id
  )
  on conflict (booking_id) do update
    set note = excluded.note,
        updated_at = pg_catalog.now(),
        updated_by = excluded.updated_by
  returning updated_at into v_updated_at;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'note', v_note,
    'updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.get_booking_cs_note(uuid)
  from public, anon, authenticated;
revoke all on function public.set_booking_cs_note(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_booking_cs_note(uuid)
  to authenticated;
grant execute on function public.set_booking_cs_note(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
