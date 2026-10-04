-- Profiles security ONLY. Draft 082, before profile extension 083 and Monthly 084.
-- Baseline verified read-only against production on 2026-10-05. Partner 081 live; extension 083 pending.
-- NOT approved for production execution. No row backfill, Auth/Storage/booking changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';


-- Auth bootstrap functions are preserved, including their privileged execution
-- identity. A body hash alone cannot detect a changed owner or execution ACL.
do $role_contract$
begin
  if (select jsonb_object_agg(rolname,rolbypassrls) from pg_roles
      where rolname in ('postgres','service_role','anon','authenticated'))
      is distinct from '{"postgres":true,"service_role":true,"anon":false,"authenticated":false}'::jsonb then
    raise exception 'profiles_execution_role_contract_mismatch';
  end if;
end;
$role_contract$;

-- Exact live policies, ACLs, column types and preserved RPCs must match this snapshot.
do $preflight$
declare v_actual jsonb; v_expected jsonb; v_f record; v_columns text;
begin
  if not (select relrowsecurity from pg_class where oid='public.profiles'::regclass) then
    raise exception 'profiles_preflight_rls_mismatch';
  end if;
  select jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'cmd',cmd,'using',qual,'check',with_check,'mode',permissive) order by policyname)
    into v_actual from pg_policies where schemaname='public' and tablename='profiles';
  select jsonb_agg(value order by value->>'name') into v_expected from jsonb_array_elements($policies$[{"cmd":"UPDATE","mode":"PERMISSIVE","name":"Admins can update user roles","check":null,"roles":["public"],"using":"(EXISTS ( SELECT 1\n   FROM profiles profiles_1\n  WHERE ((profiles_1.id = auth.uid()) AND ((profiles_1.role)::text = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::text[])))))"},{"cmd":"UPDATE","mode":"PERMISSIVE","name":"Allow authenticated update profiles","check":"true","roles":["authenticated"],"using":"true"},{"cmd":"ALL","mode":"PERMISSIVE","name":"Profiles Access Policy","check":"true","roles":["public"],"using":"true"},{"cmd":"ALL","mode":"PERMISSIVE","name":"Public Profile Access","check":null,"roles":["public"],"using":"true"},{"cmd":"SELECT","mode":"PERMISSIVE","name":"Public profiles are viewable by everyone","check":null,"roles":["public"],"using":"true"},{"cmd":"INSERT","mode":"PERMISSIVE","name":"Users can insert own profile","check":"(auth.uid() = id)","roles":["public"],"using":null},{"cmd":"UPDATE","mode":"PERMISSIVE","name":"Users can update own profile","check":null,"roles":["public"],"using":"(auth.uid() = id)"},{"cmd":"SELECT","mode":"PERMISSIVE","name":"Users can view own profile","check":null,"roles":["public"],"using":"(auth.uid() = id)"},{"cmd":"INSERT","mode":"PERMISSIVE","name":"profiles_insert_anon","check":"true","roles":["anon"],"using":null},{"cmd":"SELECT","mode":"PERMISSIVE","name":"profiles_select_anon","check":null,"roles":["anon"],"using":"true"},{"cmd":"UPDATE","mode":"PERMISSIVE","name":"profiles_update_anon","check":"true","roles":["anon"],"using":"true"}]$policies$::jsonb);
  if v_actual is distinct from v_expected then raise exception 'profiles_preflight_policy_mismatch'; end if;
  if (select relacl::text from pg_class where oid='public.profiles'::regclass) is distinct from '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception 'profiles_preflight_table_acl_mismatch';
  end if;
  select coalesce(jsonb_object_agg(attname,attacl::text) filter(where attacl is not null),'{}'::jsonb)
    into v_actual from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
  if v_actual is distinct from '{}'::jsonb then raise exception 'profiles_preflight_column_acl_mismatch'; end if;
  select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type) order by column_name)
    into v_actual from information_schema.columns where table_schema='public' and table_name='profiles';
  select jsonb_agg(value order by value->>'name') into v_expected from jsonb_array_elements($columns$[{"name":"created_at","type":"timestamp with time zone"},{"name":"user_name","type":"text"},{"name":"ticket_count","type":"bigint"},{"name":"streak_count","type":"bigint"},{"name":"preferred_style","type":"text"},{"name":"speech_speed","type":"text"},{"name":"learning_languages","type":"text"},{"name":"is_first_user","type":"boolean"},{"name":"is_partner","type":"boolean"},{"name":"last_login_date","type":"timestamp with time zone"},{"name":"avatar_url","type":"text"},{"name":"email","type":"text"},{"name":"country_code","type":"text"},{"name":"timezone","type":"text"},{"name":"birth_year","type":"bigint"},{"name":"age_range","type":"text"},{"name":"id","type":"uuid"},{"name":"client_key","type":"text"},{"name":"user_id","type":"uuid"},{"name":"full_name","type":"text"},{"name":"tickets","type":"integer"},{"name":"has_welcome_coupon","type":"boolean"},{"name":"welcome_coupon_used","type":"boolean"},{"name":"current_mode","type":"text"},{"name":"point_balance","type":"integer"},{"name":"nickname","type":"text"},{"name":"role","type":"character varying"},{"name":"welcome_email_sent","type":"boolean"},{"name":"provider","type":"text"},{"name":"kakao_id","type":"text"},{"name":"admin_memo","type":"text"},{"name":"updated_at","type":"timestamp with time zone"},{"name":"bio","type":"text"}]$columns$::jsonb);
  if v_actual is distinct from v_expected then raise exception 'profiles_preflight_columns_mismatch'; end if;
  for v_f in select value as expected from jsonb_array_elements($functions$[{"acl":"{postgres=X/postgres,authenticated=X/postgres}","args":"p_user_id uuid, p_quantity integer, p_reason text, p_source_id uuid","hash":"45a0fa97d4375a6afbaac9dd758907f5","name":"admin_grant_tickets","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"p_user_id uuid, p_role text","hash":"922e0d8424beb4d3c65a38393eb67c6a","name":"admin_set_user_role","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"","hash":"b932d95fb53315d3521fc15648ea116b","name":"dayo_is_admin","owner":"postgres","config":["search_path=\"\""],"return":"boolean","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"p_booking_id uuid","hash":"d2ee4114f6da40714cefa9b382a579f9","name":"get_partner_booking_brief","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"","hash":"88f404d18d9d5a4d5871b815e2ad9253","name":"list_public_partner_profiles","owner":"postgres","config":["search_path=\"\""],"return":"SETOF jsonb","definer":true}]$functions$::jsonb) loop
    select jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'return',pg_get_function_result(p.oid),
      'hash',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text)
      into v_actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_f.expected->>'name'
      and pg_get_function_identity_arguments(p.oid)=v_f.expected->>'args';
    if v_actual is distinct from v_f.expected then raise exception 'profiles_preflight_rpc_mismatch: %',v_f.expected->>'name'; end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('admin_list_profiles','admin_update_profile_memo')) then raise exception 'profiles_preflight_rpc_name_collision'; end if;
