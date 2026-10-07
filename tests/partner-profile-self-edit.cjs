// Isolated PostgreSQL only. No credentials or production network.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const migration='supabase/migrations/098_partner_profile_self_edit_interests.sql';
const fn=(source,name)=>source.match(new RegExp('create(?: or replace)? function public\\.'+name+'\\([\\s\\S]*?\\$\\$;','i'))[0];
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create table profiles(id uuid primary key,role text,approval text,languages text);create table availability_slots(partner_id uuid,slot_time text);create table partner_capabilities(partner_id uuid,conversation_languages text[],korean_support_level text);");
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
 for(let i=0;i<4;i++)await db.query('insert into profiles values($1,$2,$3,$4)',[ids[i],['admin','partner','user','partner'][i],'approved','Unchanged']);
 await db.query("insert into availability_slots values($1,'weekly:mon|10:00')",[ids[1]]);await db.query("insert into partner_capabilities values($1,array['en'],'fluent')",[ids[1]]);
 await db.exec("create function dayo_is_admin() returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;alter table profiles enable row level security;grant select on profiles to authenticated;create policy own on profiles for select using(id=auth.uid());");
 const protectedSnapshot=async()=>Promise.all(['profiles','availability_slots','partner_capabilities'].map(async t=>(await db.query('select to_jsonb(t) row from '+t+' t order by 1')).rows));const before=await protectedSnapshot();
 await db.exec(read('supabase/migrations/081_partner_profile_completion.sql'));
 const m=read('supabase/migrations/083_partner_language_location_profile.sql');await db.exec(m.slice(m.indexOf('alter table public.partner_profile_details'),m.indexOf('create or replace function public.validate_partner_application_profile')));
 const baselineRpc=m.slice(m.indexOf('create or replace function public.save_partner_profile_completion'),m.indexOf('notify pgrst'));await db.exec(baselineRpc);
 const matching=read('supabase/migrations/090_conversation_preferences_matching.sql');
 for(const name of ['dayo_matching_keys_valid','dayo_partner_preferences_valid','dayo_booking_preferences_v1_valid','dayo_matching_snapshot_v1'])await db.exec(fn(matching,name));
 await db.exec('alter table partner_profile_details add column conversation_preferences jsonb check(conversation_preferences is null or dayo_partner_preferences_valid(conversation_preferences))');
 await db.exec(fn(matching,'save_partner_conversation_preferences'));
 await db.exec('revoke all on function save_partner_conversation_preferences(jsonb) from public,anon,authenticated;grant execute on function save_partner_conversation_preferences(jsonb) to authenticated');
 const login=async i=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);await db.exec('set role authenticated');};
 const payload={location_status:'korea',country:'South Korea',city:'Seoul',visa_type:'D-2',native_languages:['English'],other_languages:[{language:'French',level:'conversational'}],session_languages:['English','French'],korean_level:'basic',weekly_session_capacity:'3-5',guide_acknowledged:true};
 const save=async p=>(await db.query('select save_partner_profile_completion($1::jsonb) row',[JSON.stringify(p)])).rows[0].row;
 const savePrefs=async p=>(await db.query('select save_partner_conversation_preferences($1::jsonb) row',[JSON.stringify(p)])).rows[0].row;
 await login(1);const legacy=await save(payload);const pref={schema_version:1,comfortable_purposes:['travel','work_school'],interests:['drama'],conversation_styles:['encourage','slow']};await savePrefs(pref);await db.exec('reset role');
 const metadata=async()=>({columns:(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='partner_profile_details' order by column_name")).rows,acl:(await db.query("select proacl::text acl from pg_proc where oid='save_partner_profile_completion(jsonb)'::regprocedure")).rows});const prior=await metadata();
 await db.exec(baselineRpc.replace('Partner access required','Partner access changed'));await assert.rejects(db.exec(read(migration)),/RPC changed/);await db.exec('rollback');await db.exec(baselineRpc);await db.exec(read(migration));assert.deepEqual(await metadata(),prior,'No columns or grants changed');
 await login(1);const {visa_type,location_status,...edit}=payload;const row=await save({...edit,city:'Busan',korean_level:'advanced',weekly_session_capacity:'6-10'});
 assert.equal(row.visa_type,'D-2');assert.equal(row.location_status,'korea');assert.equal(row.city,'Busan');assert.equal(row.korean_level,'advanced');assert.equal(row.completed_at,legacy.completed_at);assert.equal(row.partner_guide_acknowledged_at,legacy.partner_guide_acknowledged_at);assert.deepEqual(row.conversation_preferences,pref);
 for(const patch of [{visa_type:'F-series'},{visa_type:null},{location_status:'overseas'},{role:'admin'},{approval:'pending'},{partner_id:ids[3]},{korean_support_level:'none'},{completed_at:'2000-01-01'},{partner_guide_acknowledged_at:null},{conversation_preferences:pref},{interests:['music']},{interest_other:'Pottery'},{admin_memo:'changed'}])await assert.rejects(save({...edit,...patch}),/protected|cannot be changed/);
 await assert.rejects(save({...edit,other_languages:[{language:'French',level:'basic'}]}),/Conversational/);await assert.rejects(save({...edit,guide_acknowledged:false}),/Guide/);
 for(let n=1;n<=4;n++){const updated=await savePrefs({...pref,interests:['music','travel','food_cafe','movies'].slice(0,n)});assert.deepEqual(updated.comfortable_purposes,pref.comfortable_purposes);assert.deepEqual(updated.conversation_styles,pref.conversation_styles);assert.equal(updated.interests.length,n);}
 for(const interests of [['music','travel','food_cafe','movies','drama'],['other'],['music','music'],['movies_tv'],[null]])await assert.rejects(savePrefs({...pref,interests}),/Invalid/);
 await assert.rejects(savePrefs({...pref,interest_other:'Pottery'}),/Invalid/);
 const current=(await db.query('select * from partner_profile_details where partner_id=$1',[ids[1]])).rows[0];const brief={schema_version:1,korean_support_preference:'required',purposes:['travel'],interests:['music','movies'],conversation_style:'encourage'};
 const snapshot=(await db.query("select dayo_matching_snapshot_v1('en',$1,$2) snapshot",[JSON.stringify(brief),JSON.stringify(current.conversation_preferences)])).rows[0].snapshot;assert.deepEqual(snapshot.partner,current.conversation_preferences);assert.equal(snapshot.score_breakdown.interest_overlap,2);
 await db.exec('reset role');assert.deepEqual(await protectedSnapshot(),before);await login(1);assert.deepEqual((await db.query('select conversation_preferences from partner_profile_details where partner_id=$1',[ids[1]])).rows[0].conversation_preferences,current.conversation_preferences);
 await assert.rejects(db.query("update partner_profile_details set korean_level='none'"),/permission denied/);
 await login(2);assert.equal((await db.query('select * from partner_profile_details')).rows.length,0);await assert.rejects(save(edit),/Partner access/);await assert.rejects(savePrefs(pref),/Partner access/);
 await login(3);await assert.rejects(savePrefs(pref),/Complete Partner Profile/);const created=await save(payload);assert(created.completed_at);await savePrefs(pref);await assert.rejects(save({...payload,visa_type:'F-series'}),/cannot be changed/);
 await login(0);assert.equal((await db.query('select * from partner_profile_details')).rows.length,2);await assert.rejects(savePrefs(pref),/Partner access/);
 await db.exec('reset role;set role anon');await assert.rejects(savePrefs(pref),/permission denied/);await assert.rejects(save(payload),/permission denied/);
 console.log('PASS A-K SQL/RLS: completed edit; canonical 1-4; 5/invalid/Other rejected; purposes/styles retained; roles/approval/capabilities/availability protected; visa/internal input rejected; timestamps preserved; matching snapshot; fresh auth/query persistence; no schema/grant changes.');
 }finally{await db.close()}
 for(const f of ['partner-profile-completion.js','partner-profile-completion.css','partner-profile-fields.js','partner-dashboard.js','partner-conversation-profile.js'])assert.equal(read('public/'+f),read(f));
 const cp=require('node:child_process');for(const file of ['public/availability-slots.js','public/booking-modal.js','supabase/migrations/095_alpha_partner_language_eligibility.sql'])assert.equal(read(file),cp.execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'));
 assert.doesNotMatch(read(migration),/add column|create policy|grant |partner_capabilities\s+set/i);console.log('PASS: mirrors, booking/availability/095 unchanged, no new columns/RLS/grants.');
 // Alpha policy is intentional: required/any stays in snapshots and Brief,
 // never restricts eligible partners. Reuse the existing real SQL fixture.
 // Its old-release source guard is replaced by our current-HEAD guards above.
 const alphaRunner=`const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');const file=path.resolve('tests/alpha-partner-eligibility.cjs'),m=new Module(file);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const source=fs.readFileSync(file,'utf8').replace('protectedSources();await database();','await database();');m._compile(source,file);`;
 console.log(cp.execFileSync(process.execPath,['-e',alphaRunner],{cwd:root,encoding:'utf8'}).trim());
 const vm=require('node:vm'),availability=read('public/availability-slots.js');
 const briefFunctions=availability.slice(availability.indexOf('  function bookingOptionLabel('),availability.indexOf('  function renderBriefRows('));
 const context={window:{DayOI18n:{getLang:()=> 'EN',t:key=>key}},t:key=>key};vm.createContext(context);vm.runInContext(briefFunctions,context);
 const briefFor=help=>context.partnerBriefLabels({learner_display_name:'QA User',language:'en',conversation_brief:{schema_version:1,korean_support_preference:help}}).values.korean_support_preference;
 assert.equal(briefFor('required'),'Korean support preferred');assert.equal(briefFor('any'),'Either is fine');
 console.log('PASS J: intentional 095 Alpha no-filter policy, required/any snapshot preservation and Partner Brief display.');

})().catch(e=>{console.error(e);process.exitCode=1});
