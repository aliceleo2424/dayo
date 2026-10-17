-- Applied to production 2026-10-17 as Supabase migration "082_learner_story_scenes" (version 20261017101324).
-- Learner story scenes ("책장") for the post-session story game.
--
-- One scene per booking (first completed scene is kept). Browser reads are
-- owner/admin only; writes go through RPCs that verify the caller is the
-- booking's learner. Expressions woven into a scene must appear in the same
-- booking's canonical learner transcript (session_logs), so partner speech
-- or invented text is never stored as the learner's own. Rows are hidden
-- (soft delete), never hard-deleted by the learner.

begin;

create table if not exists public.learner_story_scenes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null,
  template_version integer not null,
  language text not null,
  trigger text not null,
  scene_snapshot jsonb not null,
  used_expressions jsonb not null default '[]'::jsonb,
  my_line text,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_story_scenes_booking_learner_unique unique (booking_id, learner_id),
  constraint learner_story_scenes_template_id_check
    check (template_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  constraint learner_story_scenes_template_version_check
    check (template_version between 1 and 1000),
  constraint learner_story_scenes_language_check
    check (language in ('en')),
  constraint learner_story_scenes_trigger_check
    check (trigger in ('bonus', 'insufficient')),
  constraint learner_story_scenes_snapshot_check
    check (jsonb_typeof(scene_snapshot) = 'object'),
  constraint learner_story_scenes_expressions_check
    check (jsonb_typeof(used_expressions) = 'array'),
  constraint learner_story_scenes_my_line_check
    check (my_line is null or char_length(my_line) between 1 and 200)
);

create index if not exists learner_story_scenes_learner_created_idx
  on public.learner_story_scenes (learner_id, created_at desc);