end;
$preflight$;

do $lifecycle$
declare v_actual jsonb;
begin
 if current_user <> 'postgres' then raise exception 'profiles_lifecycle_owner_mismatch'; end if;
 select jsonb_build_object('triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function_schema',pn.nspname,'function_name',p.proname,'function_hash',md5(pg_get_functiondef(p.oid)),'function_owner',pg_get_userbyid(p.proowner),'function_acl',p.proacl::text,'function_config',p.proconfig,'function_definer',p.prosecdef) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where not t.tgisinternal and (t.tgrelid='public.profiles'::regclass or t.tgrelid='auth.users'::regclass)),'profile_constraints',(select jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(oid)) order by conname) from pg_constraint where conrelid='public.profiles'::regclass),'partner_table',(select jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='partner_profile_details'),'partner_columns',(select jsonb_agg(jsonb_build_object('table',table_name,'name',column_name,'type',data_type) order by table_name,column_name) from information_schema.columns where table_schema='public' and table_name='partner_profile_details'),'partner_policies',(select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'cmd',cmd,'using',qual,'check',with_check,'mode',permissive) order by tablename,policyname) from pg_policies where schemaname='public' and tablename='partner_profile_details'),'function',(select jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'return',pg_get_function_result(p.oid),'hash',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_partner_profile_completion' and pg_get_function_identity_arguments(p.oid)='p_details jsonb')) into v_actual;
 if v_actual is distinct from $lifecycle_expected${"triggers":[{"name":"on_auth_user_created","table":"users","schema":"auth","enabled":"O","definition":"CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()","function_hash":"9e60737c03d5c2c63d4b754ba6f15e35","function_name":"handle_new_user","function_schema":"public","function_owner":"postgres","function_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","function_config":null,"function_definer":true},{"name":"on_social_user_created","table":"users","schema":"auth","enabled":"O","definition":"CREATE TRIGGER on_social_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_social_user_signup()","function_hash":"e2b6bcb0281bd357afbc952e77aed90b","function_name":"handle_social_user_signup","function_schema":"public","function_owner":"postgres","function_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","function_config":null,"function_definer":true},{"name":"profiles_role_write_guard","table":"profiles","schema":"public","enabled":"O","definition":"CREATE TRIGGER profiles_role_write_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profiles_role_write()","function_hash":"527d0be1fd58ec136fb0b11c3b2c0ced","function_name":"guard_profiles_role_write","function_schema":"public","function_owner":"postgres","function_acl":"{postgres=X/postgres,service_role=X/postgres}","function_config":["search_path=\"\""],"function_definer":false}],"profile_constraints":[{"name":"profiles_email_key","type":"u","definition":"UNIQUE (email)"},{"name":"profiles_pkey","type":"p","definition":"PRIMARY KEY (id)"},{"name":"profiles_user_id_key","type":"u","definition":"UNIQUE (user_id)"}],"partner_table":{"acl":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}","rls":true,"name":"partner_profile_details"},"partner_columns":[{"name":"availability_periods","type":"ARRAY","table":"partner_profile_details"},{"name":"completed_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"created_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"id","type":"uuid","table":"partner_profile_details"},{"name":"korean_level","type":"text","table":"partner_profile_details"},{"name":"location_status","type":"text","table":"partner_profile_details"},{"name":"native_languages","type":"ARRAY","table":"partner_profile_details"},{"name":"other_languages","type":"jsonb","table":"partner_profile_details"},{"name":"partner_guide_acknowledged_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"partner_id","type":"uuid","table":"partner_profile_details"},{"name":"session_languages","type":"ARRAY","table":"partner_profile_details"},{"name":"updated_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"visa_type","type":"text","table":"partner_profile_details"},{"name":"weekly_session_capacity","type":"text","table":"partner_profile_details"}],"partner_policies":[{"cmd":"SELECT","mode":"PERMISSIVE","name":"partner_profile_details_read","check":null,"roles":["authenticated"],"table":"partner_profile_details","using":"(dayo_is_admin() OR ((partner_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND ((p.role)::text = 'partner'::text))))))"}],"function":{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"p_details jsonb","hash":"ee9f46842440fffc9f1afb9a41c12315","name":"save_partner_profile_completion","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true}}$lifecycle_expected$::jsonb then
  raise exception 'profiles_lifecycle_or_partner_snapshot_mismatch';
 end if;
