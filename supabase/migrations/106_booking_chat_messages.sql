-- CHAT-PERSIST-01 local draft; standalone, no dependency on excluded 104.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$ begin
 if to_regclass('public.booking_chat_messages') is not null then raise exception 'Chat migration already exists'; end if;
 if to_regprocedure('public.get_room_session_state(uuid)') is null then raise exception 'Missing canonical session-ended contract'; end if;
 if to_regclass('public.profiles') is null or to_regclass('auth.users') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='session_reports' and column_name='feedback' and data_type='jsonb')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='session_reports' and column_name='booking_id' and data_type='uuid') then
  raise exception 'Missing verified account/report deletion dependencies';
 end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in
   ('send_booking_chat_message','dayo_chat_filter_report_feedback','dayo_chat_report_guard','dayo_chat_after_delete')) then
  raise exception 'Chat migration function collision: review before applying';
 end if;
end $$;
create table public.booking_chat_messages (
 booking_id uuid not null references public.bookings(id) on delete cascade, id uuid not null,
 sender_id uuid not null references auth.users(id) on delete cascade
   references public.profiles(id) on delete cascade, sender_role text not null check(sender_role in ('learner','partner')),
 text text not null check(length(text) between 1 and 1000 and length(btrim(text))>0),
 created_at timestamptz not null default now(), primary key(booking_id,id)
);
alter table public.booking_chat_messages enable row level security;
revoke all on public.booking_chat_messages from public,anon,authenticated,service_role;
grant select on public.booking_chat_messages to authenticated,service_role;
create policy booking_chat_participant_read on public.booking_chat_messages for select to authenticated
 using(exists(select 1 from public.bookings b where b.id=booking_id and (auth.uid()=b.learner_id or auth.uid()=b.partner_user_id)));
create function public.send_booking_chat_message(p_booking_id uuid,p_message_id uuid,p_text text)
returns public.booking_chat_messages language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; u uuid:=auth.uid(); m public.booking_chat_messages%rowtype; state jsonb;
begin
 if u is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or (u is distinct from b.learner_id and u is distinct from b.partner_user_id) then raise exception 'not_booking_participant' using errcode='42501'; end if;
 if p_message_id is null or p_text is null or length(p_text) not between 1 and 1000 or length(btrim(p_text))=0 then raise exception 'invalid_chat_message'; end if;
 select * into m from public.booking_chat_messages where booking_id=b.id and id=p_message_id;
 if found then
  if m.sender_id<>u or m.text<>p_text then raise exception 'message_identity_conflict' using errcode='42501'; end if;
  return m;
 end if;
 state:=public.get_room_session_state(b.id);
 if b.status<>'confirmed' or b.ended_at is not null or (state->>'success') is distinct from 'true' or (state->>'session_ended') is distinct from 'false'
  -- Preserve the existing exact internal-pair clock exception; ended-state protection still applies.
  or (not coalesce((b.learner_id='131a43d2-8a90-41bb-a17a-2217b1ef283f'::uuid and b.partner_user_id='1bc0eab5-9399-4da8-a90c-145ab0c4409d'::uuid),false)
      and (b.scheduled_at is null or now()<b.scheduled_at-interval '5 minutes' or now()>=b.scheduled_at+interval '25 minutes')) then
  raise exception 'chat_session_inactive' using errcode='42501';
 end if;
 if(select count(*) from public.booking_chat_messages where booking_id=b.id)>=500 then raise exception 'chat_limit_reached'; end if;
 insert into public.booking_chat_messages(booking_id,id,sender_id,sender_role,text)
 values(b.id,p_message_id,u,case when u=b.learner_id then 'learner' else 'partner' end,p_text) returning * into m;
 return m;
