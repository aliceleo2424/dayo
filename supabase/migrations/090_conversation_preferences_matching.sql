-- Canonical preferences and deterministic matching v1; no historical conversion.
-- Production catalog audited 2026-10-06. No historical JSON/data conversion.
begin;
do $preflight$
declare v_contract record;
begin
  for v_contract in select * from (values
('deduct_ticket_and_confirm_booking(uuid,uuid)','24abf9abab920277efc9a5e00ea9e3e8'),
('deduct_ticket_and_confirm_booking(uuid,uuid,uuid,uuid)','4e11a2af5cb84190660fb09912e4a906'),
('cancel_my_booking(uuid)','e7a7c6e9e6b711a84409d7e912fa74e5'),
('dayo_valid_conversation_brief(jsonb)','9a275cd1991ade32abb15f0684f3e359'),
('confirm_booking_with_cutoff_cleanup(uuid,uuid)','8d718b5c972f4957f562b244613e70aa'),
('get_admin_partner_capabilities(uuid)','4bba783136d3ce21e76ccee57f0261b0'),
('admin_set_partner_capabilities(uuid,text[],text)','fdea684c1124d16fa3fe7c0cef29d4aa'),
('list_public_partner_profiles()','88f404d18d9d5a4d5871b815e2ad9253'),
('dayo_can_bypass_booking_lead_time()','00a79f26895e6b18e0793facb7af3d73'),
('save_partner_profile_completion(jsonb)','05bd9a7124d5c6afd02396efcdbaa283'),
('get_booking_calendar_slots(uuid[])','5d3c4f8f7688adf11312f0b9220e6650')
  ) expected(signature,hash) loop
    if to_regprocedure('public.'||v_contract.signature) is null or
       md5(pg_get_functiondef(to_regprocedure('public.'||v_contract.signature))) is distinct from v_contract.hash then
      raise exception 'matching_preflight_function_drift: %',v_contract.signature;
    end if;
  end loop;

  if exists(select 1 from jsonb_array_elements($meta$[{"name":"deduct_ticket_and_confirm_booking","args":"p_learner_id uuid, p_booking_id uuid","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}"},{"name":"deduct_ticket_and_confirm_booking","args":"p_learner_id uuid, p_booking_id uuid, p_slot_id uuid, p_partner_id uuid","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}"},{"name":"cancel_my_booking","args":"p_booking_id uuid","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,authenticated=X/postgres}"},{"name":"dayo_valid_conversation_brief","args":"p_brief jsonb","owner":"postgres","definer":false,"config":["search_path=\"\""],"acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}"},{"name":"confirm_booking_with_cutoff_cleanup","args":"p_learner_id uuid, p_booking_id uuid","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}"},{"name":"get_admin_partner_capabilities","args":"p_partner_id uuid","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}"},{"name":"admin_set_partner_capabilities","args":"p_partner_id uuid, p_conversation_languages text[], p_korean_support_level text","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}"},{"name":"list_public_partner_profiles","args":"","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}"},{"name":"dayo_can_bypass_booking_lead_time","args":"","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}"},{"name":"save_partner_profile_completion","args":"p_details jsonb","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}"},{"name":"get_booking_calendar_slots","args":"p_partner_ids uuid[]","owner":"postgres","definer":true,"config":["search_path=\"\""],"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}"}]$meta$::jsonb) e
    where not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname=e->>'name' and pg_get_function_identity_arguments(p.oid)=e->>'args'
      and pg_get_userbyid(p.proowner)=e->>'owner' and to_jsonb(p.prosecdef)=e->'definer'
      and to_jsonb(p.proconfig) is not distinct from e->'config' and p.proacl::text is not distinct from e->>'acl')) then
    raise exception 'matching_preflight_function_security_drift';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('dayo_matching_keys_valid','dayo_partner_preferences_valid','dayo_booking_preferences_v1_valid','save_partner_conversation_preferences','list_matching_partner_profiles','dayo_matching_snapshot_v1','capture_booking_matching_snapshot','sync_confirmed_booking_preferences')) then
    raise exception 'matching_preflight_new_function_collision';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and
    ((table_name='partner_profile_details' and column_name='conversation_preferences') or
     (table_name='bookings' and column_name='matching_snapshot') or
     (table_name='user_conversation_preferences' and column_name='conversation_style'))) then
    raise exception 'matching_preflight_already_present';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='partner_profile_details' and policyname='partner_profile_details_read')
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='user_conversation_preferences' and policyname='checkout_preferences_own_select')
     or has_table_privilege('authenticated','public.partner_profile_details','UPDATE') then
    raise exception 'matching_preflight_private_contract_drift';
  end if;

  if (select coalesce(jsonb_agg(to_jsonb(p) order by tablename,policyname),'[]'::jsonb) from pg_policies p where schemaname='public' and tablename in ('partner_profile_details','user_conversation_preferences','bookings'))
    is distinct from (select jsonb_agg(e order by e->>'tablename',e->>'policyname') from jsonb_array_elements($pol$[{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"bookings","permissive":"PERMISSIVE","policyname":"bookings_insert_own_pending","schemaname":"public","with_check":"((learner_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['user'::character varying, 'learner'::character varying, 'admin'::character varying])::text[]))))) AND ((status)::text = 'pending'::text) AND (partner_user_id = partner_id) AND (ticket_deducted = false) AND (partner_rewarded = false) AND (ticket_refunded = false) AND (ended_at IS NULL) AND (completed_at IS NULL) AND (end_reason IS NULL) AND (rating IS NULL))"},{"cmd":"SELECT","qual":"dayo_is_admin()","roles":["authenticated"],"tablename":"bookings","permissive":"PERMISSIVE","policyname":"bookings_select_admin","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"((learner_id = auth.uid()) OR (partner_user_id = auth.uid()))","roles":["authenticated"],"tablename":"bookings","permissive":"PERMISSIVE","policyname":"bookings_select_participant","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"((learner_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['user'::character varying, 'learner'::character varying])::text[]))))))","roles":["authenticated"],"tablename":"bookings","permissive":"PERMISSIVE","policyname":"bookings_update_own_rating","schemaname":"public","with_check":"((learner_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM profiles\n  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['user'::character varying, 'learner'::character varying])::text[]))))))"},{"cmd":"SELECT","qual":"(dayo_is_admin() OR ((partner_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND ((p.role)::text = 'partner'::text))))))","roles":["authenticated"],"tablename":"partner_profile_details","permissive":"PERMISSIVE","policyname":"partner_profile_details_read","schemaname":"public","with_check":null},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"user_conversation_preferences","permissive":"PERMISSIVE","policyname":"checkout_preferences_own_insert","schemaname":"public","with_check":"(user_id = ( SELECT auth.uid() AS uid))"},{"cmd":"SELECT","qual":"(user_id = ( SELECT auth.uid() AS uid))","roles":["authenticated"],"tablename":"user_conversation_preferences","permissive":"PERMISSIVE","policyname":"checkout_preferences_own_select","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(user_id = ( SELECT auth.uid() AS uid))","roles":["authenticated"],"tablename":"user_conversation_preferences","permissive":"PERMISSIVE","policyname":"checkout_preferences_own_update","schemaname":"public","with_check":"(user_id = ( SELECT auth.uid() AS uid))"}]$pol$::jsonb) e) then
    raise exception 'matching_preflight_policy_drift';
  end if;
  if (select coalesce(jsonb_agg(to_jsonb(g) order by table_name,column_name,grantee,privilege_type),'[]'::jsonb) from information_schema.column_privileges g where table_schema='public' and table_name in ('partner_profile_details','user_conversation_preferences','bookings') and grantee in ('authenticated','anon'))
    is distinct from (select jsonb_agg(e order by e->>'table_name',e->>'column_name',e->>'grantee',e->>'privilege_type') from jsonb_array_elements($grants$[{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"availability_periods","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"city","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"completed_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"completed_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"conversation_brief","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"conversation_brief","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"country","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"created_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"created_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"created_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"end_reason","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"ended_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"interests","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"interests","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"interests","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"UPDATE"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"korea_city_other","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"korean_level","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"language","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"language","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"learner_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"learner_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"location_status","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"native_languages","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"other_interest","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"other_interest","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"other_interest","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"UPDATE"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"other_languages","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"partner_guide_acknowledged_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"partner_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"partner_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"partner_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"partner_name","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"partner_name","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"partner_rewarded","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"partner_user_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"partner_user_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"rating","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"rating","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"UPDATE"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"scheduled_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"scheduled_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"schema_version","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"session_languages","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"slot_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"slot_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"status","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"status","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"ticket_deducted","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"ticket_refunded","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"bookings","column_name":"updated_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"updated_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"updated_at","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"user_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"INSERT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"user_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"user_conversation_preferences","column_name":"user_id","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"UPDATE"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"visa_type","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"},{"grantee":"authenticated","grantor":"postgres","table_name":"partner_profile_details","column_name":"weekly_session_capacity","is_grantable":"NO","table_schema":"public","table_catalog":"postgres","privilege_type":"SELECT"}]$grants$::jsonb) e) then
    raise exception 'matching_preflight_grant_drift';
  end if;

  if (select jsonb_agg(jsonb_build_object('relname',c.relname,'relrowsecurity',c.relrowsecurity,'relacl',c.relacl::text,
      'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
      'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
      'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE')) order by c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('partner_profile_details','user_conversation_preferences','bookings'))
    is distinct from (select jsonb_agg(v order by v->>'relname') from jsonb_array_elements($tables$[{"relacl":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}","relname":"bookings","relrowsecurity":true,"authenticated_insert":false,"authenticated_select":true,"authenticated_update":false},{"relacl":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}","relname":"partner_profile_details","relrowsecurity":true,"authenticated_insert":false,"authenticated_select":true,"authenticated_update":false},{"relacl":"{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres}","relname":"user_conversation_preferences","relrowsecurity":true,"authenticated_insert":false,"authenticated_select":true,"authenticated_update":false}]$tables$::jsonb) v) then
    raise exception 'matching_preflight_table_security_drift';
  end if;
  if (select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) order by c.conname)
      from pg_constraint c where c.conrelid in ('public.partner_profile_details'::regclass,'public.user_conversation_preferences'::regclass,'public.bookings'::regclass))
    is distinct from (select jsonb_agg(v order by v->>'name') from jsonb_array_elements($constraints$[{"name":"bookings_conversation_brief_valid","table":"bookings","definition":"CHECK (dayo_valid_conversation_brief(conversation_brief))"},{"name":"bookings_pkey","table":"bookings","definition":"PRIMARY KEY (id)"},{"name":"partner_profile_completion_required","table":"partner_profile_details","definition":"CHECK (((completed_at IS NULL) OR ((location_status IS NOT NULL) AND (visa_type IS NOT NULL) AND (korean_level IS NOT NULL) AND (weekly_session_capacity IS NOT NULL) AND (partner_guide_acknowledged_at IS NOT NULL) AND (COALESCE(cardinality(native_languages), 0) > 0) AND (COALESCE(cardinality(session_languages), 0) > 0))))"},{"name":"partner_profile_details_city_check","table":"partner_profile_details","definition":"CHECK (((length(btrim(city)) >= 1) AND (length(btrim(city)) <= 100)))"},{"name":"partner_profile_details_country_check","table":"partner_profile_details","definition":"CHECK (((length(btrim(country)) >= 1) AND (length(btrim(country)) <= 100)))"},{"name":"partner_profile_details_korea_city_other_check","table":"partner_profile_details","definition":"CHECK (((length(btrim(korea_city_other)) >= 1) AND (length(btrim(korea_city_other)) <= 100)))"},{"name":"partner_profile_details_korean_level_check","table":"partner_profile_details","definition":"CHECK ((korean_level = ANY (ARRAY['none'::text, 'basic'::text, 'conversational'::text, 'advanced'::text, 'native'::text])))"},{"name":"partner_profile_details_location_status_check","table":"partner_profile_details","definition":"CHECK ((location_status = ANY (ARRAY['korea'::text, 'overseas'::text])))"},{"name":"partner_profile_details_other_languages_check","table":"partner_profile_details","definition":"CHECK ((jsonb_typeof(other_languages) = 'array'::text))"},{"name":"partner_profile_details_partner_id_fkey","table":"partner_profile_details","definition":"FOREIGN KEY (partner_id) REFERENCES profiles(id) ON DELETE RESTRICT"},{"name":"partner_profile_details_partner_id_key","table":"partner_profile_details","definition":"UNIQUE (partner_id)"},{"name":"partner_profile_details_pkey","table":"partner_profile_details","definition":"PRIMARY KEY (id)"},{"name":"partner_profile_details_visa_type_check","table":"partner_profile_details","definition":"CHECK ((visa_type = ANY (ARRAY['D-2'::text, 'D-4'::text, 'F-series'::text, 'Other visa'::text, 'not_applicable_overseas'::text])))"},{"name":"partner_profile_details_weekly_session_capacity_check","table":"partner_profile_details","definition":"CHECK ((weekly_session_capacity = ANY (ARRAY['1-2'::text, '3-5'::text, '6-10'::text, '10+'::text])))"},{"name":"checkout_interests_check","table":"user_conversation_preferences","definition":"CHECK (checkout_interests_valid(interests, other_interest))"},{"name":"user_conversation_preferences_pkey","table":"user_conversation_preferences","definition":"PRIMARY KEY (user_id)"},{"name":"user_conversation_preferences_schema_version_check","table":"user_conversation_preferences","definition":"CHECK ((schema_version = 1))"},{"name":"user_conversation_preferences_user_id_fkey","table":"user_conversation_preferences","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}]$constraints$::jsonb) v) then
    raise exception 'matching_preflight_constraint_drift';
  end if;
end $preflight$;

create function public.dayo_matching_keys_valid(v jsonb, allowed text[], maximum integer, minimum integer default 0)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'array' then return false; end if;
  return jsonb_array_length(v) between minimum and maximum
    and not exists(select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or not (e#>>'{}'=any(allowed)))
    and (select count(distinct e) from jsonb_array_elements(v) e)=jsonb_array_length(v);
end $$;

create function public.dayo_partner_preferences_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  return v->'schema_version'='1'::jsonb and (select count(*) from jsonb_object_keys(v))=4
    and v ?& array['schema_version','comfortable_purposes','interests','conversation_styles']
    and public.dayo_matching_keys_valid(v->'comfortable_purposes',array['travel','work_school','abroad','casual'],4)
    and public.dayo_matching_keys_valid(v->'interests',array['drama','movies','youtube','music','travel','food_cafe','exercise','games','fashion_beauty','pets','books_webtoon','work_school'],4)
    and public.dayo_matching_keys_valid(v->'conversation_styles',array['slow','fast','correct','encourage'],4);
end $$;

create function public.dayo_booking_preferences_v1_valid(v jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  return v->'schema_version'='1'::jsonb and (select count(*) from jsonb_object_keys(v))=5
    and v ?& array['schema_version','korean_support_preference','purposes','interests','conversation_style']
    and jsonb_typeof(v->'korean_support_preference')='string' and v->>'korean_support_preference' in ('required','any')
    and jsonb_typeof(v->'conversation_style')='string' and v->>'conversation_style' in ('slow','fast','correct','encourage')
    and public.dayo_matching_keys_valid(v->'purposes',array['travel','work_school','abroad','casual'],4,1)
    and public.dayo_matching_keys_valid(v->'interests',array['drama','movies','youtube','music','travel','food_cafe','exercise','games','fashion_beauty','pets','books_webtoon','work_school'],4);
end $$;
CREATE OR REPLACE FUNCTION public.dayo_valid_conversation_brief(p_brief jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
 v_key text;
 v_purpose text;
 v_interest jsonb;
 v_interest_id text;
 v_seen text[] := array[]::text[];
begin
  if p_brief ? 'schema_version' then
    return coalesce(public.dayo_booking_preferences_v1_valid(p_brief),false);
  end if;
 if p_brief is null then
 return true;
 end if;
 if pg_catalog.jsonb_typeof(p_brief) <> 'object'
 or pg_catalog.octet_length(p_brief::text) > 2048 then
 return false;
 end if;

 for v_key in select pg_catalog.jsonb_object_keys(p_brief) loop
 if v_key not in ('purposes', 'interests', 'chat_style', 'chat_request', 'partner_preference') then
 return false;
 end if;
 end loop;

 if p_brief ? 'purposes' then
 if pg_catalog.jsonb_typeof(p_brief->'purposes') <> 'array' then
 return false;
 end if;
 if pg_catalog.jsonb_array_length(p_brief->'purposes') < 1
 or pg_catalog.jsonb_array_length(p_brief->'purposes') > 4 then
 return false;
 end if;
 for v_purpose in select pg_catalog.jsonb_array_elements_text(p_brief->'purposes') loop
 if v_purpose is null
 or v_purpose not in ('travel', 'opic', 'abroad', 'casual')
 or v_purpose = any(v_seen) then
 return false;
 end if;
 v_seen := pg_catalog.array_append(v_seen, v_purpose);
 end loop;
 end if;

 if p_brief ? 'interests' then
 if pg_catalog.jsonb_typeof(p_brief->'interests') <> 'array' then
 return false;
 end if;
 if pg_catalog.jsonb_array_length(p_brief->'interests') > 4 then
 return false;
 end if;
 v_seen := array[]::text[];
 for v_interest in select pg_catalog.jsonb_array_elements(p_brief->'interests') loop
 if pg_catalog.jsonb_typeof(v_interest) <> 'string' then
 return false;
 end if;
 v_interest_id := v_interest #>> '{}';
 if v_interest_id not in (
 'drama', 'movies', 'youtube', 'music', 'travel', 'food_cafe',
 'exercise', 'games', 'fashion_beauty', 'pets', 'books_webtoon', 'work_school'
 ) or v_interest_id = any(v_seen) then
 return false;
 end if;
 v_seen := pg_catalog.array_append(v_seen, v_interest_id);
 end loop;
 end if;
 if p_brief ? 'chat_style'
 and p_brief->'chat_style' <> 'null'::jsonb
 and (pg_catalog.jsonb_typeof(p_brief->'chat_style') <> 'string'
 or p_brief->>'chat_style' not in ('casual', 'correct', 'interview')) then
 return false;
 end if;
 if p_brief ? 'chat_request'
 and p_brief->'chat_request' <> 'null'::jsonb
 and (pg_catalog.jsonb_typeof(p_brief->'chat_request') <> 'string'
 or p_brief->>'chat_request' not in ('praise', 'gentle', 'encourage')) then
 return false;
 end if;
 if p_brief ? 'partner_preference'
 and p_brief->'partner_preference' <> 'null'::jsonb
 and (pg_catalog.jsonb_typeof(p_brief->'partner_preference') <> 'string'
 or p_brief->>'partner_preference' not in ('slow', 'fast', 'correct', 'korean')) then
 return false;
 end if;
 return true;
end;
$function$
;

alter table public.partner_profile_details add column conversation_preferences jsonb
  check(conversation_preferences is null or coalesce(public.dayo_partner_preferences_valid(conversation_preferences),false));
alter table public.bookings add column matching_snapshot jsonb;
alter table public.user_conversation_preferences
  add column language text check(language in ('en','es','fr','ko')),
  add column korean_support_preference text check(korean_support_preference in ('required','any')),
  add column conversation_style text check(conversation_style in ('slow','fast','correct','encourage')),
  add column purposes text[] check(purposes <@ array['travel','work_school','abroad','casual']::text[] and cardinality(purposes) between 1 and 4),
  add column source_booking_id uuid references public.bookings(id) on delete set null;
-- New defaults are synchronized by the server only; existing owner RLS/grants stay intact.

create function public.save_partner_conversation_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); value jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles where id=actor and role='partner' for share) then
    raise exception 'Partner access required.' using errcode='42501';
  end if;
  if not coalesce(public.dayo_partner_preferences_valid(p_preferences),false) then
    raise exception 'Invalid conversation preferences.' using errcode='22023';
  end if;
  update public.partner_profile_details set conversation_preferences=p_preferences
    where partner_id=actor returning conversation_preferences into value;
  if not found then raise exception 'Complete Partner Profile first.' using errcode='22023'; end if;
  return value;
end $$;

-- Reuse the approved-role/display/capability contract; expose only matching arrays.
create function public.list_matching_partner_profiles(p_language text,p_korean_support_preference text)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_language is null or p_language not in ('en','es','fr','ko') or p_korean_support_preference is null or p_korean_support_preference not in ('required','any') then
    raise exception 'Choose language and Korean support.' using errcode='22023';
  end if;
  return query select p.value || jsonb_build_object('conversation_preferences',d.conversation_preferences)
    from public.list_public_partner_profiles() p(value)
    left join public.partner_profile_details d on d.partner_id=(p.value->>'id')::uuid
    where p.value->'conversation_languages' ? p_language
      and (p_korean_support_preference='any' or p.value->>'korean_support_level' in ('conversational','fluent'));
end $$;

create function public.dayo_matching_snapshot_v1(p_language text,p_brief jsonb,p_partner jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare goals integer; styles integer; interests integer; pref jsonb:=p_partner;
begin
  if not coalesce(public.dayo_booking_preferences_v1_valid(p_brief),false) then raise exception 'Invalid canonical brief.' using errcode='22023'; end if;
  if pref is null or (jsonb_typeof(pref)='object' and not (pref ? 'schema_version')) then pref:=jsonb_build_object('schema_version',1,'comfortable_purposes','[]'::jsonb,'interests','[]'::jsonb,'conversation_styles','[]'::jsonb); end if;
  if not coalesce(public.dayo_partner_preferences_valid(pref),false) then raise exception 'Invalid Partner preferences.' using errcode='22023'; end if;
  select count(*)::integer into goals from jsonb_array_elements_text(p_brief->'purposes') k where pref->'comfortable_purposes' ? k;
  styles:=case when pref->'conversation_styles' ? (p_brief->>'conversation_style') then 1 else 0 end;
  select count(*)::integer into interests from jsonb_array_elements_text(p_brief->'interests') k where pref->'interests' ? k;
  return jsonb_build_object('scoring_version',1,'user',p_brief||jsonb_build_object('language',p_language),
    'partner',pref,'matching_score',goals*3+styles*2+interests,
    'score_breakdown',jsonb_build_object('purpose_overlap',goals,'style_match',styles,'interest_overlap',interests));
end $$;

create function public.capture_booking_matching_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare pref jsonb; languages text[]; support text;
begin
  if tg_op='INSERT' then
    -- Never trust a client-supplied score/snapshot (including privileged entry paths).
    new.matching_snapshot:=null;
    return new;
  end if;
  if new.matching_snapshot is distinct from old.matching_snapshot then
    raise exception 'Matching snapshot is server-owned.' using errcode='42501';
  end if;
  if old.matching_snapshot is not null and (new.conversation_brief is distinct from old.conversation_brief or new.language is distinct from old.language or new.learner_id is distinct from old.learner_id or new.partner_id is distinct from old.partner_id) then
    raise exception 'Confirmed matching choices are immutable.' using errcode='42501';
  end if;
  if old.status='pending' and new.status='confirmed' and new.conversation_brief ? 'schema_version' then
    if auth.uid() is distinct from new.learner_id or not new.ticket_deducted or
       not coalesce(public.dayo_booking_preferences_v1_valid(new.conversation_brief),false) then
      raise exception 'Canonical participant confirmation required.' using errcode='42501';
    end if;
    if new.language is null or new.language not in ('en','es','fr','ko') or not exists(select 1 from public.profiles where id=new.partner_id and role='partner' for share) then
      raise exception 'Partner no longer eligible.' using errcode='23514';
    end if;
    select c.conversation_languages,c.korean_support_level into languages,support
      from public.partner_capabilities c where c.partner_id=new.partner_id for share;
    if not found or not coalesce(new.language=any(languages),false) or
       (new.conversation_brief->>'korean_support_preference'='required' and coalesce(support,'') not in ('conversational','fluent')) then
      raise exception 'Partner capability mismatch.' using errcode='23514';
    end if;
    select conversation_preferences into pref from public.partner_profile_details where partner_id=new.partner_id for share;
    new.matching_snapshot:=public.dayo_matching_snapshot_v1(new.language,new.conversation_brief,pref);
  end if;
  return new;
end $$;
create trigger capture_booking_matching_snapshot before insert or update on public.bookings
  for each row execute function public.capture_booking_matching_snapshot();

create function public.sync_confirmed_booking_preferences()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='pending' and new.status='confirmed' and new.matching_snapshot is not null then
    insert into public.user_conversation_preferences(user_id,interests,language,korean_support_preference,conversation_style,purposes,source_booking_id)
      values(new.learner_id,array(select jsonb_array_elements_text(new.conversation_brief->'interests')),new.language,
        new.conversation_brief->>'korean_support_preference',new.conversation_brief->>'conversation_style',
        array(select jsonb_array_elements_text(new.conversation_brief->'purposes')),new.id)
      on conflict(user_id) do update set interests=excluded.interests,language=excluded.language,
        korean_support_preference=excluded.korean_support_preference,conversation_style=excluded.conversation_style,
        purposes=excluded.purposes,source_booking_id=excluded.source_booking_id
      where user_conversation_preferences.source_booking_id is null or
        exists(select 1 from public.bookings b where b.id=user_conversation_preferences.source_booking_id and (b.created_at,b.id)<=(new.created_at,new.id));
  end if;
  return new;
end $$;
create trigger sync_confirmed_booking_preferences after update of status on public.bookings
  for each row execute function public.sync_confirmed_booking_preferences();
alter function public.dayo_matching_keys_valid(jsonb,text[],integer,integer) owner to postgres;
revoke all on function public.dayo_matching_keys_valid(jsonb,text[],integer,integer) from public,anon,authenticated,service_role;
alter function public.dayo_partner_preferences_valid(jsonb) owner to postgres;
revoke all on function public.dayo_partner_preferences_valid(jsonb) from public,anon,authenticated,service_role;
alter function public.dayo_booking_preferences_v1_valid(jsonb) owner to postgres;
revoke all on function public.dayo_booking_preferences_v1_valid(jsonb) from public,anon,authenticated,service_role;
alter function public.save_partner_conversation_preferences(jsonb) owner to postgres;
revoke all on function public.save_partner_conversation_preferences(jsonb) from public,anon,authenticated,service_role;
alter function public.list_matching_partner_profiles(text,text) owner to postgres;
revoke all on function public.list_matching_partner_profiles(text,text) from public,anon,authenticated,service_role;
alter function public.dayo_matching_snapshot_v1(text,jsonb,jsonb) owner to postgres;
revoke all on function public.dayo_matching_snapshot_v1(text,jsonb,jsonb) from public,anon,authenticated,service_role;
alter function public.capture_booking_matching_snapshot() owner to postgres;
revoke all on function public.capture_booking_matching_snapshot() from public,anon,authenticated,service_role;
alter function public.sync_confirmed_booking_preferences() owner to postgres;
revoke all on function public.sync_confirmed_booking_preferences() from public,anon,authenticated,service_role;
grant execute on function public.dayo_matching_keys_valid(jsonb,text[],integer,integer) to authenticated;
grant execute on function public.dayo_partner_preferences_valid(jsonb) to authenticated;
grant execute on function public.dayo_booking_preferences_v1_valid(jsonb) to authenticated;
grant execute on function public.save_partner_conversation_preferences(jsonb) to authenticated;
grant execute on function public.list_matching_partner_profiles(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
