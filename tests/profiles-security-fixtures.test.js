'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const root=path.join(__dirname,'..'),baseline=require('./fixtures/profiles-security-baseline.json');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/082_profiles_minimum_privileges.sql');
const lifecycle=require('./fixtures/profiles-security-lifecycle.json');
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',p='cccccccc-cccc-4ccc-8ccc-cccccccccccc',admin='dddddddd-dddd-4ddd-8ddd-dddddddddddd',booking='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
let renderedFixtureSQL;let checks=0;const check=(c,m)=>{assert.ok(c,m);checks++};
const quote=x=>"'"+String(x).replace(/'/g,"''")+"'";
async function bootstrap(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema public,auth to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create table public.profiles (${baseline.columns.map(c=>JSON.stringify(c.name)+' '+c.type).join(',')});
 alter table public.profiles add primary key(id);alter table public.profiles add unique(user_id);alter table public.profiles add unique(email);
 create table public.partner_capabilities(partner_id uuid,conversation_languages text[],korean_support_level text);
 create table public.bookings(id uuid,learner_id uuid,partner_user_id uuid,language text,conversation_brief jsonb,status text);
 create table public.ticket_lots(user_id uuid,source text,source_id uuid,quantity_issued integer,quantity_remaining integer,issued_at timestamptz,expires_at timestamptz);
 create table public.credit_ledgers(id uuid,user_id uuid,change_amount integer,ledger_type text,balance_after integer,created_at timestamptz);
 create function public.refresh_ticket_balance_cache(p_user_id uuid) returns integer language plpgsql security definer as $$declare v integer;begin select coalesce(sum(quantity_remaining),0)::int into v from public.ticket_lots where user_id=p_user_id;update public.profiles set ticket_count=v where id=p_user_id;return v;end;$$;
 grant all on public.profiles to anon,authenticated,service_role;
 alter table public.profiles enable row level security;`);
 for(const f of baseline.definitions){await db.exec(f.definition);const meta=baseline.functions.find(x=>x.name===f.name);
  const oid=(await db.query('select oid::int from pg_proc where proname=$1',[f.name])).rows[0].oid;
  const signature=(await db.query('select oid::regprocedure::text as s from pg_proc where oid=$1',[oid])).rows[0].s;
  await db.exec('revoke all on function '+signature+' from public,anon,authenticated,service_role');
  // Preserve the live ACL entry order for the exact baseline comparison.
  for(const entry of meta.acl.slice(1,-1).split(',')){const role=entry.split('=')[0];if(role==='postgres')continue;await db.exec('grant execute on function '+signature+' to '+role);}
 }
 await db.exec('alter default privileges in schema public grant all on tables to service_role');
 await db.exec(lifecycle.partner_081_sql);
 await db.exec(lifecycle.partner_definition);
 for(const policy of baseline.policies){await db.exec('create policy '+JSON.stringify(policy.name)+' on public.profiles as '+policy.mode+' for '+policy.cmd+' to '+policy.roles.join(',')+(policy.using?' using ('+policy.using+')':'')+(policy.check?' with check ('+policy.check+')':''));}
 for(const [id,nick,role] of [[a,'User A','user'],[b,'User B','user'],[p,'Partner','partner'],[admin,'Admin','admin']])await db.query(`insert into public.profiles(id,user_id,nickname,user_name,email,role,ticket_count,tickets,point_balance,created_at,updated_at,provider,admin_memo,client_key,kakao_id,has_welcome_coupon) values($1,$1,$2,$2,$3,$4,2,2,5,now(),now(),'email','private memo','private key','private social id',true)`,[id,nick,nick.replace(' ','').toLowerCase()+'@fixture.test',role]);
 await db.query("insert into public.partner_capabilities values($1,array['en'],'basic')",[p]);
 await db.query("insert into public.bookings values($1,$2,$3,'en','{\"topics\":[\"food\"]}','confirmed')",[booking,a,p]);
 await db.exec('create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb)');
 for(const definition of lifecycle.auth_definitions)await db.exec(definition.definition);
 await db.exec(lifecycle.guard_definition);
 for(const t of lifecycle.snapshot.triggers){
  const sig='public.'+t.function_name+'()';
  if(t.function_acl.startsWith('{=X/postgres,'))await db.exec('grant execute on function '+sig+' to public');
  else await db.exec('revoke all on function '+sig+' from public,anon,authenticated,service_role');
  for(const entry of t.function_acl.slice(1,-1).split(',')){const role=entry.split('=')[0];if(role==='postgres')continue;await db.exec('grant execute on function '+sig+' to '+(role||'public'));}
 }

 for(const trigger of lifecycle.snapshot.triggers)await db.exec(trigger.definition);
 return db;
}
async function as(db,role,id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id||'',role]);await db.exec('set role '+role);}
async function denied(db,query,values=[]){await assert.rejects(db.query(query,values),e=>e.code==='42501');checks++;}
async function database(){
 const db=await bootstrap();
 const before=(await db.query('select jsonb_agg(to_jsonb(p) order by id)::text as rows from public.profiles p')).rows[0].rows;
 // PGlite deparses the legacy varchar-array cast differently. Keep production SQL strict;
 // adapt only this known legacy expression in the LOCAL fixture expectation.
 const policyRows=(await db.query("select policyname as name,qual as using from pg_policies where schemaname='public' and tablename='profiles'")).rows;
 const localPolicies=baseline.policies.map(policy=>({...policy}));
 const localAdmin=policyRows.find(p=>p.name==='Admins can update user roles');
 check(localAdmin.using.includes('auth.uid()')&&localAdmin.using.includes("'admin'")&&localAdmin.using.includes("'super_admin'"),'local legacy expression retains original identity/roles');
 localPolicies.find(p=>p.name===localAdmin.name).using=localAdmin.using;
 const localSQL=sql.replace(JSON.stringify(baseline.policies),JSON.stringify(localPolicies));
 const localFunctions=[];
 for(const meta of baseline.functions){const f=(await db.query("select md5(pg_get_functiondef(oid)) as hash,pg_get_functiondef(oid) as definition from pg_proc where proname=$1",[meta.name])).rows[0];const expected=baseline.definitions.find(d=>d.name===meta.name).definition;check(f.definition.replace(/\r\n/g,'\n')===expected.replace(/\r\n/g,'\n'),'local RPC body differs only by CRLF rendering: '+meta.name);localFunctions.push({...meta,hash:f.hash});}
 const localLifecycle=(await db.query(lifecycle.collect+' as snapshot')).rows[0].snapshot;
 for(const trigger of lifecycle.snapshot.triggers){const actual=localLifecycle.triggers.find(t=>t.name===trigger.name);check(actual&&actual.definition===trigger.definition&&actual.enabled===trigger.enabled,'live trigger identity retained locally: '+trigger.name);}
 const renderedSQL=localSQL.split(JSON.stringify(baseline.functions)).join(JSON.stringify(localFunctions)).split(JSON.stringify(lifecycle.snapshot)).join(JSON.stringify(localLifecycle));
 renderedFixtureSQL=renderedSQL;await db.exec(renderedSQL);
 const after=(await db.query('select jsonb_agg(to_jsonb(p) order by id)::text as rows from public.profiles p')).rows[0].rows;
 const writable=new Set(['nickname','user_name','bio','avatar_url','country_code','learning_languages','last_login_date','speech_speed','preferred_style','updated_at']);
 for(const col of baseline.columns){const privileges=(await db.query("select has_column_privilege('authenticated','public.profiles',$1,'UPDATE') as u,has_column_privilege('authenticated','public.profiles',$1,'INSERT,REFERENCES') as other",[col.name])).rows[0];check(privileges.u===writable.has(col.name)&&!privileges.other,'exact column write contract: '+col.name);}
 check(before===after,'migration performs no profile backfill');
 await as(db,'anon');
 for(const q of ['select id from public.profiles',`insert into public.profiles(id) values('${a}')`,`update public.profiles set nickname='wrong'`,`delete from public.profiles`,`truncate public.profiles`])await denied(db,q);
 await denied(db,'select * from public.admin_list_profiles()');
 await as(db,'authenticated',a);
 check((await db.query('select id,nickname from public.profiles')).rows.length===1,'owner sees only own canonical row');
 check((await db.query('select id from public.profiles where id=$1',[b])).rows.length===0,'other row is hidden');
 check((await db.query("update public.profiles set nickname='New A',bio='About me',avatar_url='/images/default.png',speech_speed='slow',preferred_style='casual' where id=$1 returning nickname",[a])).rows[0].nickname==='New A','allowed own columns update');
 check((await db.query("update public.profiles set nickname='stolen' where id=$1 returning id",[b])).rows.length===0,'other profile update affects no rows');
 for(const [col,val] of [['role',"'admin'"],['ticket_count','99'],['point_balance','99'],['admin_memo',"'spoof'"],['email',"'spoof@fixture.test'"],['user_id',`'${b}'`],['has_welcome_coupon','false']])await denied(db,`update public.profiles set ${col}=${val} where id=$1`,[a]);
 for(const col of ['admin_memo','client_key','kakao_id'])await denied(db,'select '+col+' from public.profiles');
 await denied(db,'select * from public.profiles');
 await denied(db,'select * from public.admin_list_profiles()');
 await denied(db,'select public.admin_update_profile_memo($1,$2)',[b,'not admin']);
 const discovery=(await db.query('select * from public.list_public_partner_profiles()')).rows[0].list_public_partner_profiles;
 check(discovery.nickname==='DayO Partner'&&!('email' in discovery)&&!('admin_memo' in discovery),'public subset discovery stays private');
 await as(db,'authenticated',p);
 const brief=(await db.query('select public.get_partner_booking_brief($1) as brief',[booking])).rows[0].brief;
 check(brief.learner_display_name==='New A'&&!('email' in brief),'confirmed assigned Partner gets permitted booking brief');
 await as(db,'authenticated',b);
 check((await db.query('select public.get_partner_booking_brief($1) as brief',[booking])).rows[0].brief===null,'wrong participant denied');
 await as(db,'authenticated',admin);
 const list=(await db.query('select id,email,admin_memo from public.admin_list_profiles()')).rows;
 check(list.length===4,'admin gets operating fields through guarded RPC');
 check((await db.query('select public.admin_update_profile_memo($1,$2) as r',[a,'new memo'])).rows[0].r.admin_memo==='new memo','admin memo RPC writes exact target');
 const roleChange=(await db.query("select public.admin_set_user_role($1,'partner') as r",[b])).rows[0].r;
 check(roleChange.changed&&roleChange.role==='partner','existing admin role RPC works with live role guard');
 await db.query("select public.admin_set_user_role($1,'user')",[b]);
 await denied(db,'update public.profiles set ticket_count=100 where id=$1',[a]);
 // Reuse the captured production admin_grant_tickets body, not a new balance-write RPC.
 const grantId='ffffffff-ffff-4fff-8fff-ffffffffffff';
 const grant=(await db.query('select public.admin_grant_tickets($1,1,$2,$3) as r',[a,'fixture',grantId])).rows[0].r;
 check(grant.success&&grant.added_tickets===1,'existing ledger grant RPC stays functional');
 check((await db.query('select public.admin_grant_tickets($1,1,$2,$3) as r',[a,'fixture',grantId])).rows[0].r.duplicate,'existing grant idempotency retained');
 await as(db,'service_role');
 check((await db.query('select id from public.profiles')).rows.length===4,'service role retains server operations');
 check((await db.query('select count(*)::int as n from public.admin_list_profiles()')).rows[0].n===4,'service can use admin data RPC');
 await as(db,'authenticated',a);
 await denied(db,"select public.admin_set_user_role($1,'admin')",[b]);
 for(const col of ['welcome_email_sent','is_partner','is_first_user','welcome_coupon_used'])await denied(db,'update public.profiles set '+col+'=true where id=$1',[a]);
 await as(db,'authenticated',p);
 check((await db.query("update public.profiles set nickname='Partner Display',bio='Partner bio',avatar_url='/images/partner.png',learning_languages='en',country_code='US' where id=$1 returning nickname",[p])).rows[0].nickname==='Partner Display','Partner allowed profile fields save');
 const details={location_status:'korea',visa_type:'Other visa',native_languages:['English'],other_languages:[],session_languages:['English'],korean_level:'basic',availability_periods:['weekday_evening'],weekly_session_capacity:'1-2',guide_acknowledged:true,partner_id:b,completed_at:'2000-01-01'};
 const completion=(await db.query('select public.save_partner_profile_completion($1::jsonb) as r',[JSON.stringify(details)])).rows[0].r;
 check(completion.partner_id===p&&completion.session_languages[0]==='English'&&completion.korean_level==='basic','live 081 completion RPC saves self-declared language/support');
 check(completion.completed_at!=='2000-01-01'&&!!completion.partner_guide_acknowledged_at,'caller identity/completion timestamps are ignored');
 await denied(db,'update public.partner_profile_details set completed_at=now() where partner_id=$1',[p]);
 await denied(db,"update public.profiles set role='admin' where id=$1",[p]);
 await as(db,'authenticated',a);await denied(db,'select public.save_partner_profile_completion($1::jsonb)',[JSON.stringify(details)]);
 await as(db,'service_role');
 check((await db.query('update public.profiles set welcome_email_sent=true where id=$1 returning welcome_email_sent',[a])).rows[0].welcome_email_sent,'service role persists welcome delivery flag after RLS closes');
 await db.query('update public.profiles set welcome_email_sent=false where id in ($1,$2)',[a,b]);
 await welcomeHandler(db);
 await db.exec('reset role');
 const signup='11111111-1111-4111-8111-111111111111';
 await db.query("insert into auth.users values($1,'new@fixture.test','{\"name\":\"New profile\"}','{\"provider\":\"email\"}')",[signup]);
 await as(db,'authenticated',signup);
 const created=(await db.query('select id,user_id,nickname,role,ticket_count from public.profiles')).rows[0];
 check(created.id===signup&&created.role==='user'&&Number(created.ticket_count)===0,'unchanged Auth triggers bootstrap canonical id/zero-ticket profile; legacy user_id may be null');
 await db.exec('reset role');
 // Exercise the pending 082 completion body locally, without changing 081/082 files or production.
 await db.exec(lifecycle.partner_082_details_sql);
 await db.exec(lifecycle.partner_082_completion_function);
 await as(db,'authenticated',p);
 const nextDetails={...details,country:'South Korea',city:'Seoul',other_languages:[{language:'French',level:'conversational'}],session_languages:['English','French']};
 const next=(await db.query('select public.save_partner_profile_completion($1::jsonb) as r',[JSON.stringify(nextDetails)])).rows[0].r;
 check(next.partner_id===p&&next.country==='South Korea'&&next.city==='Seoul'&&next.session_languages.includes('French'),'pending 082 completion body remains compatible after profiles RLS closes');
 check(next.completed_at===completion.completed_at,'082 keeps initial completion timestamp');
 await db.close();
 // Policy drift must abort before privileges or new functions change.
 const drift=await bootstrap();await drift.exec('create policy unexpected_open on public.profiles for select using(true)');
 await assert.rejects(drift.exec(renderedSQL),/profiles_preflight_policy_mismatch/);await drift.exec('rollback');
 check((await drift.query("select has_table_privilege('anon','public.profiles','UPDATE') as allowed")).rows[0].allowed,'failed transaction preserves baseline ACL');
 check((await drift.query("select count(*)::int as n from pg_proc where proname='admin_list_profiles'")).rows[0].n===0,'drift leaves no partial RPC');
 await drift.close();
 for(const [change,error] of [
  ['alter table public.profiles disable row level security','profiles_preflight_rls_mismatch'],
  ['grant update(nickname) on public.profiles to anon','profiles_preflight_column_acl_mismatch'],
  ['alter table public.profiles add column unexpected text','profiles_preflight_columns_mismatch'],
  ['revoke execute on function public.dayo_is_admin() from authenticated','profiles_preflight_rpc_mismatch'],
  ['revoke update on public.profiles from anon','profiles_preflight_table_acl_mismatch'],
  ["alter function public.dayo_is_admin() set search_path to public",'profiles_preflight_rpc_mismatch'],
  ['create function public.admin_list_profiles() returns integer language sql as $$select 1$$','profiles_preflight_rpc_name_collision'],
  ['alter table public.profiles disable trigger profiles_role_write_guard','profiles_lifecycle_or_partner_snapshot_mismatch'],
  ['alter table public.partner_profile_details add column unexpected text','profiles_lifecycle_or_partner_snapshot_mismatch']
 ]){const changed=await bootstrap();await changed.exec(change);await assert.rejects(changed.exec(renderedSQL),new RegExp(error));await changed.exec('rollback');check((await changed.query("select count(*)::int as n from pg_proc where proname='admin_update_profile_memo'")).rows[0].n===0,'preflight drift creates no partial functions: '+error);await changed.close();}
}
async function triggerMetadataCoverage(){
 // Owner/ACL drift must fail closed, without partially applying the migration.
 const db=await bootstrap();
 const before=(await db.query(lifecycle.collect+' as snapshot')).rows[0].snapshot;
 await db.exec('grant create on schema public to authenticated;alter function public.handle_new_user() owner to authenticated;revoke execute on function public.handle_social_user_signup() from public');
 const after=(await db.query(lifecycle.collect+' as snapshot')).rows[0].snapshot;
 check(JSON.stringify(before)!==JSON.stringify(after),'lifecycle snapshot detects trigger helper owner/ACL drift');
 const rendered=renderedFixtureSQL;
 await assert.rejects(db.exec(rendered),/profiles_lifecycle_or_partner_snapshot_mismatch/);await db.exec('rollback');
 check((await db.query("select count(*)::int as n from pg_proc where proname='admin_list_profiles'")).rows[0].n===0,'owner/ACL drift creates no partial admin RPC');
 const owner=(await db.query("select pg_get_userbyid(proowner) as owner from pg_proc where proname='handle_new_user'")).rows[0].owner;
 check(owner==='authenticated','diagnostic owner change is real, not just snapshot formatting');
 await db.close();
 console.log('Auth helper owner/ACL drift is detected and rejected atomically.');
}
async function welcomeHandler(db){
 const helperModule={exports:{}},calls=[],updates=[];let providerFails=false,stateFails=false,verified=true,profileMissing=false,profileReadFails=false;
 let identity={id:a,email:'usera@fixture.test',created_at:new Date().toISOString()};
 const service={from(table){assert.equal(table,'profiles');let payload=null,target=null;return {
  update(value){payload=value;return this},select(){return this},eq(key,value){assert.equal(key,'id');target=value;return this},
  async maybeSingle(){await as(db,'service_role');const result=await db.query('select nickname,user_name,welcome_email_sent from public.profiles where id=$1',[target]);return {data:profileMissing?null:result.rows[0]||null,error:profileReadFails?{message:'fixture read failure'}:null}},
  async single(){check(Object.keys(payload).join(',')==='welcome_email_sent'&&payload.welcome_email_sent===true,'server welcome write has no identity/balance/role payload');updates.push(target);if(stateFails)return {data:null,error:{message:'fixture persistence failure'}};await as(db,'service_role');const result=await db.query('update public.profiles set welcome_email_sent=$1 where id=$2 returning id,welcome_email_sent',[payload.welcome_email_sent,target]);return {data:result.rows[0]||null,error:null}}
 }}};
 const env={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',RESEND_API_KEY:'fixture-provider'};
 const createClientMock=(url,key)=>{
  assert.equal(url,'https://fixture.invalid');
  if(key==='fixture-service')return service;
  assert.equal(key,'fixture-public');
  return {auth:{getUser:async()=>({data:{user:verified?identity:null},error:verified?null:{message:'fixture invalid token'}})}};
 };
 vm.runInNewContext(read('api/_lib/welcome-profile-state.js'),{
  module:helperModule,exports:helperModule.exports,process:{env},Date,Error,
  require(name){assert.equal(name,'@supabase/supabase-js');return {createClient:createClientMock};}
 });
 const handlerModule={exports:{}};
 vm.runInNewContext(read('api/send-welcome.js'),{module:handlerModule,exports:handlerModule.exports,process:{env},JSON,String,Promise,require(name){assert.equal(name,'./_lib/welcome-profile-state');return helperModule.exports},fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');calls.push({options,payload:JSON.parse(options.body)});return {ok:!providerFails,json:async()=>providerFails?{message:'fixture provider failure'}:{id:'fixture-mail'}};}});
 async function invoke(body={},authorization='Bearer fixture-session'){let status=0,reply;await handlerModule.exports({method:'POST',headers:authorization?{authorization}:{},body},{setHeader(){},set statusCode(v){status=v},get statusCode(){return status},end(value){reply=JSON.parse(value)}});return {status,reply};}
 check((await invoke({},'')).status===401&&calls.length===0,'anonymous welcome cannot invoke provider or profile write');
 verified=false;check((await invoke()).status===401&&updates.length===0,'unverified bearer cannot write welcome state');verified=true;
 check((await invoke({email:'other@fixture.test'})).status===403&&calls.length===0,'client recipient spoofing denied');
 profileMissing=true;check((await invoke()).status===503&&calls.length===0&&updates.length===0,'missing canonical profile fails before email/state write');profileMissing=false;
 profileReadFails=true;check((await invoke()).status===503&&calls.length===0&&updates.length===0,'profile read error fails before email/state write');profileReadFails=false;
 const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY;delete env.SUPABASE_SERVICE_ROLE_KEY;
 check((await invoke()).status===503&&calls.length===0&&updates.length===0,'missing server credential fails closed before email');env.SUPABASE_SERVICE_ROLE_KEY=serviceKey;
 providerFails=true;check((await invoke()).status===502&&updates.length===0,'provider failure does not mark welcome sent');providerFails=false;
 const sent=await invoke({nickname:'Client spoof'});
 check(sent.status===200&&sent.reply.ok&&updates.length===1&&updates[0]===a,'verified welcome succeeds with service-role flag storage');
 check(calls[1].payload.to[0]===identity.email&&!calls[1].payload.html.includes('Client spoof'),'recipient and display name come from verified identity/profile');
 check(calls[0].options.headers['Idempotency-Key']===calls[1].options.headers['Idempotency-Key'],'retry retains provider idempotency key');
 check((await invoke()).reply.skipped&&calls.length===2,'already-sent welcome skips provider after refresh');
 identity={...identity,id:b,email:'userb@fixture.test'};stateFails=true;
 check((await invoke()).status===503,'flag persistence failure is reported for retry');stateFails=false;
 check((await invoke()).status===200&&calls[2].options.headers['Idempotency-Key']===calls[3].options.headers['Idempotency-Key'],'flag retry uses same recipient event key');
 identity={...identity,created_at:'2000-01-01'};check((await invoke()).reply.skipped&&calls.length===4,'old signup does not receive a new welcome request');
 for(const created_at of ['invalid-date',new Date(Date.now()+3600000).toISOString()]){
  identity={...identity,created_at};check((await invoke()).reply.skipped&&calls.length===4,'invalid/future verified signup skips provider');
 }
 const source=read('public/supabase-client.js'),start=source.indexOf('  window.DayOSendWelcomeEmail ='),end=source.indexOf('  window.fetchAuthProfile =',start),requests=[];let marked=0;
 const sandbox={window:{supabaseClient:{auth:{getSession:async()=>({data:{session:{user:{id:a},access_token:'fixture-session'}}})}},location:{hostname:'fixture.invalid'}},isRecentSignup:()=>true,hasSentWelcomeEmail:()=>false,welcomeEmailBusy:{},markWelcomeEmailSent:()=>marked++,fetch:async(url,options)=>{requests.push({url,options});return {ok:true}},JSON,String,Promise,console:{error(){}}};
 vm.runInNewContext(source.slice(start,end),sandbox);
 await sandbox.window.DayOSendWelcomeEmail({id:a,email:'usera@fixture.test'},{nickname:'A'});
 check(requests[0].options.headers.Authorization==='Bearer fixture-session'&&marked===1,'real browser welcome uses existing authenticated session and local dedup');
 sandbox.window.supabaseClient.auth.getSession=async()=>({data:{session:null}});await sandbox.window.DayOSendWelcomeEmail({id:a,email:'usera@fixture.test'},{});
 check(requests.length===1,'browser without session sends no welcome API request');
 sandbox.window.supabaseClient.auth.getSession=async()=>({data:{session:{user:{id:b},access_token:'fixture-other-session'}}});
 await sandbox.window.DayOSendWelcomeEmail({id:a,email:'usera@fixture.test'},{});
 check(requests.length===1&&marked===1,'mismatched browser identity neither sends email nor marks local delivery');
}

async function adminContract(){
 const {createClient}=require('@supabase/supabase-js'),ts=require('typescript'),requests=[];
 const client=createClient('https://fixture.invalid','fixture-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{requests.push({url:new URL(url),options});return new Response(options.method==='HEAD'?null:JSON.stringify([{id:a,nickname:'User A'}]),{status:200,headers:{'content-type':'application/json','content-range':'0-0/1'}});}}});
 const module={exports:{}};
 const compiled=ts.transpileModule(read('admin/src/lib/admin-data.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(compiled,{module,exports:module.exports,require(name){assert.equal(name,'@/lib/supabase');return {supabase:client};},console,URL,Date});
 const count=await module.exports.adminProfiles({head:true,count:'exact'}).select('id').eq('role','partner');
 check(count.count===1&&requests[0].options.method==='HEAD','admin RPC exact HEAD count retains SDK contract');
 check(requests[0].url.pathname.endsWith('/rpc/admin_list_profiles')&&requests[0].url.searchParams.get('role')==='eq.partner'&&requests[0].url.searchParams.get('select')==='id','admin count filters use guarded RPC');
 const own=await module.exports.adminProfiles().select('id,nickname').eq('id',a).maybeSingle();
 check(!own.error&&own.data.id===a&&requests[1].options.method==='POST','admin detail RPC preserves filtered maybeSingle result');
 for(const file of ['admin/src/app/admin/dashboard/page.tsx','admin/src/app/admin/tech-issues/page.tsx','admin/src/components/admin/partner-detail-modal.tsx'])check(!/from\("profiles"\)\s*\.select/.test(read(file)),'admin operating read uses RPC: '+file);
}
async function browserHelper(){
 const src=read('public/profile-store.js');
 const store=new Map([['dayo.authUserId',a]]),writes=[];let selected='';
 const sandbox={window:{localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))},crypto:{randomUUID:()=>a},location:{pathname:'/mypage'}},document:{querySelectorAll:()=>[],dispatchEvent(){},querySelector:()=>null},CustomEvent:class{constructor(t,o){this.type=t;this.detail=o&&o.detail}},console:{warn(){}},Date,Array,Promise,setTimeout,clearTimeout};
 vm.createContext(sandbox);vm.runInContext(src.slice(0,src.lastIndexOf('ready().then')).replace(/^import .*;$/m,''),sandbox);
 // Execute real helper functions with an authenticated DB mock, not a second implementation.
 sandbox.profileCache={id:a,nickname:'A',ticket_count:2,point_balance:5};
 sandbox.clientMock={from(table){assert.equal(table,'profiles');return {update(payload){writes.push(payload);return this},eq(k,v){assert.equal(k,'id');assert.equal(v,a);return this},select(cols){selected=cols;return this},single:async()=>({data:{id:a,nickname:'Changed',ticket_count:2,point_balance:5},error:null})}}};
 sandbox.getClient=()=>sandbox.clientMock;
 // Stale local UID never authorizes an anonymous profile write.
 await sandbox.fetchOrCreateProfile();await sandbox.updateProfile({nickname:'Anonymous',role:'admin',ticket_count:99},{skipEvents:true});
 check(writes.length===0,'anonymous preferences do not touch profiles');
 sandbox.authUser={id:a};sandbox.profileCache={id:a,nickname:'A',ticket_count:2,point_balance:5};
 await sandbox.updateProfile({nickname:'Changed',bio:'Hello',avatar_url:'/images/avatar.png',speech_speed:'native',preferred_style:'correct',preferred_request:'gentle',id:b,email:'other@test',role:'admin',ticket_count:99,point_balance:99,admin_memo:'spoof'},{skipEvents:true});
 check(writes.length===1&&writes[0].nickname==='Changed','authenticated nickname/profile save');
 check(!('role' in writes[0])&&!('email' in writes[0])&&!('ticket_count' in writes[0])&&!('preferred_request' in writes[0]),'only audited columns enter remote payload');
 check(sandbox.profileCache.ticket_count===2&&sandbox.profileCache.point_balance===5,'privileged input does not alter local balance');
 check(selected!=='*'&&!selected.includes('admin_memo')&&!selected.includes('client_key'),'private fields absent from own read contract');
 await assert.rejects(sandbox.updateProfile({avatar_url:'javascript:alert(1)'}),/invalid_profile_avatar_url/);
 await assert.rejects(sandbox.updateProfile({speech_speed:'arbitrary'}),/invalid_profile_speech_speed/);
 const beforeInvalid=JSON.stringify(sandbox.profileCache),beforeLocal=JSON.stringify([...store.entries()]),beforeWrites=writes.length;
 for(const [payload,error] of [
  [{nickname:'x'.repeat(51)},'nickname'],[{user_name:100},'user_name'],[{bio:'x'.repeat(1001)},'bio'],
  [{learning_languages:'x'.repeat(201)},'learning_languages'],[{country_code:'USA'},'country_code'],
  [{preferred_style:'unsafe'},'preferred_style'],[{preferred_request:'unsafe'},'preferred_request'],
  [{avatar_url:'//external.invalid/avatar.png'},'avatar_url'],[{avatar_url:'data:image/svg+xml;base64,AAAA'},'avatar_url']
 ]){
  await assert.rejects(sandbox.updateProfile(payload),new RegExp('invalid_profile_'+error));
  check(writes.length===beforeWrites&&JSON.stringify(sandbox.profileCache)===beforeInvalid&&JSON.stringify([...store.entries()])===beforeLocal,'invalid profile data rejected before remote/cache/local mutation: '+error);
 }
 await sandbox.updateProfile({id:b,user_id:b,email:'spoof@fixture.test',role:'admin',ticket_count:99,tickets:99,point_balance:99,welcome_email_sent:true,admin_memo:'spoof'},{skipEvents:true});
 check(writes.length===beforeWrites&&sandbox.profileCache.ticket_count===2&&sandbox.profileCache.point_balance===5&&!sandbox.profileCache.admin_memo,'internal-only payload performs no profile write or privilege cache mutation');
 sandbox.profileCache={...sandbox.profileCache,id:b};store.set('dayo.authUserId',b);
 await sandbox.updateProfile({nickname:'Actual Auth identity'},{skipEvents:true});
 check(writes.length===beforeWrites+1&&sandbox.profileCache.id===a,'stale cached identity cannot change authenticated UPDATE target');
 const reads=[];sandbox.getClient=()=>({from(table){assert.equal(table,'profiles');return {select(cols){reads.push(cols);return this},eq(){return this},maybeSingle:async()=>({data:{id:a,nickname:'DB A'},error:null})}}});
 check((await sandbox.waitForTriggerProfile(sandbox.getClient(),a)).nickname==='DB A','My Page boot reads own canonical profile');
 check(reads.every(x=>x!=='*'),'no wildcard profile read');
 check(src===read('profile-store.js')&&read('public/supabase-client.js')===read('supabase-client.js'),'canonical public/root mirrors match');
 const adminSrc=read('admin/src/lib/admin-data.ts');
 check(adminSrc.includes('rpc("admin_list_profiles"')&&!/from\("profiles"\)\s*\.select/.test(adminSrc),'admin reads routed through RPC');
 // The three overlapping pre-existing write hunks are intentionally not overwritten.
 check(adminSrc.includes('rpc("admin_update_profile_memo"')&&!adminSrc.includes('admin_set_profile_memo'),'memo saves use the actual guarded RPC');
 check(read('admin/src/components/admin/partner-detail-modal.tsx').includes('typeof partner.partner_status !== "string"'),'missing legacy partner status cannot be fabricated or written');
 check(!/alter\s+(?:table\s+)?auth\.|storage\.objects|storage\.buckets/i.test(sql),'migration excludes Auth/Storage');
}
(async()=>{await database();await browserHelper();await adminContract();await triggerMetadataCoverage();console.log('Profiles security fixtures passed: '+checks+' checks; A-I, no row backfill, preserved subset/ledger RPCs, exact preflight drift rollback. Existing ticket issuance uses its preserved ledger RPC; unsupported legacy status stays disabled.');})().catch(e=>{console.error(e.stack);process.exit(1)});
