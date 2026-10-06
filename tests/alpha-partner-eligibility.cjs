/* Local PostgreSQL only: audited production RPC bodies + production-shaped Partner data.
   Never reads credentials, calls network APIs, or changes production data. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const {bootstrap,actor,uid,other}=require('./conversation-matching-fixtures.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migration='supabase/migrations/095_alpha_partner_language_eligibility.sql';
const sabrina='739480d4-fb30-4d38-9070-60828ccd2a26';
const legacy='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',profileFirst='ffffffff-ffff-4fff-8fff-ffffffffffff',noSlot='abababab-abab-4bab-8bab-abababababab';
const brief={schema_version:1,korean_support_preference:'required',purposes:['travel'],interests:['music'],conversation_style:'encourage'};
let checks=0;function check(value,label){assert.ok(value,label);checks++;}
const plain=value=>JSON.parse(JSON.stringify(value));
const hook={};vm.runInNewContext(read('public/booking-modal.js'),{window:{__DAYO_SMART_BOOKING_TEST__:hook},document:{readyState:'loading',addEventListener(){}},Date,console,setTimeout,clearTimeout});
const api=hook.api;
function protectedSources(){
 const original=cp.execFileSync('git',['show','a9888a33edccb4be50fe02f5faa8d5ebd3133687:public/booking-modal.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 const current=read('public/booking-modal.js').replace(/\r\n/g,'\n');
 const fn=(source,name)=>source.match(new RegExp('(?:async )?function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'))[0];
 for(const name of ['loadCalendarSlots','fetchDateAvailability','fetchVisibleDateAvailability','isBookableStart','requiresNoRefundWarning','canBypassBookingLeadTime','getTicketCount','settleConfirmedBooking','preferenceSnapshot','rankPartners']){
  assert.equal(fn(current,name),fn(original,name),name+' protected contract unchanged');checks++;
 }
 check(read('booking-modal.js').replace(/\r\n/g,'\n')===current,'canonical public/root mirror exact');
 for(const file of ['public/availability-slots.js','public/availability-calendar.js','public/partner-monthly-availability.js','public/room.html','public/room-live.js','public/session-lifecycle.js']){
  const previous=cp.execFileSync('git',['show','a9888a33edccb4be50fe02f5faa8d5ebd3133687:'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');check(read(file).replace(/\r\n/g,'\n')===previous,file+' source unchanged');
 }
 const shared=read('public/supabase-client.js').replace(/\r\n/g,'\n');
 const expectedShared=cp.execFileSync('git',['show','a9888a33edccb4be50fe02f5faa8d5ebd3133687:public/supabase-client.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n')
 .replace("      booking_id: r.booking_id || booking.id || '',", "      booking_id: r.booking_id || booking.id || '',\n      is_test_session: r.is_test_session === true || booking.is_test_session === true,")
 .replace("      from_booking: true,", "      from_booking: true,\n      is_test_session: row.is_test_session === true,")
 .replace("id, partner_user_id, partner_id'", "id, partner_user_id, partner_id, is_test_session'")
 .replace("bookings(id, scheduled_at, partner_name, language)", "bookings(id, scheduled_at, partner_name, language, is_test_session)")
 .replace("completed_at, language'", "completed_at, language, is_test_session'")
 .replace("      window.__dayoCompletedSessionCount = reports.length;", "      var testBookingIds = new Set(learnerBookings.filter(function (b) { return b.is_test_session === true; }).map(function (b) { return String(b.id); }));\n      reports.concat(treatReports).forEach(function (r) { r.is_test_session = r.is_test_session === true || testBookingIds.has(String(r.booking_id || '')); });\n      window.__dayoCompletedSessionCount = reports.filter(function (r) { return !r.is_test_session; }).length;");
 check(shared===expectedShared,'shared client allows only existing TEST metadata/count guards');
 const supported=['English',' english ','EN','Spanish','ES','French','fr','Korean','KO'];
 assert.deepEqual(plain(api.canonicalBookingLanguages(supported)),['en','es','fr','ko']);checks++;
 check(api.canonicalBookingLanguages(['Japanese','ja','Chinese','zh','German','de','__proto__',null]).length===0,'pending/unknown languages not activated');
 const normalized=api.normalizePartner({id:sabrina,nickname:'Sabrina',conversation_languages:['English'],korean_support_level:null});
 for(const help of ['needed','any',null])check(api.partnerMatchesCriteria(normalized,'en',help),'Korean help never excludes Sabrina');
 check(!api.partnerMatchesCriteria(normalized,'es','any'),'requested mismatch excluded');
 check(api.partnerMatchesCriteria({...normalized,isTest:true},'en','needed'),'approved RPC candidate is not excluded by a legacy display badge');
 Object.assign(api.state,{language:'en',koreanHelp:'needed',purposes:['travel'],interests:['music'],style:'encourage'});
 assert.deepEqual(plain(api.preferenceSnapshot().brief),brief);checks++;
 check(api.rankPartners([{id:'no-match',conversation_preferences:null}],brief).length===1,'zero score never hides eligible Partner');
}
async function database(){
 const {db}=await bootstrap();
 try{
  await db.exec(`alter table availability_slots add constraint availability_slots_status_check check(status in ('available','booked'));
    alter table availability_slots add unique(partner_id,slot_time);`);
  // The audited baseline already contains this Calendar RPC. Reuse its definition
  // while adding the remaining existing 084 helpers to the in-memory schema only.
  await db.exec(read('supabase/migrations/084_partner_monthly_availability.sql').replace('create function public.get_booking_calendar_slots','create or replace function public.get_booking_calendar_slots'));
  for(const [id,name] of [[sabrina,'Sabrina'],[legacy,'Legacy Partner'],[profileFirst,'Profile First'],[noSlot,'No Slot']]){
   await db.query('insert into auth.users values($1)',[id]);
   await db.query("insert into profiles(id,user_id,nickname,role) values($1,$1,$2,'partner')",[id,name]);
  }
  await db.query("insert into partner_profile_details(partner_id,session_languages,native_languages,korean_level,location_status,visa_type,weekly_session_capacity,partner_guide_acknowledged_at,completed_at) values($1,array['English'],array['English'],'none','overseas','not_applicable_overseas','1-2',now(),now())",[sabrina]);
  await db.query("insert into partner_capabilities(partner_id,conversation_languages,korean_support_level) values($1,array['en'],'none'),($2,array['en'],'basic'),($3,array['en'],'none'),($4,array['en'],'fluent')",[legacy,profileFirst,noSlot,other]);
  await db.query("insert into partner_profile_details(partner_id,session_languages,korean_level) values($1,array['Spanish'],'none'),($2,'{}','none')",[profileFirst,legacy]);
  await db.query('update partner_profile_details set conversation_preferences=$1 where partner_id=$2',[JSON.stringify({schema_version:1,comfortable_purposes:['work_school'],interests:['games'],conversation_styles:['fast']}),sabrina]);
  // Sixteen concrete slots mirrors the audit shape; dates move with the local KST window.
  const slots=(await db.query(`insert into availability_slots(partner_id,slot_time)
    select $1,to_char((clock_timestamp() at time zone 'Asia/Seoul')::date+3+day_num+clock_time,'YYYY-MM-DD"T"HH24:MI:SS')
    from generate_series(0,3) as days(day_num) cross join unnest(array['15:00'::time,'15:30'::time,'16:00'::time,'16:30'::time]) as times(clock_time) returning *`,[sabrina])).rows;
  const legacySlot=(await db.query(`insert into availability_slots(partner_id,slot_time) values($1,to_char((clock_timestamp() at time zone 'Asia/Seoul')::date+4+time '17:00','YYYY-MM-DD"T"HH24:MI:SS')) returning *`,[legacy])).rows[0];
  const profileSlot=(await db.query(`insert into availability_slots(partner_id,slot_time) values($1,to_char((clock_timestamp() at time zone 'Asia/Seoul')::date+4+time '18:00','YYYY-MM-DD"T"HH24:MI:SS')) returning *`,[profileFirst])).rows[0];
  const allFunctions=async()=> (await db.query("select proname,pg_get_function_identity_arguments(oid) as args,pg_get_functiondef(oid) as body,proacl::text as acl,prosecdef as definer,proconfig as config from pg_proc where pronamespace='public'::regnamespace order by proname,args")).rows;
  const beforeFunctions=await allFunctions();
  const beforePolicies=(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
  const beforeData={};for(const table of ['profiles','partner_profile_details','partner_capabilities','availability_slots'])beforeData[table]=(await db.query('select to_jsonb(t) as row from '+table+' t order by 1')).rows;
  await actor(db,uid);
  check(!(await db.query("select list_matching_partner_profiles('en','any') as p")).rows.some(r=>r.p.id===sabrina),'before fix: production-shaped Sabrina is absent');
  await db.exec('reset role');await db.exec(read(migration));
  for(const [table,rows] of Object.entries(beforeData)){assert.deepEqual((await db.query('select to_jsonb(t) as row from '+table+' t order by 1')).rows,rows);checks++;}
  assert.deepEqual((await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,beforePolicies);checks++;
  const afterFunctions=await allFunctions(),changed=new Set(['list_public_partner_profiles','list_matching_partner_profiles','capture_booking_matching_snapshot']);
  for(const before of beforeFunctions){const after=afterFunctions.find(f=>f.proname===before.proname&&f.args===before.args);assert(after);assert.deepEqual({...after,body:before.body},{...before});if(!changed.has(before.proname))assert.equal(after.body,before.body);checks++;}
  for(const values of [['English',' english ','EN'],['Spanish',' ES ','French','fr','Korean','ko'],['Japanese','ja','Chinese','zh','__proto__',null],[],null]){
   const sql=(await db.query('select dayo_canonical_booking_languages($1) as languages',[values])).rows[0].languages;
   assert.deepEqual(sql,plain(api.canonicalBookingLanguages(values)));checks++;
  }
  await actor(db,uid);
  const list=async(lang,help='required')=>(await db.query('select list_matching_partner_profiles($1,$2) as p',[lang,help])).rows.map(r=>r.p);
  const required=await list('en'),any=await list('en','any');assert.deepEqual(required,any);checks++;
  check(required.some(p=>p.id===sabrina),'Profile English + no capabilities is eligible');
  check(required.some(p=>p.id===legacy),'empty Profile uses legacy en');
  check(!required.some(p=>p.id===profileFirst)&&(await list('es')).some(p=>p.id===profileFirst),'non-empty Profile Spanish overrides legacy en');
  check(!required.some(p=>p.id===other),'non-partner role excluded even with capabilities');
  check(required.every(p=>!('email' in p)&&!('country' in p)&&!('completed_at' in p)),'only existing safe public projection exposed');
  const row=required.find(p=>p.id===sabrina);const normalized=api.normalizePartner(row);
  check(api.partnerMatchesCriteria(normalized,'en','needed'),'real DB RPC output passes actual browser criterion');
  check(!api.partnerMatchesCriteria(normalized,'fr','needed'),'browser rejects mismatched language');
  const rows=(await db.query('select get_booking_calendar_slots($1) as slots',[required.map(p=>p.id)])).rows[0].slots;
  check(rows.filter(s=>s.partner_id===sabrina).length===16,'calendar returns Sabrina actual sixteen open concrete slots');
  check(!rows.some(s=>s.partner_id===noSlot),'language match with no open slots never reaches available time candidates');
  const at=String(Date.parse(slots[0].slot_time+'+09:00'));
  const normalizedList=required.map(api.normalizePartner);
  check(api.partnersForTime(rows,normalizedList,at).some(p=>p.id===sabrina),'selected real time displays Sabrina');
  check(api.rankPartners(api.partnersForTime(rows,normalizedList,at),brief).some(p=>p.id===sabrina),'preferences/style/score never exclude');
  await assert.rejects(db.query('select dayo_partner_booking_languages($1)',[sabrina]),e=>e.code==='42501');checks++;
  await actor(db,null,'anon');await assert.rejects(db.query("select list_matching_partner_profiles('en','any')"),e=>e.code==='42501');checks++;
  await db.exec('reset role');await db.query("insert into ticket_lots(user_id,source,quantity_issued,quantity_remaining) values($1,'purchase',8,8),($2,'purchase',2,2)",[uid,other]);
  const create=async(slot,language='en',user=uid,settings=brief)=>(await db.query('insert into bookings(learner_id,partner_id,partner_user_id,slot_id,language,conversation_brief) values($1,$2,$2,$3,$4,$5) returning id',[user,slot.partner_id,slot.id,language,JSON.stringify(settings)])).rows[0].id;
  const confirm=async(id,user=uid)=>(await db.query('select confirm_booking_with_cutoff_cleanup($1,$2) as result',[user,id])).rows[0].result;
  const balance=async()=>{await db.exec('reset role');return (await db.query('select quantity_remaining from ticket_lots where user_id=$1',[uid])).rows[0].quantity_remaining;};
  await actor(db,uid);const booking=await create(slots[0]);check((await confirm(booking)).success,'listed Sabrina confirms via captured live lot/slot RPC');
  let stored=(await db.query('select * from bookings where id=$1',[booking])).rows[0];
  assert.deepEqual(stored.conversation_brief,brief);checks++;
  check(stored.matching_snapshot.user.korean_support_preference==='required','required preserved in canonical snapshot');
  check(stored.matching_snapshot.matching_score===0,'mismatched preferences have zero score, not a block');
  const initialBalance=await balance();await actor(db,uid);check((await confirm(booking)).success,'confirmation retry succeeds idempotently');check(await balance()===initialBalance,'retry does not deduct twice');
  await actor(db,other);const raced=await create(slots[0],'en',other);check(!(await confirm(raced,other)).success,'second user cannot take confirmed slot');
  await db.exec('reset role');check((await db.query('select quantity_remaining from ticket_lots where user_id=$1',[other])).rows[0].quantity_remaining===2,'collision does not deduct second user ticket');
  check((await db.query("select count(*)::int as n from bookings where slot_id=$1 and status='confirmed'",[slots[0].id])).rows[0].n===1,'no duplicate confirmed booking');
  check((await db.query('select status from availability_slots where id=$1',[slots[0].id])).rows[0].status==='booked','booked slot state preserved');
  await actor(db,uid);const mismatch=await create(profileSlot,'en');await assert.rejects(confirm(mismatch),e=>e.code==='23514');checks++;
  check(await balance()===initialBalance,'wrong language rolls back ticket mutation');
  await actor(db,uid);const spanish=await create(profileSlot,'es');check((await confirm(spanish)).success,'Profile language also succeeds at confirmation');
  const old=await create(legacySlot);check((await confirm(old)).success,'legacy/no completion/basic Korean help Partner confirms required booking');
  const anyBooking=await create(slots[1],'en',uid,{...brief,korean_support_preference:'any'});check((await confirm(anyBooking)).success,'any preference confirms');
  check((await db.query('select conversation_brief from bookings where id=$1',[anyBooking])).rows[0].conversation_brief.korean_support_preference==='any','existing any selection preserved');
  await db.exec('reset role');await db.query("update partner_profile_details set session_languages=array['Japanese'] where partner_id=$1",[profileFirst]);
  await actor(db,uid);check(!(await list('en')).some(p=>p.id===profileFirst)&&!(await list('es')).some(p=>p.id===profileFirst),'non-empty unsupported Profile does not re-enable legacy languages');
  await db.exec('reset role');
  const boundarySlots=(await db.query(`insert into availability_slots(partner_id,slot_time)
    select $1,to_char((clock_timestamp() at time zone 'Asia/Seoul')::date+day_offset+time '20:00','YYYY-MM-DD"T"HH24:MI:SS')
    from unnest(array[29,30]) as offsets(day_offset) returning *`,[legacy])).rows;
  const day29=boundarySlots[0],day30=boundarySlots[1];
  await actor(db,uid);check((await confirm(await create(day29))).success,'day +29 still bookable');
  await assert.rejects(create(day30),e=>e.code==='23514');checks++;
  await db.exec('reset role');
  const soon=(await db.query(`insert into availability_slots(partner_id,slot_time) values($1,to_char(date_trunc('hour',clock_timestamp()+interval '2 hours') at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS')) returning *`,[legacy])).rows[0];
  await actor(db,uid);await db.exec('set session authorization authenticated');
  try{check(!(await db.query('select dayo_can_bypass_booking_lead_time() as bypass')).rows[0].bypass,'ordinary user has no bypass');await assert.rejects(create(soon),e=>e.code==='23514');checks++;}
  finally{await db.exec('set session authorization postgres');await actor(db,uid);}
  stored=(await db.query('select conversation_brief,matching_snapshot from bookings where id=$1',[booking])).rows[0];
  assert.deepEqual(stored.conversation_brief,brief);checks++;
  console.log('PASS alpha database: source precedence, Sabrina 16 slots → real confirmation, required/any snapshots, role/privacy, unchanged RPCs/RLS, retry/tickets/collision, +29/+30 and cutoff.');
 }finally{await db.close();}
}
(async()=>{protectedSources();await database();console.log('PASS alpha partner eligibility:',checks,'checks. Local PostgreSQL only; production untouched.');})().catch(error=>{console.error(error.stack);process.exit(1);});
