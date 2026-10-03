const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname,'..');
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const payload = { location_status:'korea',visa_type:'D-2',native_languages:['English','French'],other_languages:[{language:'Japanese',level:'fluent'},{language:'Korean',level:'basic'}],session_languages:['English','Japanese'],korean_level:'basic',availability_periods:['weekday_evening','weekend_late_night'],weekly_session_capacity:'3-5',guide_acknowledged:true };
async function database() {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting(\'request.jwt.claim.sub\',true),\'\')::uuid $$;');
    await db.exec('create table public.profiles(id uuid primary key,role text,languages text,visa_type text); create table public.availability_slots(partner_id uuid,slot_time text); create table public.partner_capabilities(partner_id uuid,conversation_languages text[]);');
    for (let i=0;i<ids.length;i++) await db.query('insert into profiles values($1,$2,$3,$4)',[ids[i],['admin','partner','user','partner'][i],'Legacy English, French','Verified legacy visa']);
    await db.query('insert into availability_slots values($1,$2)',[ids[1],'weekly:mon|10:00']);
    await db.query('insert into partner_capabilities values($1,$2)',[ids[1],['en']]);
    await db.exec('alter table profiles enable row level security; grant select on profiles to authenticated; create policy profile_own on profiles for select to authenticated using(id=auth.uid());');
    const helper = fs.readFileSync(path.join(root,'supabase/migrations/039_secure_bookings_rls.sql'),'utf8');
    await db.exec(helper.slice(helper.indexOf('create or replace function public.dayo_is_admin()'),helper.indexOf('-- Remove the broad production policies')));
    const snapshot = async () => Promise.all(['profiles','availability_slots','partner_capabilities'].map(async name=>(await db.query('select to_jsonb(t) row from public.'+name+' t order by 1')).rows));
    const before = await snapshot();
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/081_partner_profile_completion.sql'),'utf8'));
    const login = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
    const save = async data => (await db.query('select public.save_partner_profile_completion($1::jsonb) data',[JSON.stringify(data)])).rows[0].data;
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from partner_profile_details'),/permission denied/);
    await assert.rejects(save(payload),/permission denied/);
    await login(ids[2]); assert.equal((await db.query('select * from partner_profile_details')).rows.length,0);
    await assert.rejects(save(payload),/Partner access required/);
    await login(ids[1]);
    for(const patch of [{guide_acknowledged:false},{guide_acknowledged:null},{visa_type:'not_applicable_overseas'},{native_languages:[]},{native_languages:['English','english']},{native_languages:[123]},{session_languages:['Korean']},{availability_periods:['weekend_invalid']},{availability_periods:[]},{other_languages:[{language:'English',level:'fluent'}]},{other_languages:[{language:'Japanese',level:'expert'}]},{weekly_session_capacity:'100'}])await assert.rejects(save({...payload,...patch}),/Guide|Complete|Selections|language|availability|languages/);
    let row = await save({...payload,partner_id:ids[3],completed_at:'2000-01-01',partner_guide_acknowledged_at:'2000-01-01'});
    assert.equal(row.partner_id,ids[1]); assert(row.completed_at && row.partner_guide_acknowledged_at); assert.notEqual(row.completed_at,'2000-01-01');
    assert.deepEqual(row.native_languages,payload.native_languages); assert.deepEqual(row.other_languages,payload.other_languages);
    await assert.rejects(db.query('update partner_profile_details set visa_type=$1 where partner_id=$2',['Other visa',ids[1]]),/permission denied/);
    await assert.rejects(db.query('insert into partner_profile_details(partner_id) values($1)',[ids[3]]),/permission denied/);
    const first = row;
    await login(ids[3]); assert.equal((await db.query('select * from partner_profile_details')).rows.length,0);
    const overseas = await save({...payload,location_status:'overseas',visa_type:'not_applicable_overseas'}); assert.equal(overseas.partner_id,ids[3]);
    await login(ids[1]); row = await save({...payload,weekly_session_capacity:'10+'});
    assert.equal(row.id,first.id); assert.deepEqual(row.completed_at,first.completed_at); assert.deepEqual(row.partner_guide_acknowledged_at,first.partner_guide_acknowledged_at);
    await login(ids[1]); assert.equal(new Date((await db.query('select * from partner_profile_details')).rows[0].completed_at).getTime(),new Date(row.completed_at).getTime());
    await login(ids[0]); assert.equal((await db.query('select * from partner_profile_details')).rows.length,2); await assert.rejects(save(payload),/Partner access required/);
    await db.exec('reset role'); assert.deepEqual(await snapshot(),before,'Existing profiles, slots and verified capabilities untouched');
    await db.query('update profiles set role=$1 where id=$2',['user',ids[1]]); await login(ids[1]);
    assert.equal((await db.query('select * from partner_profile_details')).rows.length,0); await assert.rejects(save(payload),/Partner access required/);
    await db.exec('reset role'); await db.exec('begin'); await db.query('delete from partner_profile_details where partner_id=$1',[ids[3]]); await db.exec('rollback'); assert.equal((await db.query('select * from partner_profile_details')).rows.length,2);
    console.log('PASS: 081 SQL execution; anon/user/other-partner isolation; admin read-only; guide, languages, visa/KST validation; server-owned identity/timestamps; update/relogin persistence; existing data preservation; rollback.');
  } finally { await db.close(); }
}
async function adminSummary() {
  const ts = require('typescript'), vm = require('node:vm');
  const mock = { from(name) { assert.equal(name,'partner_profile_details'); return {select(){return this;},eq(key,value){assert.equal(key,'partner_id');assert.equal(value,ids[1]);return this;},maybeSingle:async()=>({data:{...payload,partner_id:ids[1],completed_at:'2026-10-03',partner_guide_acknowledged_at:'2026-10-03'},error:null})};} };
  const sandbox = {exports:{},require:name=>{assert.equal(name,'@/lib/supabase');return {supabase:mock};}};
  const source = fs.readFileSync(path.join(root,'admin/src/lib/partner-profile-details.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
  const data = await sandbox.exports.fetchPartnerProfileDetails(ids[1]);
  const rows = sandbox.exports.partnerProfileDetailsRows(data);
  assert.equal(rows.find(r=>r[0]==='Profile')[1],'Profile complete');
  assert.match(rows.find(r=>r[0]==='Other languages')[1],/Japanese — Fluent/);
  assert.match(rows.find(r=>r[0]==='Availability (KST)')[1],/Weekends · 10:00 PM–1:00 AM/);
  assert.match(rows.find(r=>r[0]==='Guide')[1],/Guide read/);
  assert.equal(sandbox.exports.partnerProfileDetailsRows(null)[0][1],'Profile incomplete');
  const React = require('react'), render = require('react-dom/server').renderToStaticMarkup;
  let state = {id:ids[1],details:data,error:null}, pending;
  const ui = {exports:{},require:name=>name==='react'?{...React,useState:()=>[state,()=>{}],useEffect:fn=>{pending=fn;}}:name==='@/lib/partner-profile-details'?sandbox.exports:require(name)};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'admin/src/components/admin/partner-profile-completion-summary.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,ui);
  let html=render(ui.exports.PartnerProfileCompletionSummary({partnerId:ids[1]}));
  assert.match(html,/Self-declared information/);assert.match(html,/Profile complete/);assert.match(html,/Visa \(self-declared\)/);
  state={id:ids[3],details:data,error:null};html=render(ui.exports.PartnerProfileCompletionSummary({partnerId:ids[1]}));assert.match(html,/Loading profile/);assert.doesNotMatch(html,/Profile complete/);
  state={id:ids[1],details:null,error:'Unavailable'};html=render(ui.exports.PartnerProfileCompletionSummary({partnerId:ids[1]}));assert.match(html,/Unavailable/);assert.doesNotMatch(html,/Profile incomplete/);
  console.log('PASS: admin read helper, all summary fields, self-declared label, missing profile, stale-partner isolation and unavailable state.');
}
function files() {
  for(const file of ['partner.html','partner-profile-completion.js','partner-profile-completion.css'])assert.equal(fs.readFileSync(path.join(root,file),'utf8'),fs.readFileSync(path.join(root,'public',file),'utf8'));
  const js=fs.readFileSync(path.join(root,'public/partner-profile-completion.js'),'utf8');
  assert.doesNotMatch(js,/from\(['"](?:partner_applications|availability_slots|partner_capabilities)['"]\)/);
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/081_partner_profile_completion.sql'),'utf8');
  assert.doesNotMatch(sql,/(?:insert into|update|alter table) public\.(profiles|availability_slots|partner_capabilities|partner_applications)\b/i);
  console.log('PASS: root/public mirrors; no application row or protected table writes.');
}
(async()=>{ files(); await database(); await adminSummary(); })().catch(e=>{ console.error(e); process.exitCode=1; });
