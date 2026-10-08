-- Optional exact-booking feedback. No legacy report, session or settlement writes.
begin;
do $preflight$ begin
 if to_regclass('public.conversation_partner_feedback') is not null then
  raise exception 'Feedback already exists: review, do not replay';
 end if;
 if to_regprocedure('public.get_room_session_state(uuid)') is null or
    md5(pg_get_functiondef('public.get_room_session_state(uuid)'::regprocedure)) <> 'ce32926ba5402738ecd0c16e0707cd26' or
    md5(pg_get_functiondef('public.dayo_is_admin()'::regprocedure)) <> 'b932d95fb53315d3521fc15648ea116b' then
  raise exception 'Canonical session-ended/admin contract drift';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('save_conversation_partner_feedback','get_my_conversation_partner_feedback','list_my_partner_conversation_feedback','admin_get_conversation_partner_feedback')) then
  raise exception 'Feedback RPC name collision';
 end if;
end; $preflight$;
create table public.conversation_partner_feedback (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id),
 user_id uuid not null references public.profiles(id),
 partner_user_id uuid not null references public.profiles(id),
 good text[] not null default '{}' check (good <@ array['spoke_slowly','waited_for_me','helped_with_words','helped_with_expressions','asked_good_questions','made_me_comfortable','kept_conversation_going']::text[] and array_position(good,null) is null),
 requests text[] not null default '{}' check (requests <@ array['speak_more_slowly','speak_more_quickly','wait_more','correct_more','help_more_with_words','speak_more','listen_more','ask_more_questions']::text[] and array_position(requests,null) is null),
 private_admin_note text check (char_length(private_admin_note)<=1000),
 schema_version integer not null default 1 check (schema_version=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(booking_id,user_id),
 check(cardinality(good)+cardinality(requests)>0 or nullif(btrim(private_admin_note),'') is not null)
);
create index conversation_partner_feedback_partner_idx on public.conversation_partner_feedback(partner_user_id,created_at desc);
alter table public.conversation_partner_feedback enable row level security;
-- RPC-only: private notes must never be exposed by a broad SELECT policy.
revoke all on public.conversation_partner_feedback from public,anon,authenticated;

create function public.save_conversation_partner_feedback(p_booking_id uuid,p_good text[],p_requests text[],p_private_admin_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b public.bookings%rowtype; g text[]; r text[]; note text; row public.conversation_partner_feedback%rowtype;
begin
 if u is null then raise exception 'feedback_unauthorized' using errcode='42501'; end if;
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.learner_id is distinct from u or b.partner_user_id is null or b.status not in ('confirmed','completed') then
  raise exception 'feedback_not_allowed' using errcode='42501';
 end if;
 if not coalesce((public.get_room_session_state(b.id)->>'session_ended')::boolean,false) then
  raise exception 'feedback_session_not_ended' using errcode='42501';
 end if;
 if cardinality(p_good)>64 or cardinality(p_requests)>64 or
    not(coalesce(p_good,'{}') <@ array['spoke_slowly','waited_for_me','helped_with_words','helped_with_expressions','asked_good_questions','made_me_comfortable','kept_conversation_going']::text[]) or not(coalesce(p_requests,'{}') <@ array['speak_more_slowly','speak_more_quickly','wait_more','correct_more','help_more_with_words','speak_more','listen_more','ask_more_questions']::text[]) or
    array_position(p_good,null) is not null or array_position(p_requests,null) is not null then
  raise exception 'feedback_invalid_key' using errcode='22023';
 end if;
 select coalesce(array_agg(v order by v),'{}') into g from (select distinct unnest(p_good) v) s;
 select coalesce(array_agg(v order by v),'{}') into r from (select distinct unnest(p_requests) v) s;
 note:=nullif(btrim(p_private_admin_note),'');
 if char_length(note)>1000 or (cardinality(g)+cardinality(r)=0 and note is null) then
  raise exception 'feedback_invalid_content' using errcode='22023';
 end if;
 insert into public.conversation_partner_feedback(booking_id,user_id,partner_user_id,good,requests,private_admin_note)
 values(b.id,u,b.partner_user_id,g,r,note)
 on conflict(booking_id,user_id) do update set good=excluded.good,requests=excluded.requests,
  private_admin_note=excluded.private_admin_note,updated_at=now()
 returning * into row;
 return to_jsonb(row);
end;$$;

create function public.get_my_conversation_partner_feedback(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not exists(select 1 from public.bookings where id=p_booking_id and learner_id=u) then
  raise exception 'feedback_not_allowed' using errcode='42501';
 end if;
 select to_jsonb(f) into result from public.conversation_partner_feedback f where f.booking_id=p_booking_id and f.user_id=u;
 return result;
end;$$;

create function public.list_my_partner_conversation_feedback()
returns table(booking_id uuid,good text[],requests text[],created_at timestamptz,updated_at timestamptz,scheduled_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'feedback_unauthorized' using errcode='42501'; end if;
 return query select f.booking_id,f.good,f.requests,f.created_at,f.updated_at,b.scheduled_at
 from public.conversation_partner_feedback f join public.bookings b on b.id=f.booking_id
 where f.partner_user_id=auth.uid() and b.partner_user_id=auth.uid() and cardinality(f.good)+cardinality(f.requests)>0
 order by f.created_at desc limit 100;
end;$$;

create function public.admin_get_conversation_partner_feedback(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce(public.dayo_is_admin(),false) then raise exception 'feedback_admin_required' using errcode='42501'; end if;
 select to_jsonb(f) into result from public.conversation_partner_feedback f where f.booking_id=p_booking_id;
 return result;
end;$$;
revoke all on function public.save_conversation_partner_feedback(uuid,text[],text[],text) from public,anon,authenticated,service_role;
revoke all on function public.get_my_conversation_partner_feedback(uuid) from public,anon,authenticated,service_role;
revoke all on function public.list_my_partner_conversation_feedback() from public,anon,authenticated,service_role;
revoke all on function public.admin_get_conversation_partner_feedback(uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_conversation_partner_feedback(uuid,text[],text[],text) to authenticated;
grant execute on function public.get_my_conversation_partner_feedback(uuid) to authenticated;
grant execute on function public.list_my_partner_conversation_feedback() to authenticated;
grant execute on function public.admin_get_conversation_partner_feedback(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