create or replace function public.save_story_scene(
  p_booking_id uuid,
  p_template_id text,
  p_template_version integer,
  p_language text,
  p_trigger text,
  p_scene_snapshot jsonb,
  p_used_expressions jsonb,
  p_my_line text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_learner_id uuid;
  v_scheduled_at timestamptz;
  v_transcript jsonb;
  v_expressions jsonb := '[]'::pg_catalog.jsonb;
  v_item jsonb;
  v_text text;
  v_needle text;
  v_found boolean;
  v_my_line text;
  v_scene public.learner_story_scenes%rowtype;
begin
  if v_actor_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'auth_required');
  end if;
  if p_booking_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_booking_id');
  end if;

  select bookings.learner_id, bookings.scheduled_at
    into v_learner_id, v_scheduled_at
    from public.bookings
   where bookings.id = p_booking_id;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'booking_not_found');
  end if;
  if v_learner_id is null or v_actor_id <> v_learner_id then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'not_booking_learner');
  end if;
  if v_scheduled_at is null or pg_catalog.now() < v_scheduled_at then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'session_not_started');
  end if;

  if p_template_id is null or p_template_id !~ '^[a-z0-9][a-z0-9-]{0,63}$'
     or p_template_version is null or p_template_version not between 1 and 1000 then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_template');
  end if;
  if p_language is distinct from 'en' then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'unsupported_language');
  end if;
  if p_trigger is null or p_trigger not in ('bonus', 'insufficient') then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_trigger');
  end if;
  if p_scene_snapshot is null
     or pg_catalog.jsonb_typeof(p_scene_snapshot) <> 'object'
     or pg_catalog.octet_length(p_scene_snapshot::pg_catalog.text) > 16384 then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_scene_snapshot');
  end if;

  v_my_line := nullif(pg_catalog.btrim(coalesce(p_my_line, '')), '');
  if v_my_line is not null and pg_catalog.char_length(v_my_line) > 200 then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'my_line_too_long');
  end if;

  -- The scene must belong to a session that actually has a canonical
  -- learner transcript for this booking.
  select session_logs.transcript
    into v_transcript
    from public.session_logs
   where session_logs.booking_id = p_booking_id
     and session_logs.participant_role = 'learner'
     and session_logs.participant_id = v_actor_id;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'transcript_not_found');
  end if;

  if p_used_expressions is null then
    p_used_expressions := '[]'::pg_catalog.jsonb;
  end if;
  if pg_catalog.jsonb_typeof(p_used_expressions) <> 'array'
     or pg_catalog.jsonb_array_length(p_used_expressions) > 10 then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_expressions');
  end if;

  -- Each expression must appear in one of this learner's own transcript
  -- lines for this booking. Source is set by the server, never the browser.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_used_expressions)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.jsonb_typeof(v_item -> 'text') <> 'string' then
      return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_expressions');
    end if;
    v_text := pg_catalog.btrim(v_item ->> 'text');
    if pg_catalog.char_length(v_text) not between 1 and 200 then
      return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_expressions');
    end if;
    v_needle := pg_catalog.lower(pg_catalog.regexp_replace(v_text, '\s+', ' ', 'g'));

    select exists (
      select 1
        from pg_catalog.jsonb_array_elements(coalesce(v_transcript, '[]'::pg_catalog.jsonb)) as lines(line)
       where pg_catalog.jsonb_typeof(lines.line -> 'text') = 'string'
         and pg_catalog.strpos(
               pg_catalog.lower(pg_catalog.regexp_replace(lines.line ->> 'text', '\s+', ' ', 'g')),
               v_needle
             ) > 0
    ) into v_found;
    if not v_found then
      return pg_catalog.jsonb_build_object('success', false, 'code', 'expression_not_in_transcript');
    end if;

    v_expressions := v_expressions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('text', v_text, 'source', 'learner_transcript')
    );
  end loop;

  -- First completed scene per booking wins; later saves are no-ops.
  insert into public.learner_story_scenes (
    booking_id, learner_id, template_id, template_version, language,
    trigger, scene_snapshot, used_expressions, my_line
  ) values (
    p_booking_id, v_actor_id, p_template_id, p_template_version, p_language,
    p_trigger, p_scene_snapshot, v_expressions, v_my_line
  )
  on conflict (booking_id, learner_id) do nothing
  returning * into v_scene;

  if v_scene.id is null then
    select * into v_scene
      from public.learner_story_scenes
     where booking_id = p_booking_id and learner_id = v_actor_id;
    return pg_catalog.jsonb_build_object(
      'success', true, 'duplicate', true, 'scene_id', v_scene.id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true, 'duplicate', false, 'scene_id', v_scene.id
  );
end
$function$;

create or replace function public.set_story_scene_hidden(
  p_scene_id uuid,
  p_hidden boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'auth_required');
  end if;
  if p_scene_id is null or p_hidden is null then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'invalid_request');
  end if;

  update public.learner_story_scenes
     set hidden_at = case when p_hidden then coalesce(hidden_at, pg_catalog.now()) else null end,
         updated_at = pg_catalog.now()
   where id = p_scene_id
     and learner_id = v_actor_id;
  if not found then
    return pg_catalog.jsonb_build_object('success', false, 'code', 'scene_not_found');
  end if;

  return pg_catalog.jsonb_build_object('success', true, 'hidden', p_hidden);
end
$function$;

alter table public.learner_story_scenes enable row level security;

drop policy if exists "learner_story_scenes_select_owner_or_admin" on public.learner_story_scenes;
create policy "learner_story_scenes_select_owner_or_admin"
  on public.learner_story_scenes
  for select
  to authenticated
  using (
    learner_id = auth.uid()
    or public.dayo_is_admin()
  );

revoke all on table public.learner_story_scenes from public, anon, authenticated;
grant select on table public.learner_story_scenes to authenticated;

revoke all on function public.save_story_scene(uuid, text, integer, text, text, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_story_scene(uuid, text, integer, text, text, jsonb, jsonb, text)
  to authenticated;

revoke all on function public.set_story_scene_hidden(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_story_scene_hidden(uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';

commit;