end;
$lifecycle$;

-- The full policy set was verified above; replace legacy PUBLIC/recursive policies.
drop policy "Admins can update user roles" on public.profiles;
drop policy "Allow authenticated update profiles" on public.profiles;
drop policy "Profiles Access Policy" on public.profiles;
drop policy "Public Profile Access" on public.profiles;
drop policy "Public profiles are viewable by everyone" on public.profiles;
drop policy "Users can insert own profile" on public.profiles;
drop policy "Users can update own profile" on public.profiles;
drop policy "Users can view own profile" on public.profiles;
drop policy "profiles_insert_anon" on public.profiles;
drop policy "profiles_select_anon" on public.profiles;
drop policy "profiles_update_anon" on public.profiles;

revoke all privileges on table public.profiles from public, anon, authenticated;
-- Column ACLs can outlive a table REVOKE. Explicitly remove those as well.
do $columns$
declare v_columns text;
begin
  select string_agg(quote_ident(attname),',' order by attnum) into v_columns
    from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped;
  execute 'revoke select ('||v_columns||'), insert ('||v_columns||'), update ('||v_columns||'), references ('||v_columns||') on public.profiles from public, anon, authenticated';
end;
$columns$;

create policy profiles_select_canonical_owner on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_canonical_owner on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select (id,user_id,nickname,user_name,bio,avatar_url,country_code,learning_languages,role,email,provider,ticket_count,tickets,point_balance,has_welcome_coupon,welcome_email_sent,streak_count,last_login_date,speech_speed,preferred_style,created_at,updated_at) on public.profiles to authenticated;
grant update (nickname,user_name,bio,avatar_url,country_code,learning_languages,last_login_date,speech_speed,preferred_style,updated_at) on public.profiles to authenticated;
-- No browser INSERT/DELETE/TRUNCATE, no identity/role/balance/entitlement/admin write.

