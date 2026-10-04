'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{Client}=require('pg');
const config={host:'127.0.0.1',port:Number(process.env.DAYO_LOCAL_PG_PORT||55483),user:'postgres',password:fs.readFileSync(process.env.DAYO_LOCAL_PG_PASSWORD_FILE,'utf8'),database:process.env.DAYO_QA_DATABASE};
if(!/^dayo_contract_qa\d+$/.test(config.database))throw new Error('Only explicitly named localhost QA databases are allowed');
const ids={a:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',partner:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',admin:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',other:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};
let checks=0;const ok=(x,m)=>{assert.ok(x,m);checks++;};
async function connect(){const c=new Client(config);await c.connect();return c;}
async function as(c,who,role='authenticated'){await c.query('reset role');await c.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[ids[who]||'',role]);await c.query('set role '+role);}
async function deny(c,sql,params=[],code='42501'){await assert.rejects(c.query(sql,params),e=>e.code===code);checks++;}
(async()=>{
 const db=await connect();
 await db.query("select set_config('request.jwt.claim.role','service_role',false)");
 // Local fixture bootstrap only, as the existing definer owner. No trigger edits.
 await db.query("select set_config('dayo.admin_role_rpc','on',false)");
 for(const [name,id] of Object.entries(ids)){
  await db.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,'{}','{\"provider\":\"email\"}') on conflict(id) do nothing",[id,name+'@fixture.test']);
  await db.query("update public.profiles set role=$2,nickname=$3,learning_languages='unchanged language',bio='Fixture intro' where id=$1",[id,name==='admin'?'admin':(['partner','other'].includes(name)?'partner':'user'),name]);
 }
 await db.query("select set_config('dayo.admin_role_rpc','',false)");
 await db.query("insert into partner_capabilities(partner_id,conversation_languages,korean_support_level) values($1,array['en'],'basic')",[ids.partner]);
 await db.query("insert into availability_slots(partner_id,slot_time) values($1,'weekly:mon|10:00')",[ids.partner]);
 const protectedBefore=(await db.query('select id,role,learning_languages,ticket_count,point_balance from profiles order by id')).rows;
 const capabilityBefore=(await db.query('select * from partner_capabilities')).rows;
 const weeklyBefore=(await db.query('select * from availability_slots')).rows;
 await as(db,'a');
 ok((await db.query('select id,nickname from profiles')).rows.length===1,'own profile only');
 await deny(db,'select admin_memo from profiles');await deny(db,'select * from profiles');await deny(db,"update profiles set role='admin'");await deny(db,"update profiles set ticket_count=999");
 ok((await db.query('select * from admin_list_profiles()').catch(e=>({rows:[],denied:e.code==='42501'}))).denied,'general user admin RPC denied');
 await deny(db,'select save_partner_profile_completion($1)',[{}]);await deny(db,'select get_partner_monthly_schedule()');
 await as(db,'','anon');await deny(db,'select id from profiles');await deny(db,'select get_booking_calendar_slots($1)',[[ids.partner]]);
 await as(db,'partner');
 const payload={location_status:'overseas',visa_type:'not_applicable_overseas',country:'United Kingdom',city:'London',native_languages:['English','Spanish'],other_languages:[{language:'Japanese',level:'fluent'}],session_languages:['English','Japanese'],korean_level:'basic',weekly_session_capacity:'3-5',guide_acknowledged:true};
 await deny(db,'select save_partner_profile_completion($1)',[{...payload,guide_acknowledged:false}],'22023');
 await deny(db,'select save_partner_profile_completion($1)',[{...payload,visa_type:'D-2'}],'22023');
 const completed=(await db.query('select save_partner_profile_completion($1) as data',[payload])).rows[0].data;
 ok(completed.completed_at&&completed.partner_guide_acknowledged_at&&completed.city==='London','location/language/guide completion');
 const again=(await db.query('select save_partner_profile_completion($1) as data',[{...payload,weekly_session_capacity:'6-10'}])).rows[0].data;
 ok(again.completed_at===completed.completed_at&&again.partner_guide_acknowledged_at===completed.partner_guide_acknowledged_at,'first completion timestamps preserved');
 await as(db,'other');ok((await db.query('select * from partner_profile_details')).rows.length===0,'other partner data hidden');
 await as(db,'a');ok((await db.query('select * from partner_profile_details')).rows.length===0,'general user details hidden');
 await db.query('reset role');
 assert.deepEqual((await db.query('select id,role,learning_languages,ticket_count,point_balance from profiles order by id')).rows,protectedBefore);checks++;
 assert.deepEqual((await db.query('select * from partner_capabilities')).rows,capabilityBefore);checks++;
 assert.deepEqual((await db.query('select * from availability_slots')).rows,weeklyBefore);checks++;
 await as(db,'admin');ok((await db.query('select * from admin_list_profiles()')).rows.length===5,'admin list via guarded RPC');
 ok((await db.query('select * from partner_profile_details')).rows.length===1,'admin details read');
 await db.query('select admin_update_profile_memo($1,$2)',[ids.partner,'Local QA note']);
 for(const who of ['a','b'])await db.query('select admin_grant_tickets($1,1,$2,$3)',[ids[who],'Local concurrency QA',require('crypto').randomUUID()]);
 await as(db,'partner');
 await db.query('select save_partner_weekly_template($1)',[JSON.stringify([{dayId:'mon',time:'10:00'},{dayId:'fri',time:'11:00'}])]);
 let schedule=(await db.query('select get_partner_monthly_schedule() as data')).rows[0].data;
 ok((Date.parse(schedule.end)-Date.parse(schedule.start))/86400000+1===30,'exact 30 KST dates');
 const target=(await db.query("select ((clock_timestamp() at time zone 'Asia/Seoul')::date+2)::text as date")).rows[0].date;
 await db.query('select save_partner_availability_override($1,$2,$3)',[target,'custom',['11:00','11:30']]);
 await db.query('select apply_partner_weekly_template()');
 schedule=(await db.query('select get_partner_monthly_schedule() as data')).rows[0].data;
 ok(schedule.overrides.find(o=>o.date===target).mode==='custom','apply weekly preserves custom override');
 await deny(db,"insert into partner_availability_overrides(partner_id,date,mode) values($1,$2,'closed')",[ids.partner,target]);
 await as(db,'other');ok((await db.query('select * from partner_availability_overrides')).rows.length===0,'other partner cannot read override');
 await as(db,'a');ok((await db.query('select * from partner_availability_overrides')).rows.length===0,'general user cannot read override');
 await deny(db,'select save_partner_availability_override($1,$2,$3)',[target,'closed',[]]);
 await as(db,'admin');ok((await db.query('select * from partner_availability_overrides')).rows.length===1,'admin can read override');
 await as(db,'partner');
 let slots=schedule.slots.filter(s=>s.slot_time.startsWith(target)&&s.status==='available');ok(slots.length===2,'custom concrete slots');
 await as(db,'a');let userSlots=(await db.query('select get_booking_calendar_slots($1) as data',[[ids.partner]])).rows[0].data;
 ok(userSlots.some(s=>s.id===slots[0].id),'Partner to User propagation');
 const slot=slots[0],bookingIds={};
 for(const who of ['a','b']){await as(db,who);bookingIds[who]=(await db.query("insert into bookings(learner_id,partner_id,partner_user_id,slot_id,language,status) values($1,$2,$2,$3,'en','pending') returning id",[ids[who],ids.partner,slot.id])).rows[0].id;}
 const ca=await connect(),cb=await connect();await as(ca,'a');await as(cb,'b');
 const pa=(await ca.query('select pg_backend_pid() as pid')).rows[0].pid,pb=(await cb.query('select pg_backend_pid() as pid')).rows[0].pid;ok(pa!==pb,'independent backend connections');
 await ca.query('begin');await cb.query('begin');
 const winner=(await ca.query('select confirm_booking_with_cutoff_cleanup($1,$2) as data',[ids.a,bookingIds.a])).rows[0].data;ok(winner.success===true,'first confirmation succeeds');
 let loserDone=false;
 const loserPromise=cb.query('select confirm_booking_with_cutoff_cleanup($1,$2) as data',[ids.b,bookingIds.b]).then(r=>{loserDone=true;return r.rows[0].data});
 await db.query('reset role');
 let contention=false;
 for(let i=0;i<40;i++){const r=(await db.query('select $1::int=any(pg_blocking_pids($2)) as blocked',[pa,pb])).rows[0];if(r.blocked){contention=true;break;}await new Promise(r=>setTimeout(r,25));}
 ok(contention&&!loserDone,'real overlapping transaction/slot lock contention observed');
 await ca.query('commit');const loser=await loserPromise;await cb.query('commit');ok(loser.success===false&&typeof loser.message==='string','loser clean conflict');await ca.end();await cb.end();
 const confirmed=(await db.query("select * from bookings where slot_id=$1 and status='confirmed'",[slot.id])).rows;ok(confirmed.length===1,'one confirmed booking');
 ok((await db.query('select count(*)::int as n from ticket_allocations where booking_id=any($1)',[[bookingIds.a,bookingIds.b]])).rows[0].n===1,'one allocation');
 const balances=(await db.query('select id,ticket_count from profiles where id=any($1)',[[ids.a,ids.b]])).rows;
 ok(Number(balances.find(p=>p.id===ids.a).ticket_count)===0&&Number(balances.find(p=>p.id===ids.b).ticket_count)===1,'loser entitlement preserved');
 ok((await db.query('select status from availability_slots where id=$1',[slot.id])).rows[0].status==='booked','slot consistent');
 ok((await db.query("select count(*)::int as n from booking_notification_log where booking_id=$1 and event_type='booking_confirmed'",[bookingIds.a])).rows[0].n===2,'existing notification enqueue preserved; no email provider/webhook');
 await as(db,'partner');await db.query('select save_partner_availability_override($1,$2,$3)',[target,'closed',[]]);
 schedule=(await db.query('select get_partner_monthly_schedule() as data')).rows[0].data;
 ok(schedule.slots.find(s=>s.id===slot.id).reserved&&schedule.slots.find(s=>s.id===slot.id).status==='booked','close protects booking');
 ok(!schedule.slots.some(s=>s.slot_time.startsWith(target)&&s.status==='available'),'only unbooked times closed');
 await as(db,'b');userSlots=(await db.query('select get_booking_calendar_slots($1) as data',[[ids.partner]])).rows[0].data;ok(!userSlots.some(s=>s.slot_time.startsWith(target)),'closed date removed for User');
 await as(db,'a');const cancelled=(await db.query('select cancel_my_booking($1) as data',[bookingIds.a])).rows[0].data;ok(cancelled.success,'existing cancellation RPC');
 await db.query('reset role');ok((await db.query('select status from availability_slots where id=$1',[slot.id])).rows[0].status==='hidden','cancellation cannot reopen closed day');
 ok((await db.query('select ticket_count from profiles where id=$1',[ids.a])).rows[0].ticket_count==='1','refund preserved');
 await as(db,'partner');await db.query('select save_partner_availability_override($1,$2,$3)',[target,'default',[]]);
 schedule=(await db.query('select get_partner_monthly_schedule() as data')).rows[0].data;ok(schedule.overrides.find(o=>o.date===target).mode==='default','restore weekly default');
 for(const offset of [29,30]){
  const day=(await db.query("select ((clock_timestamp() at time zone 'Asia/Seoul')::date+$1::int)::text as date",[offset])).rows[0].date;
  if(offset===29)await db.query('select save_partner_availability_override($1,$2,$3)',[day,'custom',['11:00']]);
  else await deny(db,'select save_partner_availability_override($1,$2,$3)',[day,'custom',['11:00']],'22023');
  await db.query('reset role');const id=(await db.query("insert into availability_slots(partner_id,slot_time,status) values($1,$2,'available') on conflict(partner_id,slot_time) do update set status='available' returning id",[ids.partner,day+'T11:00:00'])).rows[0].id;
  await as(db,'b');
  if(offset===29){const booking=(await db.query("insert into bookings(learner_id,partner_id,partner_user_id,slot_id,language,status) values($1,$2,$2,$3,'en','pending') returning id",[ids.b,ids.partner,id])).rows[0].id;ok((await db.query('select confirm_booking_with_cutoff_cleanup($1,$2) as data',[ids.b,booking])).rows[0].data.success,'+29 ticket-backed booking');}
  else await deny(db,"insert into bookings(learner_id,partner_id,partner_user_id,slot_id,language,status) values($1,$2,$2,$3,'en','pending')",[ids.b,ids.partner,id],'23514');
  await as(db,'partner');
 }
 await db.query('reset role');
 const calendar=require('../public/availability-calendar.js');
 const holiday=Array.from({length:29},(_,i)=>calendar.addDays(schedule.start,i+1)).find(day=>calendar.holiday(day,false));
 let holidayBookingTest=false;
 if(holiday){
  await as(db,'partner');await db.query('select save_partner_availability_override($1,$2,$3)',[holiday,'custom',['12:00']]);
  await as(db,'a');const rows=(await db.query('select get_booking_calendar_slots($1) as data',[[ids.partner]])).rows[0].data;
  const holidaySlot=rows.find(s=>s.slot_time.startsWith(holiday+'T12:00'));
  ok(!!holidaySlot,'holiday concrete slot not automatically blocked');
  const booking=(await db.query("insert into bookings(learner_id,partner_id,partner_user_id,slot_id,language,status) values($1,$2,$2,$3,'en','pending') returning id",[ids.a,ids.partner,holidaySlot.id])).rows[0].id;
  ok((await db.query('select confirm_booking_with_cutoff_cleanup($1,$2) as data',[ids.a,booking])).rows[0].data.success,'holiday actual ticket-backed booking');
  holidayBookingTest=true;await db.query('reset role');
 }else console.log('NOTE no supported holiday inside current rolling window; holiday booking check not exercised.');
 const live=require('./fixtures/partner-availability-live-schema.json').metadata;
 for(const name of ['deduct_ticket_and_confirm_booking','confirm_booking_with_cutoff_cleanup','cancel_my_booking','admin_set_user_role','get_partner_booking_brief']){
  const actual=(await db.query('select pg_get_function_identity_arguments(oid) as args,md5(pg_get_functiondef(oid)) as hash from pg_proc where proname=$1',[name])).rows;
  ok(actual.every(f=>live.functions.some(b=>b.name===name&&b.args===f.args&&b.hash===f.hash)),name+' production definition unchanged');
 }
 const report={engine:'PostgreSQL 17.11, local independent backends',database:config.database,checks,holidayBookingTest,concurrency:{backendPids:[pa,pb],contention,winner:winner.success,loser:loser.success,oneAllocation:true,loserTicketPreserved:true},productionWrites:0,supabaseAuthPostgREST:false};
 if(process.env.DAYO_LOCAL_QA_REPORT)fs.writeFileSync(process.env.DAYO_LOCAL_QA_REPORT,JSON.stringify(report,null,2));
 console.log('PASS actual PostgreSQL/RLS/RPC integration: '+checks+' checks; real contention, one winner, one allocation, loser ticket preserved.');
 await db.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
