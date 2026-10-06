'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const baseline=require('./conversation-matching-production-contract.json');
const cp=require('node:child_process');
const previous=require('./fixtures/internal-test-learner-production-contract.json');
const sql=read('supabase/migrations/090_conversation_preferences_matching.sql');
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',partner='cccccccc-cccc-4ccc-8ccc-cccccccccccc',partner2='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const prefs={schema_version:1,comfortable_purposes:['travel','work_school'],interests:['music','travel'],conversation_styles:['encourage']};
const brief={schema_version:1,korean_support_preference:'required',purposes:['travel'],interests:['music','movies'],conversation_style:'encourage'};
let checks=0;function check(v,label){assert.ok(v,label);checks++;}
const plain=v=>JSON.parse(JSON.stringify(v));const quote=v=>"'"+v.replace(/'/g,"''")+"'";
async function actor(db,id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id||'',role]);await db.exec('set role '+role);}
async function bootstrap(apply=true){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create table auth.users(id uuid primary key);
 create table profiles(id uuid primary key,user_id uuid,nickname text,email text,bio text,avatar_url text,role varchar,ticket_count integer default 0);
 create function dayo_is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
 create table availability_slots(id uuid primary key default gen_random_uuid(),partner_id uuid,slot_time text,status text default 'available',updated_at timestamptz default now());
 create table partner_capabilities(partner_id uuid primary key,conversation_languages text[],korean_support_level text,updated_at timestamptz,updated_by uuid);
 create table ticket_lots(id uuid primary key default gen_random_uuid(),user_id uuid,source text,source_id uuid,quantity_issued int,quantity_remaining int,issued_at timestamptz default now(),expires_at timestamptz,updated_at timestamptz default now());
 create table ticket_allocations(id uuid primary key default gen_random_uuid(),booking_id uuid unique,ticket_lot_id uuid,quantity int,refunded_at timestamptz,refund_reason text,created_at timestamptz default now());
 create table ticket_consumption_pre_cutover_bookings(booking_id uuid);
 create function refresh_ticket_balance_cache(uuid) returns integer language plpgsql security definer set search_path='' as $$declare v int;begin select coalesce(sum(quantity_remaining),0)::int into v from public.ticket_lots where user_id=$1 and (expires_at is null or expires_at>now());update public.profiles set ticket_count=v where id=$1;return v;end$$;`);
 for(const table of ['bookings','partner_profile_details']){
  const columns=baseline.columns.filter(c=>c.table===table).map(c=>JSON.stringify(c.column)+' '+(c.type==='ARRAY'?'text[]':c.type)+(c.default?' default '+c.default:''));
  await db.exec('create table public.'+table+'('+columns.join(',')+')');
  await db.exec('alter table '+table+' add primary key(id)');
 }
 await db.exec('alter table partner_profile_details add unique(partner_id)');
 for(const id of [uid,other,partner,partner2]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into profiles(id,user_id,nickname,role) values($1,$1,$2,$3)',[id,id===uid?'User':'Partner',[uid,other].includes(id)?'user':'partner']);}
 await db.exec(read('supabase/migrations/085_checkout_private_preparation.sql'));
 // Current bodies from the live catalog, not reconstructed booking/payment logic.
 for(const f of previous.functions||[])if(f.signature==='dayo_can_create_preopen_booking()')await db.exec(f.definition);
 if(!(await db.query("select to_regprocedure('dayo_can_create_preopen_booking()') as fn")).rows[0].fn){
  const gate=read('supabase/migrations/049_preopen_booking_gate.sql');
  await db.exec(gate.slice(gate.indexOf('create or replace function public.dayo_can_create_preopen_booking()'),gate.indexOf('create or replace function public.enforce_preopen_booking_confirmation()')));
 }
 for(const f of baseline.functions)await db.exec(f.definition);
 for(const c of baseline.constraints){if(!(await db.query('select 1 from pg_constraint where conname=$1',[c.name])).rows.length)await db.exec('alter table '+c.table+' add constraint '+JSON.stringify(c.name)+' '+c.definition);}
 for(const t of baseline.table_privileges){await db.exec('grant select on '+t.relname+' to authenticated');if(t.relname!=='user_conversation_preferences')await db.exec('grant all on '+t.relname+' to service_role');}
 for(const t of baseline.triggers.filter(t=>t.name==='enforce_booking_four_hour_minimum')){await db.exec(t.function);await db.exec(t.definition);}
 for(const table of ['bookings','partner_profile_details']){
  await db.exec('alter table '+table+' enable row level security');
  for(const p of baseline.policies.filter(p=>p.tablename===table))await db.exec('create policy '+JSON.stringify(p.policyname)+' on '+table+' as '+p.permissive+' for '+p.cmd+' to '+p.roles.join(',')+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':''));
 }
 await db.exec('alter table profiles enable row level security;grant select on profiles to authenticated;create policy owner_profile on profiles for select to authenticated using(id=auth.uid())');
 for(const g of baseline.grants)await db.exec('grant '+g.privilege_type+'('+JSON.stringify(g.column_name)+') on '+g.table_name+' to '+g.grantee);
 for(const f of baseline.functions){const sig=f.name+'('+f.args.split(',').filter(Boolean).map(a=>a.trim().split(' ').at(-1)).join(',')+')';await db.exec('revoke all on function '+sig+' from public,anon,authenticated,service_role');for(const entry of f.acl.slice(1,-1).split(',')){const role=entry.split('=')[0];if(role!=='postgres')await db.exec('grant execute on function '+sig+' to '+(role||'public'));}}
 let local=sql;
 // Known PGlite deparse differences only; every current function body is checked before adjusting hashes.
 for(const f of baseline.functions){const sig=f.name+'('+f.args.split(',').filter(Boolean).map(a=>a.trim().split(' ').at(-1)).join(',')+')';const actual=(await db.query('select pg_get_functiondef($1::regprocedure) as body,md5(pg_get_functiondef($1::regprocedure)) as hash',[sig])).rows[0];assert.equal(actual.body.replace(/\r\n/g,'\n'),f.definition.replace(/\r\n/g,'\n'));local=local.replace(quote(f.hash),quote(actual.hash));}
 const localMetadata=[];
 for(const f of baseline.functions){const actual=(await db.query("select pg_get_userbyid(proowner) as owner,prosecdef as definer,proconfig as config,proacl::text as acl from pg_proc where proname=$1 and pg_get_function_identity_arguments(oid)=$2",[f.name,f.args])).rows[0];for(const key of ['owner','definer','config'])assert.deepEqual(actual[key],f[key]);assert.deepEqual(actual.acl.slice(1,-1).split(',').sort(),f.acl.slice(1,-1).split(',').sort());localMetadata.push({name:f.name,args:f.args,...actual});}
 local=local.replace(/\$meta\$[\s\S]*?\$meta\$/,'$meta$'+JSON.stringify(localMetadata)+'$meta$');
 const livePolicies=(await db.query("select jsonb_agg(to_jsonb(p)) as value from pg_policies p where schemaname='public' and tablename in ('partner_profile_details','user_conversation_preferences','bookings')")).rows[0].value;
 // Local schema uses the audited varchar types but PostgreSQL versions deparse casts differently.
 assert.equal(livePolicies.length,baseline.policies.length);for(const p of livePolicies){const old=baseline.policies.find(v=>v.policyname===p.policyname);assert.deepEqual(p.roles,old.roles);assert.equal(p.cmd,old.cmd);}
 local=local.replace(JSON.stringify(baseline.policies),JSON.stringify(livePolicies));
 // json compact source is generated with Python's compact separators; JavaScript serialization matches it.
 const localGrants=(await db.query("select jsonb_agg(to_jsonb(g)) as value from information_schema.column_privileges g where table_schema='public' and table_name in ('partner_profile_details','user_conversation_preferences','bookings') and grantee in ('authenticated','anon')")).rows[0].value;
 const normGrants=values=>values.map(g=>[g.table_name,g.column_name,g.grantee,g.privilege_type,g.is_grantable].join('|')).sort();assert.deepEqual(normGrants(localGrants),normGrants(baseline.grants));
 local=local.replace(/\$grants\$[\s\S]*?\$grants\$/,'$grants$'+JSON.stringify(localGrants)+'$grants$');
 const localTables=(await db.query("select jsonb_agg(jsonb_build_object('relname',c.relname,'relrowsecurity',c.relrowsecurity,'relacl',c.relacl::text,'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'))) as value from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('partner_profile_details','user_conversation_preferences','bookings')")).rows[0].value;
 for(const t of localTables){const expected=baseline.table_privileges.find(x=>x.relname===t.relname);assert.deepEqual(t.relacl.slice(1,-1).split(',').sort(),expected.relacl.slice(1,-1).split(',').sort());for(const k of ['relrowsecurity','authenticated_select','authenticated_insert','authenticated_update'])assert.equal(t[k],expected[k]);}
 local=local.replace(/\$tables\$[\s\S]*?\$tables\$/,'$tables$'+JSON.stringify(localTables)+'$tables$');
 const constraints=(await db.query("select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) as value from pg_constraint c where c.conrelid in ('public.partner_profile_details'::regclass,'public.user_conversation_preferences'::regclass,'public.bookings'::regclass)")).rows[0].value;
 assert.equal(constraints.length,baseline.constraints.length);for(const c of constraints)assert(baseline.constraints.some(x=>x.name===c.name&&x.table===c.table));
 local=local.replace(/\$constraints\$[\s\S]*?\$constraints\$/,'$constraints$'+JSON.stringify(constraints)+'$constraints$');
 if(apply)await db.exec(local);
 return {db,local};
}
async function preflightDrift(){
 const {db,local}=await bootstrap(false);
 try {
  await db.exec('create policy unexpected_broad on partner_profile_details for select to authenticated using(true)');
  await assert.rejects(db.exec(local),/matching_preflight_policy_drift/);await db.exec('rollback');
  check(!(await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='partner_profile_details' and column_name='conversation_preferences'")).rows.length,'policy drift fails before any column change');
  await db.exec('drop policy unexpected_broad on partner_profile_details;grant update on partner_profile_details to authenticated');
  await assert.rejects(db.exec(local),/matching_preflight_private_contract_drift/);await db.exec('rollback');
  check(!(await db.query("select 1 from pg_proc where proname='save_partner_conversation_preferences'")).rows.length,'grant drift leaves no partially created RPC');
 }finally{await db.close();}
}
async function database(){
 const {db}=await bootstrap();
 try{
  for(const unset of [null,{}, {comfortable_purposes:['travel']},{schema_version:1,comfortable_purposes:[],interests:[],conversation_styles:[]}]) {
   const value=(await db.query("select dayo_matching_snapshot_v1('en',$1,$2) as value",[JSON.stringify(brief),unset===null?null:JSON.stringify(unset)])).rows[0].value;
   check(value.matching_score===0,'server unconfigured Partner snapshot is neutral and permitted');
  }
  const json=(query,value)=>db.query(query,[JSON.stringify(value)]);
  await db.exec('reset role');
  for(const id of [partner,partner2]){await db.query("insert into partner_profile_details(partner_id,completed_at,partner_guide_acknowledged_at,native_languages,session_languages,korean_level,location_status,visa_type,weekly_session_capacity,created_at,updated_at) values($1,now(),now(),array['English'],array['English'],'basic','korea','D-2','3-5',now(),now())",[id]);await db.query('insert into partner_capabilities(partner_id,conversation_languages,korean_support_level) values($1,array[\'en\'],$2)',[id,id===partner?'fluent':'none']);}
  const protectedBefore=(await db.query('select jsonb_agg(to_jsonb(d)-\'conversation_preferences\' order by partner_id) as value from partner_profile_details d')).rows[0].value;
  await actor(db,partner);
  const saved=(await json('select save_partner_conversation_preferences($1) as value',prefs)).rows[0].value;assert.deepEqual(saved,prefs);checks++;
  await assert.rejects(db.query('update partner_profile_details set conversation_preferences=$1 where partner_id=$2',[JSON.stringify(prefs),partner2]),e=>e.code==='42501');checks++;
  await assert.rejects(json('select save_partner_conversation_preferences($1)',{...prefs,partner_id:partner2}),e=>e.code==='22023');checks++;
  for(const bad of [{...prefs,interests:['drama','movies','youtube','music','travel']},{...prefs,interests:['music','music']},{...prefs,interests:['bad']},{...prefs,comfortable_purposes:['opic']},{...prefs,conversation_styles:['praise']},{...prefs,schema_version:'1'},{...prefs,conversation_styles:null}]){await assert.rejects(json('select save_partner_conversation_preferences($1)',bad),e=>e.code==='22023');checks++;}
  await actor(db,uid);await assert.rejects(json('select save_partner_conversation_preferences($1)',prefs),e=>e.code==='42501');checks++;
  check((await db.query('select * from partner_profile_details')).rows.length===0,'User cannot read Partner private rows');
  const any=(await db.query("select list_matching_partner_profiles('en','any') as p")).rows.map(r=>r.p);
  check(any.length===2,'any includes Korean and non-Korean candidates');
  check(any.every(p=>!('email' in p)&&!('phone' in p)&&!('completed_at' in p)),'candidate RPC exposes matching/display subset only');
  check((await db.query("select list_matching_partner_profiles('en','required') as p")).rows.length===1,'required keeps supported Partner only');
  await db.exec('reset role;update partner_profile_details set conversation_preferences=null');await actor(db,uid);
  check((await db.query("select list_matching_partner_profiles('en','any') as p")).rows.length===2,'all unconfigured eligible Partners remain candidates');
  await actor(db,partner);await json('select save_partner_conversation_preferences($1)',prefs);await actor(db,uid);

  check((await db.query("select list_matching_partner_profiles('es','any') as p")).rows.length===0,'language capability remains hard filter');
  await assert.rejects(db.query("select list_matching_partner_profiles('en','unknown')"),e=>e.code==='22023');checks++;
  await actor(db,null,'anon');await assert.rejects(db.query("select list_matching_partner_profiles('en','any')"),e=>e.code==='42501');checks++;
  await assert.rejects(json('select save_partner_conversation_preferences($1)',prefs),e=>e.code==='42501');checks++;
  await actor(db,partner);check((await db.query('select conversation_preferences as p from partner_profile_details')).rows[0].p.interests.includes('music'),'new login restores DB preferences');
  check((await db.query('select * from user_conversation_preferences where user_id=$1',[uid])).rows.length===0,'Partner cannot read other User private defaults');
  await db.exec('reset role');assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(d)-\'conversation_preferences\' order by partner_id) as value from partner_profile_details d')).rows[0].value,protectedBefore);checks++;
  // Use actual live ticket deduction/slot locks/cutoff trigger for confirmation.
  const slots=(await db.query("insert into availability_slots(partner_id,slot_time) values($1, to_char(date_trunc('hour',now()+interval '1 day') at time zone 'Asia/Seoul','YYYY-MM-DD\"T\"HH24:MI')||'+09:00'),($2, to_char(date_trunc('hour',now()+interval '1 day') at time zone 'Asia/Seoul','YYYY-MM-DD\"T\"HH24:MI')||'+09:00') returning *",[partner,partner2])).rows;
  const create=async(b,slot=slots[0])=>(await db.query('insert into bookings(learner_id,partner_id,partner_user_id,slot_id,language,conversation_brief) values($1,$2,$2,$3,\'en\',$4) returning id',[uid,slot.partner_id,slot.id,JSON.stringify(b)])).rows[0].id;
  const confirm=async id=>(await db.query('select confirm_booking_with_cutoff_cleanup($1,$2) as value',[uid,id])).rows[0].value;
  const tooSoon=(await db.query("insert into availability_slots(partner_id,slot_time) values($1,to_char(date_trunc('hour',now()+interval '2 hours') at time zone 'Asia/Seoul','YYYY-MM-DD\"T\"HH24:MI')||'+09:00') returning *",[partner])).rows[0];
  await actor(db,uid);
  // SET ROLE alone leaves session_user=postgres and intentionally activates the live admin/test bypass.
  await db.exec('set session authorization authenticated');
  try {
   check(!(await db.query('select dayo_can_bypass_booking_lead_time() as bypass')).rows[0].bypass,'ordinary authenticated session has no internal lead-time exemption');
   await assert.rejects(create(brief,tooSoon),e=>e.code==='23514');checks++;
  }finally{await db.exec('set session authorization postgres');await actor(db,uid);}
  const id=await create(brief);
  let result=await confirm(id);check(!result.success,'zero ticket confirmation fails');
  check((await db.query('select * from user_conversation_preferences')).rows.length===0,'failed booking does not persist defaults');
  await assert.rejects(create({...brief,matching_score:9999}),e=>e.code==='23514');checks++;
  await assert.rejects(create({...brief,korean_support_preference:'unknown'}),e=>e.code==='23514');checks++;
  for(const bad of [{...brief,interests:['drama','movies','youtube','music','travel']},{...brief,interests:['music','music']},{...brief,purposes:['invalid']},{...brief,conversation_style:'praise'},{...brief,schema_version:'1'},{...brief,purposes:null}]){check(!(await json('select dayo_valid_conversation_brief($1) as valid',bad)).rows[0].valid,'invalid canonical snapshot rejected');}
  await assert.rejects(create(brief,{...slots[0],id:null}),e=>e.code==='23514');checks++;
  await db.exec('reset role');await db.query("insert into ticket_lots(user_id,source,quantity_issued,quantity_remaining) values($1,'purchase',3,3)",[uid]);
  await db.query("insert into user_conversation_preferences(user_id,interests,other_interest) values($1,array[]::text[],'Existing private freeform preference')",[uid]);
  await actor(db,uid);result=await confirm(id);check(result.success,'canonical booking confirmed with real deduction contract');
  const row=(await db.query('select conversation_brief,matching_snapshot from bookings where id=$1',[id])).rows[0];assert.deepEqual(row.conversation_brief,brief);checks++;
  check(row.matching_snapshot.matching_score===6,'server computes 3 purpose + 2 style + 1 interest');
  check(row.matching_snapshot.scoring_version===1&&row.matching_snapshot.user.language==='en','reproducible canonical snapshot');
  await actor(db,partner);check((await db.query('select * from user_conversation_preferences where user_id=$1',[uid])).rows.length===0,'booking Partner cannot read actual persisted User private row');
  check((await db.query('update user_conversation_preferences set interests=array[]::text[] where user_id=$1 returning user_id',[uid])).rows.length===0,'booking Partner cannot update User private row');
  await actor(db,other);check((await db.query('select * from user_conversation_preferences where user_id=$1',[uid])).rows.length===0,'other User cannot read actual persisted defaults');
  await actor(db,uid);
  const defaults=(await db.query('select * from user_conversation_preferences')).rows[0];check(defaults.other_interest==='Existing private freeform preference','unrelated existing private freeform preference is preserved');check(defaults.source_booking_id===id&&defaults.conversation_style==='encourage'&&defaults.korean_support_preference==='required','confirmed defaults synchronized atomically');
  await confirm(id);check((await db.query('select updated_at from user_conversation_preferences')).rows[0].updated_at.getTime()===defaults.updated_at.getTime(),'idempotent retry does not resync defaults');
  await db.exec('reset role');check((await db.query('select quantity_remaining from ticket_lots')).rows[0].quantity_remaining===2,'one ticket deducted exactly once');
  check((await db.query('select count(*)::int as n from ticket_allocations')).rows[0].n===1,'one allocation exactly once');
  await assert.rejects(db.query('update bookings set matching_snapshot=$1 where id=$2',[JSON.stringify({matching_score:999}),id]),e=>e.code==='42501');checks++;
  await actor(db,uid);const wrong=await create(brief,slots[1]);await assert.rejects(confirm(wrong),e=>e.code==='23514');checks++;
  await db.exec('reset role');check((await db.query('select quantity_remaining from ticket_lots')).rows[0].quantity_remaining===2,'capability failure rolls ticket decrement back');
  check((await db.query('select source_booking_id from user_conversation_preferences')).rows[0].source_booking_id===id,'capability failure preserves defaults');
  await actor(db,uid);const race=await create({...brief,korean_support_preference:'any'},slots[0]);check(!(await confirm(race)).success,'already booked slot fails through existing race guard');
  const legacy={purposes:['opic'],interests:['movies'],chat_request:'praise',partner_preference:null};
  await db.exec('reset role');check((await json('select dayo_valid_conversation_brief($1) as valid',legacy)).rows[0].valid,'legacy validator/render contract retained');
  const old=await create(legacy,slots[1]);await actor(db,uid);check((await confirm(old)).success,'legacy booking confirmation remains compatible');
  check((await db.query('select source_booking_id from user_conversation_preferences')).rows[0].source_booking_id===id,'legacy unknown support does not overwrite canonical defaults');
  await db.exec('reset role');
  for(const f of baseline.functions.filter(f=>!['dayo_valid_conversation_brief'].includes(f.name))){const sig=f.name+'('+f.args.split(',').filter(Boolean).map(a=>a.trim().split(' ').at(-1)).join(',')+')';assert.equal((await db.query('select pg_get_functiondef($1::regprocedure) as body',[sig])).rows[0].body.replace(/\r\n/g,'\n'),f.definition.replace(/\r\n/g,'\n'));checks++;}
  await actor(db,uid);const cancelled=(await db.query('select cancel_my_booking($1) as value',[id])).rows[0].value;check(cancelled.success,'existing normal cancellation succeeds');
  check((await db.query('select matching_snapshot from bookings where id=$1',[id])).rows[0].matching_snapshot.matching_score===6,'cancellation retains historical matching snapshot');
  check((await db.query('select source_booking_id from user_conversation_preferences')).rows[0].source_booking_id===id,'cancellation does not rewrite saved defaults');
  await db.exec('reset role');check((await db.query('select quantity_remaining from ticket_lots')).rows[0].quantity_remaining===2,'existing >6h refund returns exactly one ticket');
  const neutralSlot=(await db.query("insert into availability_slots(partner_id,slot_time) values($1,to_char(date_trunc('hour',now()+interval '1 day 2 hours') at time zone 'Asia/Seoul','YYYY-MM-DD\"T\"HH24:MI')||'+09:00') returning *",[partner2])).rows[0];
  await actor(db,uid);const neutralId=await create({...brief,korean_support_preference:'any'},neutralSlot);
  check((await confirm(neutralId)).success,'unconfigured Partner can confirm a canonical booking');
  check((await db.query('select matching_snapshot from bookings where id=$1',[neutralId])).rows[0].matching_snapshot.matching_score===0,'unconfigured confirmed Partner has server neutral snapshot');
  check((await db.query('select other_interest from user_conversation_preferences')).rows[0].other_interest==='Existing private freeform preference','subsequent booking preserves other_interest');
  console.log('PASS database:',checks,'checks; captured live RPCs, real lot/slot confirmation, owner isolation, canonical snapshot, failures, idempotency, legacy and unchanged contracts.');
 }finally{await db.close();}
}
function ranking(){const hook={};vm.runInNewContext(read('public/booking-modal.js'),{window:{__DAYO_SMART_BOOKING_TEST__:hook},document:{readyState:'loading',addEventListener(){}},console,Date,setTimeout,clearTimeout});const a=hook.api;const candidates=[{id:'zero',conversation_preferences:null},{id:'high',conversation_preferences:prefs},{id:'tie',conversation_preferences:prefs}];assert.deepEqual(plain(a.rankPartners(candidates,brief)).map(p=>p.id),['high','tie','zero']);checks++;
 for(const missing of [null,undefined,{}, {comfortable_purposes:['travel'],interests:['music'],conversation_styles:['encourage']},{schema_version:1,comfortable_purposes:[],interests:[],conversation_styles:[]}]) {
  const neutral=[{id:'one',conversation_preferences:missing},{id:'two',conversation_preferences:missing}];
  check(a.matchingScore(neutral[0],brief)===0,'missing/empty preference is neutral');
  assert.deepEqual(plain(a.rankPartners(neutral,brief)).map(p=>p.id),['one','two']);checks++;
 }
 check(a.matchingScore(candidates[1],brief)===6,'frontend score matches server');
 check(a.preferencesFromBooking({id:'old',language:'en',conversation_brief:{chat_request:'praise'}}).koreanHelp===null,'legacy missing support is unknown');
 const state=a.state;Object.assign(state,{language:'en',koreanHelp:'needed',purposes:['work_school'],interests:['music'],style:'encourage'});assert.deepEqual(plain(a.preferenceSnapshot().brief),{schema_version:1,korean_support_preference:'required',purposes:['work_school'],interests:['music'],conversation_style:'encourage'});checks++;
 assert.deepEqual(plain(a.stepOrder),[0,3,1,2,4]);checks++;
 for(const f of ['partner-conversation-profile.js','partner-dashboard.js','booking-modal.js','availability-slots.js'])assert.equal(read('public/'+f),read(f));checks+=4;
}
function protectedKernels(){
 const base=cp.execFileSync('git',['show','HEAD:public/booking-modal.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),current=read('public/booking-modal.js');
 const fn=(s,n)=>s.match(new RegExp('(?:async )?function '+n+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'))[0];
 for(const n of ['loadCalendarSlots','fetchDateAvailability','partnerMatchesCriteria','isBookableStart','requiresNoRefundWarning','canBypassBookingLeadTime','getTicketCount','settleConfirmedBooking','readRecentBooking']){assert.equal(fn(current,n),fn(base,n),n+' current-main kernel preserved');checks++;}
 const old=cp.execFileSync('git',['show','HEAD:public/availability-slots.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),actual=read('public/availability-slots.js');
 let restored=actual;for(const name of ['partnerBriefLabels','renderBriefRows'])restored=restored.replace(fn(actual,name),fn(old,name));assert.equal(restored,old,'availability file differs only in canonical brief display');checks++;
}
function partnerBriefUI(){
 const source=read('public/availability-slots.js'),fn=name=>source.match(new RegExp('function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'))[0];
 const dom=new JSDOM(read('public/partner.html'),{runScripts:'outside-only',url:'https://www.dayotalk.com/partner'}),w=dom.window;
 w.eval(read('public/i18n.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 w.eval(fn('bookingOptionLabel')+'\n'+fn('partnerBriefLabels')+'\n'+fn('renderBriefRows')+'\nwindow.briefTest={labels:partnerBriefLabels,render:renderBriefRows};');
 for(const lang of ['KO','EN']){
  w.DayOI18n.setLang(lang);
  const input={learner_display_name:'Test User',language:'en',conversation_brief:brief,contact_email:'private@example.invalid',phone:'01000000000',conversation_preferences:null};
  const labels=w.briefTest.labels(input),view=w.document.getElementById('booking-prep-brief');w.briefTest.render(view,labels.values);
  check(!!labels.values.purposes&&!!labels.values.interests&&!!labels.values.chat_style&&!!labels.values.korean_support_preference,'canonical User Brief includes purposes/interests/style/support regardless of Partner preferences');
  check(view.querySelector('[data-brief-field=chat_style]').hidden===false&&view.querySelector('[data-brief-field=korean_support_preference]').hidden===false,'existing compact Brief shows canonical style and support');
  check(!JSON.stringify(labels).includes('private@example.invalid')&&!JSON.stringify(labels).includes('01000000000'),'private contact excluded from Brief projection');
  const any=w.briefTest.labels({...input,conversation_brief:{...brief,korean_support_preference:'any'}});w.briefTest.render(view,any.values);
  check(any.values.korean_support_preference===(lang==='KO'?'상관없어요':'Either is fine'),'explicit any support displayed');
  const legacy=w.briefTest.labels({...input,conversation_brief:{purposes:['opic'],partner_preference:'slow'}});w.briefTest.render(view,legacy.values);
  check(view.querySelector('[data-brief-field=korean_support_preference]').hidden===true,'legacy unknown support is not inferred');
 }
 dom.window.close();
}
async function candidateCaching(){
 const hook={},pending=[];let calls=0;
 const w={__DAYO_SMART_BOOKING_TEST__:hook,_dayoAuthUser:{id:uid},supabaseClient:{from(){},rpc(name,args){assert.equal(name,'list_matching_partner_profiles');calls++;return new Promise(resolve=>pending.push({resolve,args}));}}};
 vm.runInNewContext(read('public/booking-modal.js'),{window:w,document:{readyState:'loading',addEventListener(){}},console,Date,setTimeout,clearTimeout});
 Object.assign(hook.api.state,{language:'en',koreanHelp:'any'});
 const first=hook.api.ensureMatchingPartners(),duplicate=hook.api.ensureMatchingPartners();assert.equal(calls,1);checks++;
 Object.assign(hook.api.state,{language:'es'});const next=hook.api.ensureMatchingPartners();assert.equal(calls,2);checks++;
 pending[1].resolve({data:[{id:partner,nickname:'Spanish Partner',conversation_languages:['es']}]});const current=await next;
 pending[0].resolve({data:[{id:partner2,nickname:'Stale English',conversation_languages:['en']}]});assert.equal((await first).length,0);await duplicate;checks++;
 assert.equal((await hook.api.ensureMatchingPartners())[0].name,'Spanish Partner');assert.equal(calls,2);checks++;
 assert.equal(current[0].id,partner);checks++;
}
async function partnerUI(){
 let stored=plain(prefs),writes=0,authListener;
 const dom=new JSDOM('<html lang="ko"><body><div id="partner-dashboard-section"><div class="profile-card"></div></div></body></html>',{url:'https://dayotalk.com/partner',runScripts:'outside-only'}),w=dom.window;
 w.__dayoPartnerAuthUser={id:partner};w.__dayoPartnerProfileGate={role:'partner'};
 w.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:partner}}}}),onAuthStateChange:fn=>{authListener=fn;}},from:name=>{assert.equal(name,'partner_profile_details');return {select(fields){assert.equal(fields,'conversation_preferences');return this},eq(k,id){assert.equal(k,'partner_id');assert.equal(id,partner);return this},maybeSingle:async()=>({data:{conversation_preferences:stored}})};},rpc:async(name,args)=>{assert.equal(name,'save_partner_conversation_preferences');stored=plain(args.p_preferences);writes++;return {data:stored};}};
 w.eval(read('public/partner-conversation-profile.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(r=>setTimeout(r,30));
 check(!!w.document.querySelector('.pcv-save'),'production UI mounted without localhost gate');
 check(w.getComputedStyle(w.document.querySelector('.partner-conversation-profile')).gridColumn==='1/-1','new profile spans existing two-column host');
 check(w.getComputedStyle(w.document.querySelector('.pcv-chips')).flexWrap==='wrap','preference chips wrap within profile width');
 check(w.document.querySelector('input[value="music"]').checked,'DB preferences restored');
 const chip=w.document.querySelector('input[value="movies"]');chip.checked=true;chip.dispatchEvent(new w.Event('change'));w.document.querySelector('.pcv-save').click();await new Promise(r=>setTimeout(r,20));check(writes===1&&stored.interests.includes('movies'),'save calls owner RPC');
 authListener('SIGNED_OUT',null);check(!w.document.querySelector('.partner-conversation-profile'),'logout clears Partner draft');
 w.document.dispatchEvent(new w.CustomEvent('dayo:partner-authorized',{detail:{user:{id:partner},profile:{role:'partner'}}}));await new Promise(r=>setTimeout(r,20));check(w.document.querySelector('input[value="movies"]').checked,'relogin/new view reads persistent DB state');
 w.supabaseClient.rpc=async()=>({error:{message:'offline'}});const more=w.document.querySelector('input[value="games"]');more.checked=true;more.dispatchEvent(new w.Event('change'));w.document.querySelector('.pcv-save').click();await new Promise(r=>setTimeout(r,20));check(/다시 시도/.test(w.document.querySelector('.pcv-status').textContent),'save failure reports retry without fake success');
 check(w.localStorage.length===0,'localStorage is not production source of truth');dom.window.close();
}
(async()=>{ranking();protectedKernels();partnerBriefUI();await preflightDrift();await database();await candidateCaching();await partnerUI();console.log('PASS conversation matching fixtures:',checks,'checks total');})().catch(e=>{console.error(e);process.exitCode=1});