end $$;
revoke all on function public.send_booking_chat_message(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.send_booking_chat_message(uuid,uuid,text) to authenticated;

-- Follow existing canonical transcript cascades (072); no new retention period.
-- Only new chat copies/provenance are removed. Scores, Letter, speech and other
-- report fields remain intact, including reports retained after booking deletion.
create function public.dayo_chat_filter_report_feedback(f jsonb, booking uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entry jsonb; kept jsonb; metrics jsonb; result jsonb:='[]'::jsonb; word jsonb; words jsonb;
begin
 if jsonb_typeof(f) is distinct from 'array' then return f; end if;
 for entry in select value from jsonb_array_elements(f) loop
  if entry->>'kind'='conversation_recap' and entry->>'generator'='dayo_conversation_recap_v1'
     and entry ? 'chat' then
   select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) into kept
   from jsonb_array_elements(case when jsonb_typeof(entry->'chat'->'messages')='array' then entry->'chat'->'messages' else '[]'::jsonb end) with ordinality x
   where entry->>'booking_id'=booking::text and exists(
    select 1 from public.booking_chat_messages m where m.booking_id=booking
      and m.id::text=x.value->>'message_id' and m.sender_id::text=x.value->>'sender_id'
      and m.sender_role=x.value->>'speaker' and m.text=x.value->>'text');
   select jsonb_build_object(
    'user_message_count',count(*) filter(where value->>'speaker'='learner'),
    'partner_message_count',count(*) filter(where value->>'speaker'='partner'),
    'user_word_count',coalesce(sum((select count(*) from regexp_matches(value->>'text','[[:alnum:]]+([''’][[:alnum:]]+)*','g'))) filter(where value->>'speaker'='learner'),0),
    'partner_word_count',coalesce(sum((select count(*) from regexp_matches(value->>'text','[[:alnum:]]+([''’][[:alnum:]]+)*','g'))) filter(where value->>'speaker'='partner'),0))
    into metrics from jsonb_array_elements(kept);
   -- Avoid changing JS-computed counts on ordinary saves; recalculate only on removal.
   if kept is distinct from entry->'chat'->'messages' then
    entry:=jsonb_set(entry,'{chat,messages}',kept);
    entry:=jsonb_set(entry,'{chat,metrics}',metrics);
   end if;
   if jsonb_typeof(entry->'word_expansion')='array' then
    words:='[]'::jsonb;
    for word in select value from jsonb_array_elements(entry->'word_expansion') loop
     if jsonb_typeof(word->'source_evidence')='array' then
      word:=jsonb_set(word,'{source_evidence}',coalesce((select jsonb_agg(e.value order by e.ordinality)
       from jsonb_array_elements(word->'source_evidence') with ordinality e
       where e.value->>'medium' is distinct from 'chat' or exists(select 1 from jsonb_array_elements(kept) k where k->>'id'=e.value->>'id')),'[]'::jsonb));
     end if;
     if jsonb_typeof(word->'source_utterance_ids')='array' then
      word:=jsonb_set(word,'{source_utterance_ids}',coalesce((select jsonb_agg(e.value order by e.ordinality)
       from jsonb_array_elements(word->'source_utterance_ids') with ordinality e
       where e.value#>>'{}' not like 'chat:%' or exists(select 1 from jsonb_array_elements(kept) k where k->>'id'=e.value#>>'{}')),'[]'::jsonb));
     end if;
     words:=words||jsonb_build_array(word);
    end loop;
    entry:=jsonb_set(entry,'{word_expansion}',words);
   end if;
  end if;
  result:=result||jsonb_build_array(entry);
 end loop;
 return result;
end $$;
create function public.dayo_chat_report_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.feedback:=public.dayo_chat_filter_report_feedback(new.feedback,new.booking_id);
 return new;
end $$;
create trigger dayo_chat_report_guard before insert or update of feedback,booking_id
on public.session_reports for each row execute function public.dayo_chat_report_guard();
create function public.dayo_chat_after_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.session_reports r
 set feedback=public.dayo_chat_filter_report_feedback(r.feedback,r.booking_id)
 where (r.booking_id=old.booking_id or r.feedback @> jsonb_build_array(jsonb_build_object(
  'kind','conversation_recap','generator','dayo_conversation_recap_v1','booking_id',old.booking_id::text)))
 and r.feedback is distinct from public.dayo_chat_filter_report_feedback(r.feedback,r.booking_id);
 return old;
end $$;
create trigger dayo_chat_after_delete after delete on public.booking_chat_messages
for each row execute function public.dayo_chat_after_delete();
revoke all on function public.dayo_chat_filter_report_feedback(jsonb,uuid),
 public.dayo_chat_report_guard(),public.dayo_chat_after_delete() from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
