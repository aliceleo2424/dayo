-- Minimal, booking-scoped telemetry for alpha session reconstruction.
-- bookings.id remains the canonical session identifier.

begin;

create table public.session_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  event_type text not null,
  actor_user_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint session_events_event_type_check check (
    event_type in (
      'room_entered',
      'media_connected',
      'talk_card_shown',
      'word_help_clicked',
      'session_ended'
    )
  ),
  constraint session_events_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  )
);

create index session_events_booking_created_idx
  on public.session_events (booking_id, created_at);

create index session_events_booking_type_created_idx
  on public.session_events (booking_id, event_type, created_at);

create index session_events_created_at_idx
  on public.session_events (created_at);

alter table public.session_events enable row level security;

revoke all privileges on table public.session_events
  from public, anon, authenticated;

grant select on table public.session_events
  to authenticated;

grant all privileges on table public.session_events
  to service_role;

create policy "session_events_select_admin"
  on public.session_events
  for select
  to authenticated
  using (public.dayo_is_admin());

create or replace function public.log_session_event(
  p_event_id uuid,
  p_booking_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_learner_id uuid;
  v_partner_user_id uuid;
  v_booking_status text;
  v_role text;
  v_event_type text := btrim(coalesce(p_event_type, ''));
  v_input jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload jsonb := '{}'::jsonb;
  v_card_id text;
  v_category text;
  v_source text;
  v_reason text;
  v_items jsonb := '[]'::jsonb;
  v_inserted integer := 0;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'code', 'unauthorized');
  end if;

  if public.dayo_is_admin() then
    return jsonb_build_object('success', false, 'code', 'admin_preview_not_loggable');
  end if;

  if p_event_id is null or p_booking_id is null then
    return jsonb_build_object('success', false, 'code', 'invalid_event_identity');
  end if;

  if v_event_type not in (
    'room_entered',
    'media_connected',
    'talk_card_shown',
    'word_help_clicked',
    'session_ended'
  ) then
    return jsonb_build_object('success', false, 'code', 'invalid_event_type');
  end if;

  if jsonb_typeof(v_input) <> 'object' then
    return jsonb_build_object('success', false, 'code', 'invalid_payload');
  end if;

  if octet_length(v_input::text) > 4096 then
    return jsonb_build_object('success', false, 'code', 'payload_too_large');
  end if;

  select learner_id, partner_user_id, status
    into v_learner_id, v_partner_user_id, v_booking_status
    from public.bookings
   where id = p_booking_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'booking_not_found');
  end if;

  if v_actor_id = v_learner_id then
    v_role := 'learner';
  elsif v_actor_id = v_partner_user_id then
    v_role := 'partner';
  else
    return jsonb_build_object('success', false, 'code', 'not_booking_participant');
  end if;

  if v_event_type = 'session_ended' then
    if v_booking_status not in ('confirmed', 'completed', 'tech_issue') then
      return jsonb_build_object('success', false, 'code', 'booking_status_not_loggable');
    end if;
  elsif v_booking_status <> 'confirmed' then
    return jsonb_build_object('success', false, 'code', 'booking_status_not_loggable');
  end if;

  if v_event_type in ('room_entered', 'media_connected') then
    v_payload := jsonb_build_object('role', v_role);

  elsif v_event_type = 'talk_card_shown' then
    if v_role <> 'partner' then
      return jsonb_build_object('success', false, 'code', 'partner_event_only');
    end if;

    v_card_id := left(btrim(coalesce(v_input ->> 'card_id', '')), 120);
    v_category := left(btrim(coalesce(v_input ->> 'category', '')), 80);
    if v_card_id = '' or v_category = '' then
      return jsonb_build_object('success', false, 'code', 'invalid_talk_card_payload');
    end if;
    v_payload := jsonb_build_object(
      'card_id', v_card_id,
      'category', v_category
    );

  elsif v_event_type = 'word_help_clicked' then
    v_source := btrim(coalesce(v_input ->> 'source', ''));
    if v_source not in ('ai', 'fallback') then
      return jsonb_build_object('success', false, 'code', 'invalid_word_help_source');
    end if;
    if jsonb_typeof(v_input -> 'items') <> 'array' then
      return jsonb_build_object('success', false, 'code', 'invalid_word_help_items');
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'text', left(btrim(coalesce(item.value ->> 'text', '')), 160),
          'ko', left(btrim(coalesce(item.value ->> 'ko', '')), 160)
        )
        order by item.ordinality
      ),
      '[]'::jsonb
    )
      into v_items
      from (
        select value, ordinality
          from jsonb_array_elements(v_input -> 'items') with ordinality
         where jsonb_typeof(value) = 'object'
           and btrim(coalesce(value ->> 'text', '')) <> ''
           and btrim(coalesce(value ->> 'ko', '')) <> ''
         order by ordinality
         limit 6
      ) as item;

    if jsonb_array_length(v_items) = 0 then
      return jsonb_build_object('success', false, 'code', 'empty_word_help_items');
    end if;
    v_payload := jsonb_build_object(
      'source', v_source,
      'items', v_items
    );

  elsif v_event_type = 'session_ended' then
    v_reason := btrim(coalesce(v_input ->> 'reason', ''));
    if v_reason not in ('normal', 'personal', 'tech_issue') then
      return jsonb_build_object('success', false, 'code', 'invalid_end_reason');
    end if;
    v_payload := jsonb_build_object(
      'role', v_role,
      'reason', v_reason
    );
  end if;

  insert into public.session_events (
    id,
    booking_id,
    event_type,
    actor_user_id,
    payload
  ) values (
    p_event_id,
    p_booking_id,
    v_event_type,
    v_actor_id,
    v_payload
  )
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'inserted', v_inserted = 1
  );
end;
$$;

revoke all on function public.log_session_event(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.log_session_event(uuid, uuid, text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