create function public.admin_list_profiles()
returns table(id uuid,user_id uuid,nickname text,user_name text,email text,role text,
  ticket_count bigint,point_balance integer,created_at timestamptz,provider text,
  avatar_url text,client_key text,learning_languages text,admin_memo text,kakao_id text,bio text)
language plpgsql stable security definer set search_path = ''
as $rpc$
begin
  if coalesce(auth.role(),'') <> 'service_role' and (auth.uid() is null or not public.dayo_is_admin()) then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  return query select p.id,p.user_id,p.nickname,p.user_name,p.email,p.role::text,p.ticket_count,p.point_balance,
    p.created_at,p.provider,p.avatar_url,p.client_key,p.learning_languages,p.admin_memo,p.kakao_id,p.bio from public.profiles p;
end;
$rpc$;

create function public.admin_update_profile_memo(p_profile_id uuid,p_memo text)
returns jsonb language plpgsql security definer set search_path = ''
as $rpc$
declare v_memo text;
begin
  if coalesce(auth.role(),'') <> 'service_role' and (auth.uid() is null or not public.dayo_is_admin()) then
    raise exception 'Admin access required.' using errcode='42501';
  end if;
  if p_profile_id is null or length(coalesce(p_memo,'')) > 10000 then
    raise exception 'Invalid profile memo.' using errcode='22023';
  end if;
  update public.profiles set admin_memo=p_memo,updated_at=pg_catalog.now() where profiles.id=p_profile_id returning admin_memo into v_memo;
  if not found then raise exception 'Profile not found.' using errcode='P0002'; end if;
  return jsonb_build_object('id',p_profile_id,'admin_memo',v_memo);
