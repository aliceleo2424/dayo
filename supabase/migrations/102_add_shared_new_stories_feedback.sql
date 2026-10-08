-- Expand only the positive-feedback validators. No columns, data or RLS changes.
-- Baseline: production 101 definition / CHECK hashes verified 2026-10-08.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
lock table public.conversation_partner_feedback in access exclusive mode;
do $preflight$
begin
 if md5(pg_get_functiondef('public.save_conversation_partner_feedback(uuid,text[],text[],text)'::regprocedure)) <> '4b0857ee82204efe06a8a2b2fd01d7e4' then
  raise exception 'Feedback save definition drift or already applied: review, do not replay';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.conversation_partner_feedback'::regclass and conname='conversation_partner_feedback_good_check' and md5(pg_get_constraintdef(oid))='fcc01f8245ffc6c6ae4559ad92eb8f15') or
    not exists(select 1 from pg_constraint where conrelid='public.conversation_partner_feedback'::regclass and conname='conversation_partner_feedback_requests_check' and md5(pg_get_constraintdef(oid))='acf99cde190297e305d8f805100d3020') then
  raise exception 'Feedback validator baseline drift';
 end if;
 if not exists(select 1 from pg_proc where oid='public.save_conversation_partner_feedback(uuid,text[],text[],text)'::regprocedure and prosecdef and proconfig=array['search_path=""'] and proacl::text='{postgres=X/postgres,authenticated=X/postgres}') or
    not (select relrowsecurity from pg_class where oid='public.conversation_partner_feedback'::regclass) or
    exists(select 1 from pg_policies where schemaname='public' and tablename='conversation_partner_feedback') then
  raise exception 'Feedback security baseline drift';
 end if;
end; $preflight$;

alter table public.conversation_partner_feedback drop constraint conversation_partner_feedback_good_check;
alter table public.conversation_partner_feedback add constraint conversation_partner_feedback_good_check
 check (good <@ array['spoke_slowly','waited_for_me','helped_with_words','helped_with_expressions','asked_good_questions','made_me_comfortable','kept_conversation_going','shared_new_stories']::text[] and array_position(good,null) is null);

-- Reuse the exact live function body. Replace only its good whitelist; preserve
-- identity checks, optional note handling, requests, upsert behavior and ACL.
do $validator$
declare source text; before_keys text := 'array[''spoke_slowly'',''waited_for_me'',''helped_with_words'',''helped_with_expressions'',''asked_good_questions'',''made_me_comfortable'',''kept_conversation_going'']::text[]';
begin
 source := pg_get_functiondef('public.save_conversation_partner_feedback(uuid,text[],text[],text)'::regprocedure);
 if (length(source)-length(replace(source,before_keys,'')))/length(before_keys) <> 1 then
  raise exception 'Expected exactly one good whitelist';
 end if;
 execute replace(source,before_keys,replace(before_keys,']::text[]',',''shared_new_stories'']::text[]'));
end; $validator$;
notify pgrst,'reload schema';
commit;
