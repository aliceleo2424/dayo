'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn,spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),qa=process.env.DAYO_PRIVACY_QA_DIR;
if(!qa||!process.env.DAYO_PG_BIN)throw Error('Set DAYO_PRIVACY_QA_DIR to an isolated local test directory and DAYO_PG_BIN to PostgreSQL 17 bin.');
fs.mkdirSync(qa,{recursive:true});const dir=qa+'/local-pg',bin=process.env.DAYO_PG_BIN.replace(/\\/g,'/').replace(/\/?$/,'/'),port=Number(process.env.DAYO_PRIVACY_PG_PORT||55437);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;let checks=0,database='postgres';
function check(ok,label){assert.ok(ok,label);checks++;}
function command(name,args){const r=spawnSync(bin+name+'.exe',args,{encoding:'utf8',windowsHide:true,stdio:name==='pg_ctl'?'ignore':'pipe'});if(r.status!==0)throw Error(name+': '+r.stderr+' '+r.stdout);return r.stdout;}
function query(sql,role='postgres',user=id(1)){return new Promise((resolve,reject)=>{const p=spawn(bin+'psql.exe',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',database],{windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(err.trim())));p.stdin.end(`set request.jwt.claim.sub='${user}';set role ${role};\n`+sql);});}
async function rejects(sql,role,user,pattern){await assert.rejects(query(sql,role,user),pattern);checks++;}
async function main(){
 if(!fs.existsSync(dir+'/PG_VERSION'))command('initdb',['-D',dir,'-A','trust','-U','postgres','--encoding=UTF8','--locale=C']);
 command('pg_ctl',['-D',dir,'-l',qa+'/local-pg.log','-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
 try{
 const dbName='privacy_run_'+Date.now();await query('create database '+dbName+';');database=dbName;
 await query(`do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end$$;
 create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create table auth.identities(user_id uuid,provider text,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table profiles(id uuid primary key,user_id uuid,nickname text,full_name text,email text,role text,avatar_url text,bio text,is_available boolean default true);
 create table partner_capabilities(partner_id uuid primary key,korean_support_level text);
 create table partner_profile_details(partner_id uuid primary key,completed_at timestamptz,partner_guide_acknowledged_at timestamptz,conversation_preferences jsonb);
 create table partner_applications(id uuid primary key default gen_random_uuid(),full_name text,referral_code text not null default '' constraint partner_applications_referral_code_check check(length(referral_code)<=100));
 alter table profiles enable row level security;grant select(id,nickname,role),update(nickname) on profiles to authenticated;
 create policy own_profile on profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
 alter table partner_applications enable row level security;grant insert(full_name,referral_code) on partner_applications to anon,authenticated;
 create policy submit_application on partner_applications for insert to anon,authenticated with check(true);
 create function dayo_partner_booking_languages(uuid) returns jsonb language sql stable as $$select '["en","ko"]'::jsonb$$;
 insert into profiles(id,user_id,nickname,full_name,email,role) values
 ('${id(1)}','${id(1)}','Legal One','Legal One','private1@fixture.test','partner'),
 ('${id(2)}','${id(2)}','Legacy Name','Legal Two','private2@fixture.test','partner'),
 ('${id(3)}','${id(3)}','New Partner','Legal Three','private3@fixture.test','partner'),
 ('${id(4)}','${id(4)}','User','User Legal','user@fixture.test','user');
 insert into partner_profile_details values('${id(1)}','2026-01-01','2026-01-02','{"interests":["music"]}');
 insert into partner_applications(full_name,referral_code) values('Old Applicant','Jen Old Full Name');`);
 await require('./partner-privacy-baseline-fixture.cjs').prepare({query,root,id});

 await query("update profiles set nickname='Jen Morgan',full_name='Jen Morgan' where id='"+id(1)+"';update profiles set nickname='Alice L',full_name='Alice L' where id='"+id(2)+"';");
 await query(`
 insert into profiles(id,user_id,nickname,full_name,role) values
 ('${id(7)}','${id(7)}','Pat Kim','Pat Kim','partner'),
 ('${id(8)}','${id(8)}','Wrong Legal','Wrong Legal','partner'),
 ('${id(9)}','${id(9)}','Judy Full Legal','Judy Full Legal','learner');
 insert into auth.identities values
 ('${id(1)}','google','{"given_name":"Jen"}'),
 ('${id(2)}','google','{"given_name":"Alice"}'),
 ('${id(7)}','google','{"given_name":"Pat","first_name":"Alex"}'),
 ('${id(8)}','kakao','{"first_name":"WrongDifferent"}');
 `);
 const snapshot=()=>query("select jsonb_agg(to_jsonb(p)-'nickname' order by id) from profiles p;select jsonb_agg(d order by partner_id) from partner_profile_details d;select jsonb_agg(c order by partner_id) from partner_capabilities c;select jsonb_agg(b order by id) from bookings b;select jsonb_agg(r order by id) from session_reports r;");
 const protectedBefore=await snapshot(),userBefore=await query("select jsonb_agg(p order by id) from profiles p where role in ('user','learner');");
 const oldPolicies=await query("select jsonb_agg(p order by tablename,policyname) from pg_policies p where schemaname='public';");
 const oldReads=await query("select jsonb_agg(p order by table_name,column_name,privilege_type) from information_schema.column_privileges p where table_name in ('bookings','session_reports','session_logs','profiles');");
 const migration=fs.readFileSync(root+'/supabase/migrations/105_partner_identity_referrals.sql','utf8');
 // Newly verified preflight guards must reject drift atomically before creating identity storage.
 for(const [from,to,pattern] of [
  ['c7e0ec9852838f3a7d417a7fe31c56fc','00000000000000000000000000000000',/partner_public_profile_baseline_changed/],
  ['b932d95fb53315d3521fc15648ea116b','00000000000000000000000000000000',/partner_admin_baseline_changed/],
  ['0e66d0a492b706cab0a52bbf89a734ce','00000000000000000000000000000000',/partner_profile_columns_baseline_changed/],
  ['CHECK ((length(referral_code) <= 100))','CHECK ((length(referral_code) <= 99))',/partner_referral_contract_baseline_changed/]
 ]){
  await rejects(migration.replace(from,to),'postgres',id(1),pattern);
  check(await query("select to_regclass('public.partner_public_identity') is null;")==='t','Preflight drift leaves no partial identity table');
 }
 await query(migration);
 check(!migration.includes('partner_safe_bookings')&&!migration.includes('revoke select'),'No historical read remediation in active migration');
 check(!migration.includes('confirm_my_partner_public_name'),'No extra confirmation RPC');
 let list=JSON.parse(await query('select jsonb_agg(v) from list_public_partner_profiles() v;','authenticated',id(4)));
 check(list.length===5,'All Partners remain visible; availability not narrowed');
 check(list.find(p=>p.id===id(1)).nickname==='Jen'&&list.find(p=>p.id===id(1)).public_name_ready,'Reliable given name automatically initializes without confirmation');
 check(list.find(p=>p.id===id(2)).nickname==='Alice L','Valid first/last-initial nickname preserved even when legal-name field matches');
 check(list.filter(p=>[id(3),id(7),id(8)].includes(p.id)).every(p=>p.nickname==='DayO Partner'&&!p.public_name_ready),'Absent, conflicting and mismatched given names flagged, not guessed');
 check(await query("select nickname from profiles where id='"+id(1)+"';")==='Jen','Only clearly identified legal-name nickname converted');
 check(await query("select full_name from profiles where id='"+id(1)+"';")==='Jen Morgan','Legal record unchanged');
 check(await query("select nickname from profiles where id='"+id(7)+"';")==='Pat Kim','Ambiguous nickname source preserved for admin review');
 await rejects('select get_my_partner_privacy();','anon',id(1),/permission denied/);
 for(const roleUser of [4,6,9]){
  await rejects('select get_my_partner_privacy();','authenticated',id(roleUser),/partner_required/);
  await rejects("select save_my_partner_public_name('Judy');",'authenticated',id(roleUser),/partner_required/);
 }
 await rejects('select get_admin_partner_name_reviews();','authenticated',id(1),/admin_required/);
 const reviews=JSON.parse(await query('select get_admin_partner_name_reviews();','authenticated',id(5)));
 check(reviews.length===3&&reviews.find(p=>p.partner_id===id(7)).review_reason==='conflicting_given_names','Admin review list isolates ambiguous Partners');
 check(reviews.find(p=>p.partner_id===id(8)).review_reason==='given_name_mismatch','Structured/legal mismatch explicitly flagged');
 for(const good of ['Jen','Jen M','Jen M.','Anne-Marie','Sofía','Élodie D','서연','O'+"''"+'Neil']){
  const state=JSON.parse(await query("select save_my_partner_public_name('"+good+"');",'authenticated',id(1)));
  check(state.public_name===good.replace("''","'")&&!state.needs_name_review,'Partner Save accepts first/initial format: '+good);
 }
 for(const bad of ['', 'a'.repeat(51),'email@fixture.test','https://example.com','Jen Morgan','Alice LL','Alice 4','Alice L Extra'])await rejects("select save_my_partner_public_name('"+bad+"');",'authenticated',id(1),/invalid_public_name_format/);
 await query("select save_my_partner_public_name('Jen M');",'authenticated',id(1));
 await query("update auth.identities set identity_data='{\"given_name\":\"Morgan\"}' where user_id='"+id(1)+"';");
 check(JSON.parse(await query('select get_my_partner_privacy();','authenticated',id(1))).public_name==='Jen M','Reinitialization never overwrites explicit valid name');
 // New Partner after migration initializes from the same reliable structured source.
 await query("insert into profiles(id,user_id,nickname,full_name,role) values('"+id(12)+"','"+id(12)+"','Sofia Calceto','Sofia Calceto','partner');insert into auth.identities values('"+id(12)+"','kakao','{\"first_name\":\"Sofia\"}');");
 list=JSON.parse(await query('select jsonb_agg(v) from list_public_partner_profiles() v;','authenticated',id(4)));
 check(list.find(p=>p.id===id(12)).nickname==='Sofia','New Partner customer display uses reliable candidate before profile visit');
 await rejects("select get_partner_public_name('"+id(12)+"');",'authenticated',id(4),/permission denied/);
 check(await query("select get_partner_public_name('"+id(12)+"');",'service_role',id(4))==='Sofia','New Partner booking mail resolves the same name before Profile visit');
 check(JSON.parse(await query('select get_my_partner_privacy();','authenticated',id(12))).public_name==='Sofia','New Partner own page persists initialization without extra confirmation');
 check(await query("select count(*) from partner_public_identity;",'authenticated',id(2))==='1','Partner can read only their identity');
 await rejects("update partner_public_identity set public_name='Forged';",'authenticated',id(1),/permission denied/);
 await rejects('select full_name from profiles;','authenticated',id(1),/permission denied/);
 await rejects("select * from dayo_partner_privacy.name_candidate('"+id(1)+"');",'authenticated',id(4),/permission denied/);
 // Actual collision and eight independent concurrent connections; no name-based code generation.
 await query("update partner_public_identity set referral_code='DY-AAAAAAAA' where partner_id='"+id(1)+"';create sequence collision_calls;create function fixture_bytes(integer) returns bytea language plpgsql as $$begin if nextval('public.collision_calls')=1 then return decode('0000000000000000','hex');end if;return extensions.gen_random_bytes(8);end$$;");
 const ensure=migration.slice(migration.indexOf('create function public.ensure_my_partner_referral_code'),migration.indexOf('create function public.guard_partner_referral_code')).replace('create function','create or replace function');
 await query(ensure.replace('extensions.gen_random_bytes(8)','public.fixture_bytes(8)'));
 const second=JSON.parse(await query('select ensure_my_partner_referral_code();','authenticated',id(2)));
 check(/^DY-[A-HJ-NP-Z2-9]{8}$/.test(second.referral_code)&&second.referral_code!=='DY-AAAAAAAA','Cryptographic code collision retries safely');
 check(Number(await query('select last_value from collision_calls;'))===2,'Collision genuinely exercised');await query(ensure);
 const parallel=await Promise.all(Array.from({length:8},()=>query('select ensure_my_partner_referral_code();','authenticated',id(3)).then(JSON.parse)));
 check(new Set(parallel.map(p=>p.referral_code)).size===1,'Concurrent issuance is persistent');
 check(await query('select count(distinct referral_code) from partner_public_identity;')==='3','Codes unique between Partners');
 await query("select save_my_partner_public_name('Alex K');",'authenticated',id(3));
 check(JSON.parse(await query('select ensure_my_partner_referral_code();','authenticated',id(3))).referral_code===parallel[0].referral_code,'Name changes never regenerate immutable referral');
 await rejects("update partner_public_identity set referral_code='DY-BBBBBBBB' where partner_id='"+id(3)+"';",'postgres',id(3),/immutable_partner_referral/);
 check(await query("select validate_partner_referral_code('"+second.referral_code+"');",'anon')==='t','Anon validation returns boolean only');
 check(await query("select validate_partner_referral_code('DY-00000000');",'anon')==='f','Confusing characters excluded');
 await rejects('select * from partner_public_identity;','anon',id(4),/permission denied/);
 await query("insert into partner_applications(full_name,referral_code) values('New Applicant','"+second.referral_code+"');",'anon');
 check(await query("select referring_partner_id from partner_applications where full_name='New Applicant';")===id(2),'Server resolves exact immutable referral owner');
 await rejects("insert into partner_applications(full_name,referral_code) values('Bad','DY-ABCDEFGH');",'anon',id(4),/invalid_referral_code/);
 await rejects("insert into partner_applications(full_name,referral_code,referring_partner_id) values('Spoof','','"+id(1)+"');",'anon',id(4),/permission denied/);
 await query("insert into partner_applications(full_name,referral_code) values('Legacy Client','Jen Old Full Name');",'anon');
 check(await query("select count(*) from partner_applications where referral_code='Jen Old Full Name' and referring_partner_id is null;")==='2','Legacy strings and attribution unchanged');
 // Added fixture Partner is omitted only from the invariant snapshot comparison.
 await query("delete from auth.identities where user_id='"+id(12)+"';delete from partner_public_identity where partner_id='"+id(12)+"';delete from profiles where id='"+id(12)+"';");
 check(protectedBefore===await snapshot(),'IDs, legal records, role, availability, capability, guide/completion, original booking/report data intact');
 check(userBefore===await query("select jsonb_agg(p order by id) from profiles p where role in ('user','learner');"),'All User/learner profiles unchanged');
 check(oldPolicies===await query("select jsonb_agg(p order by tablename,policyname) from pg_policies p where schemaname='public' and tablename<>'partner_public_identity';"),'Existing RLS policies unchanged');
 check(oldReads===await query("select jsonb_agg(p order by table_name,column_name,privilege_type) from information_schema.column_privileges p where table_name in ('bookings','session_reports','session_logs','profiles');"),'Existing historical read/write grants unchanged');
 check((await query('select partner_name,conversation_brief from bookings;','authenticated',id(4))).includes('Legal One'),'DEFERRED: direct participant historical booking still exposes legacy name');
 check((await query('select partner_name,feedback from session_reports;','authenticated',id(4))).includes('Legal One'),'DEFERRED: historical report/nested JSON privacy remains unresolved');
 const alpha=fs.readFileSync(root+'/supabase/migrations/095_alpha_partner_language_eligibility.sql','utf8');await query(alpha.slice(alpha.indexOf('create or replace function public.list_matching_partner_profiles'),alpha.indexOf('create or replace function public.capture_booking_matching_snapshot')));
 const match=JSON.parse(await query("select jsonb_agg(v) from list_matching_partner_profiles('en','required') v;",'authenticated',id(4)));
 check(match.length===5&&match.find(p=>p.id===id(1)).nickname==='Jen M','Matching eligibility preserved and same public display name');
 await rejects(migration,'postgres',id(4),/partner_identity_baseline_changed/);
 check(await query('select count(*) from partner_public_identity;')==='5','Reapply preflight rejects without changing identities');
 console.log(`Partner privacy database: ${checks} checks passed, real PostgreSQL 17; 8 concurrent connections. LOCAL DB ONLY.`);
 fs.writeFileSync(qa+'/database-results.json',JSON.stringify({checks,postgres:'17.11',independentConcurrentConnections:8,productionWrites:0},null,2));
 }finally{command('pg_ctl',['-D',dir,'-m','fast','-w','stop']);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