end;
$rpc$;
revoke all on function public.admin_list_profiles() from public, anon, authenticated, service_role;
revoke all on function public.admin_update_profile_memo(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_list_profiles() to authenticated, service_role;
grant execute on function public.admin_update_profile_memo(uuid,text) to authenticated, service_role;
-- authenticated is a shared DB role. The function guard denies non-admin accounts.
-- Existing admin_set_user_role/admin_grant_tickets and public subset RPCs are untouched.

do $postcondition$
declare v_role text; v_field text; v_f record; v_actual jsonb;
begin
  foreach v_role in array array['anon','authenticated'] loop
    if has_table_privilege(v_role,'public.profiles','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege(v_role,'public.profiles','SELECT') then raise exception 'profiles_postcondition_broad_table_grant: %',v_role; end if;
  end loop;
  if has_any_column_privilege('anon','public.profiles','SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'profiles_postcondition_anon_column_grant'; end if;
  foreach v_field in array array['id','user_id','client_key','email','role','ticket_count','tickets','point_balance','has_welcome_coupon','welcome_email_sent','provider','kakao_id','admin_memo'] loop
    if has_column_privilege('authenticated','public.profiles',v_field,'UPDATE') then raise exception 'profiles_postcondition_private_write: %',v_field; end if;
  end loop;
  foreach v_field in array array['client_key','kakao_id','admin_memo'] loop
    if has_column_privilege('authenticated','public.profiles',v_field,'SELECT') then raise exception 'profiles_postcondition_private_read: %',v_field; end if;
  end loop;
  if (select count(*) from pg_policies where schemaname='public' and tablename='profiles') <> 2 then raise exception 'profiles_postcondition_policy_count'; end if;
  foreach v_field in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if not has_table_privilege('service_role','public.profiles',v_field) then raise exception 'profiles_postcondition_service_role_grant: %',v_field; end if;
  end loop;
  if not (select rolbypassrls from pg_roles where rolname='service_role') then raise exception 'profiles_postcondition_service_role'; end if;
  if has_function_privilege('anon','public.admin_list_profiles()','EXECUTE')
    or has_function_privilege('anon','public.admin_update_profile_memo(uuid,text)','EXECUTE') then raise exception 'profiles_postcondition_anon_rpc'; end if;
  -- Verify preserved helpers' bodies, signatures and ACLs again after the change.
  for v_f in select value as expected from jsonb_array_elements($functions$[{"acl":"{postgres=X/postgres,authenticated=X/postgres}","args":"p_user_id uuid, p_quantity integer, p_reason text, p_source_id uuid","hash":"45a0fa97d4375a6afbaac9dd758907f5","name":"admin_grant_tickets","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"p_user_id uuid, p_role text","hash":"922e0d8424beb4d3c65a38393eb67c6a","name":"admin_set_user_role","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"","hash":"b932d95fb53315d3521fc15648ea116b","name":"dayo_is_admin","owner":"postgres","config":["search_path=\"\""],"return":"boolean","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"p_booking_id uuid","hash":"d2ee4114f6da40714cefa9b382a579f9","name":"get_partner_booking_brief","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true},{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"","hash":"88f404d18d9d5a4d5871b815e2ad9253","name":"list_public_partner_profiles","owner":"postgres","config":["search_path=\"\""],"return":"SETOF jsonb","definer":true}]$functions$::jsonb) loop
    select jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'return',pg_get_function_result(p.oid),
      'hash',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text)
      into v_actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_f.expected->>'name'
      and pg_get_function_identity_arguments(p.oid)=v_f.expected->>'args';
    if v_actual is distinct from v_f.expected then raise exception 'profiles_postcondition_rpc_changed: %',v_f.expected->>'name'; end if;
  end loop;
end;
$postcondition$;
do $lifecycle$
declare v_actual jsonb;
begin
 if current_user <> 'postgres' then raise exception 'profiles_lifecycle_owner_mismatch'; end if;
 select jsonb_build_object('triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function_schema',pn.nspname,'function_name',p.proname,'function_hash',md5(pg_get_functiondef(p.oid)),'function_owner',pg_get_userbyid(p.proowner),'function_acl',p.proacl::text,'function_config',p.proconfig,'function_definer',p.prosecdef) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where not t.tgisinternal and (t.tgrelid='public.profiles'::regclass or t.tgrelid='auth.users'::regclass)),'profile_constraints',(select jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(oid)) order by conname) from pg_constraint where conrelid='public.profiles'::regclass),'partner_table',(select jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='partner_profile_details'),'partner_columns',(select jsonb_agg(jsonb_build_object('table',table_name,'name',column_name,'type',data_type) order by table_name,column_name) from information_schema.columns where table_schema='public' and table_name='partner_profile_details'),'partner_policies',(select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'cmd',cmd,'using',qual,'check',with_check,'mode',permissive) order by tablename,policyname) from pg_policies where schemaname='public' and tablename='partner_profile_details'),'function',(select jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'return',pg_get_function_result(p.oid),'hash',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_partner_profile_completion' and pg_get_function_identity_arguments(p.oid)='p_details jsonb')) into v_actual;
 if v_actual is distinct from $lifecycle_expected${"triggers":[{"name":"on_auth_user_created","table":"users","schema":"auth","enabled":"O","definition":"CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()","function_hash":"9e60737c03d5c2c63d4b754ba6f15e35","function_name":"handle_new_user","function_schema":"public","function_owner":"postgres","function_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","function_config":null,"function_definer":true},{"name":"on_social_user_created","table":"users","schema":"auth","enabled":"O","definition":"CREATE TRIGGER on_social_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_social_user_signup()","function_hash":"e2b6bcb0281bd357afbc952e77aed90b","function_name":"handle_social_user_signup","function_schema":"public","function_owner":"postgres","function_acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","function_config":null,"function_definer":true},{"name":"profiles_role_write_guard","table":"profiles","schema":"public","enabled":"O","definition":"CREATE TRIGGER profiles_role_write_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profiles_role_write()","function_hash":"527d0be1fd58ec136fb0b11c3b2c0ced","function_name":"guard_profiles_role_write","function_schema":"public","function_owner":"postgres","function_acl":"{postgres=X/postgres,service_role=X/postgres}","function_config":["search_path=\"\""],"function_definer":false}],"profile_constraints":[{"name":"profiles_email_key","type":"u","definition":"UNIQUE (email)"},{"name":"profiles_pkey","type":"p","definition":"PRIMARY KEY (id)"},{"name":"profiles_user_id_key","type":"u","definition":"UNIQUE (user_id)"}],"partner_table":{"acl":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}","rls":true,"name":"partner_profile_details"},"partner_columns":[{"name":"availability_periods","type":"ARRAY","table":"partner_profile_details"},{"name":"completed_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"created_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"id","type":"uuid","table":"partner_profile_details"},{"name":"korean_level","type":"text","table":"partner_profile_details"},{"name":"location_status","type":"text","table":"partner_profile_details"},{"name":"native_languages","type":"ARRAY","table":"partner_profile_details"},{"name":"other_languages","type":"jsonb","table":"partner_profile_details"},{"name":"partner_guide_acknowledged_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"partner_id","type":"uuid","table":"partner_profile_details"},{"name":"session_languages","type":"ARRAY","table":"partner_profile_details"},{"name":"updated_at","type":"timestamp with time zone","table":"partner_profile_details"},{"name":"visa_type","type":"text","table":"partner_profile_details"},{"name":"weekly_session_capacity","type":"text","table":"partner_profile_details"}],"partner_policies":[{"cmd":"SELECT","mode":"PERMISSIVE","name":"partner_profile_details_read","check":null,"roles":["authenticated"],"table":"partner_profile_details","using":"(dayo_is_admin() OR ((partner_id = auth.uid()) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND ((p.role)::text = 'partner'::text))))))"}],"function":{"acl":"{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}","args":"p_details jsonb","hash":"ee9f46842440fffc9f1afb9a41c12315","name":"save_partner_profile_completion","owner":"postgres","config":["search_path=\"\""],"return":"jsonb","definer":true}}$lifecycle_expected$::jsonb then
  raise exception 'profiles_lifecycle_or_partner_snapshot_mismatch';
 end if;
end;
$lifecycle$;
notify pgrst, 'reload schema';
commit;
