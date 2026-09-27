-- Keep a pending INSERT and its cutoff-failed confirmation from leaving an orphan.
-- Apply after 065. The existing confirmation and four-hour policies are unchanged.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.deduct_ticket_and_confirm_booking(uuid,uuid)') is null
     or pg_catalog.to_regprocedure('public.enforce_booking_four_hour_minimum()') is null then
    raise exception 'Apply 056 and 065 before pending booking cutoff cleanup.';
  end if;
end;
$$;

create function public.confirm_booking_with_cutoff_cleanup(
  p_learner_id uuid,
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_slot_time text;
  v_scheduled_at timestamptz;
begin
  if v_actor_id is null or p_learner_id is distinct from v_actor_id
     or p_booking_id is null then
    raise exception 'Learner booking access is required.' using errcode = '42501';
  end if;

  -- Serialize confirmation, retries and cleanup for this exact booking.
  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'booking_not_found',
      'message', '예약 정보를 찾을 수 없습니다.');
  end if;
  if v_booking.learner_id is distinct from v_actor_id then
    raise exception 'Learner booking access is required.' using errcode = '42501';
  end if;

  -- Check before the ticket lookup as well: a cutoff-crossed pending row
  -- must not linger merely because confirmation reports another failure first.
  if v_booking.status = 'pending' and not public.dayo_can_create_preopen_booking() then
    select pg_catalog.btrim(slot_time) into v_slot_time
      from public.availability_slots
     where id = v_booking.slot_id;
    if v_slot_time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
       and v_slot_time not like 'weekly:%' then
      begin
        if v_slot_time ~* '(Z|[+-][0-9]{2}(:[0-9]{2}|[0-9]{2})?)$' then
          v_scheduled_at := v_slot_time::timestamptz;
        else
          v_scheduled_at := v_slot_time::timestamp at time zone 'Asia/Seoul';
        end if;
      exception when others then
        v_scheduled_at := null;
      end;
    end if;
    if v_scheduled_at is not null
       and v_scheduled_at < pg_catalog.clock_timestamp() + interval '4 hours' then
      delete from public.bookings b
       where b.id = p_booking_id
         and b.learner_id = v_actor_id
         and b.status = 'pending'
         and b.ticket_deducted = false
         and b.ticket_refunded = false
         and b.partner_rewarded = false
         and not exists (
           select 1 from public.ticket_allocations a where a.booking_id = b.id
         );
      if not found then
        raise exception 'Cutoff cleanup found an inconsistent pending booking.'
          using errcode = '23514';
      end if;
      return pg_catalog.jsonb_build_object('success', false,
        'code', 'booking_window_closed',
        'message', '예약 가능 시간이 지났어요. 다른 시간을 선택해 주세요.');
    end if;
  end if;

  begin
    return public.deduct_ticket_and_confirm_booking(p_learner_id, p_booking_id);
  exception when check_violation then
    -- This handler's subtransaction rolls back lot, allocation and cache writes
    -- made by confirmation before the 065 trigger rejected its status update.
    if sqlerrm <> 'New bookings require at least four hours before the session.' then
      raise;
    end if;

    -- Never delete a confirmed booking, an allocation or another user's row.
    delete from public.bookings b
     where b.id = p_booking_id
       and b.learner_id = v_actor_id
       and b.status = 'pending'
       and b.ticket_deducted = false
       and b.ticket_refunded = false
       and b.partner_rewarded = false
       and not exists (
         select 1 from public.ticket_allocations a where a.booking_id = b.id
       );
    if not found then
      raise exception 'Cutoff cleanup found an inconsistent pending booking.'
        using errcode = '23514';
    end if;

    return pg_catalog.jsonb_build_object('success', false,
      'code', 'booking_window_closed',
      'message', '예약 가능 시간이 지났어요. 다른 시간을 선택해 주세요.');
  end;
end;
$$;

revoke all on function public.confirm_booking_with_cutoff_cleanup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_booking_with_cutoff_cleanup(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
