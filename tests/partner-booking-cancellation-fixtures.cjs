 'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');
const {dispatch,buildMessage}=require('../api/_lib/booking-notifications');
const {createHandler}=require('../api/booking-notifications');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const learner=uid(1),partner=uid(2),otherPartner=uid(3),admin=uid(4);
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
async function database(){
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text,nickname text,ticket_count integer default 0,point_balance integer default 0,updated_at timestamptz);
 create table availability_slots(id uuid primary key,partner_id uuid,status text,slot_time text,updated_at timestamptz);
 create table bookings(id uuid primary key,learner_id uuid,partner_id uuid,partner_user_id uuid,slot_id uuid,status text,
 ticket_deducted boolean default false,ticket_refunded boolean default false,partner_rewarded boolean not null default false,
 scheduled_at timestamptz,language text,end_reason text,ended_at timestamptz,completed_at timestamptz,updated_at timestamptz,created_at timestamptz default now());
 create table ticket_lots(id uuid primary key,user_id uuid,quantity_remaining integer,quantity_issued integer,expires_at timestamptz,source text,updated_at timestamptz);
 create table ticket_allocations(id uuid primary key,booking_id uuid unique,ticket_lot_id uuid,quantity integer check(quantity=1),consumed_at timestamptz,refunded_at timestamptz,refund_reason text,check(refunded_at is null or refunded_at>=consumed_at));
 create table session_events(booking_id uuid,actor_user_id uuid,event_type text);
 create function refresh_ticket_balance_cache(p_user_id uuid) returns integer language plpgsql as $$declare n integer;begin
 select coalesce(sum(quantity_remaining),0)::integer into n from public.ticket_lots where user_id=p_user_id and expires_at>now();
 update public.profiles set ticket_count=n where id=p_user_id;return n;end$$;
 create function dayo_is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
 grant usage on schema public,auth to authenticated,anon,service_role;`);
 const production=require('./partner-cancellation-production-contract.json');
 const live=production.functions.find(f=>f.name==='cancel_my_booking');
 await db.exec(live.definition);
 await db.exec('revoke all on function cancel_my_booking(uuid) from public,anon;grant execute on function cancel_my_booking(uuid) to authenticated;');
 await db.exec(read('supabase/migrations/071_partner_reward_reliability.sql'));
 await db.exec(read('supabase/proposals/booking_notifications.sql'));
 for(const f of production.functions){await db.exec(f.definition);const signature={cancel_my_booking:'uuid',claim_booking_notification:'uuid,text',complete_session_and_reward_partner:'uuid,uuid,integer',enqueue_booking_notification:'',refund_booking_ticket:'uuid,text'}[f.name];await db.exec('revoke all on function '+f.name+'('+signature+') from public,anon,authenticated,service_role');for(const grant of f.acl.slice(1,-1).split(',')){const role=grant.split('=')[0];if(role!=='postgres')await db.exec('grant execute on function '+f.name+'('+signature+') to '+role);}}
 const rewardAclBefore=(await db.query("select proacl::text acl from pg_proc where proname='complete_session_and_reward_partner'")).rows[0].acl;
 for(const f of production.functions)check(require('node:crypto').createHash('md5').update(f.definition).digest('hex')===f.hash,'Exact captured live definition fingerprint '+f.name);
 const before=(await db.query("select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where proname in ('cancel_my_booking','refresh_ticket_balance_cache')")).rows;
 const createdAtBefore=(await db.query("select attnotnull from pg_attribute where attrelid='bookings'::regclass and attname='created_at'")).rows[0];
 await db.exec(read('supabase/migrations/091_partner_booking_cancellation.sql'));
 assert.deepEqual((await db.query("select attnotnull from pg_attribute where attrelid='bookings'::regclass and attname='created_at'")).rows[0],createdAtBefore);checks++;
 check(createdAtBefore.attnotnull===false,'Production bookings.created_at stays nullable after 091');
 check((await db.query("select attnotnull from pg_attribute where attrelid='booking_lifecycle_events'::regclass and attname='booking_created_at'")).rows[0].attnotnull===true,'History requires the actual non-null original creation timestamp');
 assert.deepEqual((await db.query("select proname,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where proname in ('cancel_my_booking','refresh_ticket_balance_cache')")).rows,before);checks++;
 assert.equal((await db.query("select proacl::text acl from pg_proc where proname='complete_session_and_reward_partner'")).rows[0].acl,rewardAclBefore);checks++;
 for(const [id,role,name] of [[learner,'user','Fixture Learner'],[partner,'partner','Fixture Partner'],[otherPartner,'partner','Other'],[admin,'admin','Admin']])await db.query('insert into profiles(id,role,nickname) values($1,$2,$3)',[id,role,name]);
 async function owner(){await db.exec('reset role');}
 async function actor(id,role='authenticated'){await owner();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
 let seq=100;
 async function booking(hours=8,options={}){
  await owner();const n=seq++,b={id:uid(n),slot:uid(n+1000),lot:uid(n+2000),allocation:uid(n+3000)};
  await db.query("insert into availability_slots values($1,$2,'booked',(now()+$3*interval '1 hour')::text,now())",[b.slot,partner,hours]);
  await db.query("insert into ticket_lots values($1,$2,0,1,now()+$3*interval '1 day','purchase',now())",[b.lot,learner,options.expired?-1:30]);
  await db.query("insert into bookings(id,learner_id,partner_id,partner_user_id,slot_id,status,ticket_deducted,scheduled_at,language) values($1,$2,$3,$3,$4,$5,true,now()+$6*interval '1 hour','en')",[b.id,learner,partner,b.slot,options.status||'confirmed',hours]);
  await db.query('insert into ticket_allocations(id,booking_id,ticket_lot_id,quantity,consumed_at) values($1,$2,$3,1,now()-interval \'1 day\')',[b.allocation,b.id,b.lot]);
  b.original=(await db.query('select source,expires_at,quantity_issued from ticket_lots where id=$1',[b.lot])).rows[0];
  b.originalBooking=(await db.query('select created_at,scheduled_at from bookings where id=$1',[b.id])).rows[0];return b;
 }
 async function cancel(b,reason='health',text=null,ack=true,id=partner){await actor(id);return (await db.query('select cancel_my_partner_booking($1,$2,$3,$4) result',[b.id,reason,text,ack])).rows[0].result;}
 async function state(b){await owner();return (await db.query(`select b.status,b.end_reason,b.ticket_refunded,b.partner_rewarded,l.quantity_remaining,l.quantity_issued,l.source,l.expires_at,s.status slot_status,
 (select count(*)::int from partner_booking_cancellations where booking_id=b.id) events,
 (select count(*)::int from booking_lifecycle_events where booking_id=b.id) lifecycle_events,
 (select count(*)::int from partner_cancellation_penalties where booking_id=b.id) penalties,
 (select count(*)::int from booking_notification_log where booking_id=b.id) notifications
 from bookings b join ticket_allocations a on a.booking_id=b.id join ticket_lots l on l.id=a.ticket_lot_id join availability_slots s on s.id=b.slot_id where b.id=$1`,[b.id])).rows[0];}
 await db.exec(`create or replace function dayo_partner_cancellation_policy() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('enabled',false,'late_penalty_amount',null,'settlement_mode',null)$$;`);
 let adapted=read('supabase/migrations/091_partner_booking_cancellation.sql').split('CREATE OR REPLACE FUNCTION public.complete_session_and_reward_partner')[1].split('$function$')[1];
 const original=production.functions.find(f=>f.name==='complete_session_and_reward_partner').definition.replace(/\r\n/g,'\n').split('$function$')[1];
 adapted=adapted.replace('  v_penalty_offset integer := 0;\n','')
  .replace('  select coalesce(sum(offset_amount),0)::integer into v_penalty_offset\n    from public.partner_cancellation_penalty_offsets where reward_booking_id=p_booking_id;\n\n','')
  .replace("'rewarded_points', v_ledger_amount - v_penalty_offset,\n      'penalty_offset', v_penalty_offset,\n      'gross_reward_amount', v_ledger_amount,","'rewarded_points', v_ledger_amount,")
  .replace('  v_penalty_offset := public.apply_partner_cancellation_reward_offsets(p_booking_id,v_actor_id,v_reward_amount);\n\n','')
  .replace('coalesce(point_balance, 0) + v_reward_amount - v_penalty_offset','coalesce(point_balance, 0) + v_reward_amount')
  .replace("'rewarded_points', v_reward_amount - v_penalty_offset,\n    'penalty_offset', v_penalty_offset,\n    'gross_reward_amount', v_reward_amount,","'rewarded_points', v_reward_amount,");
 assert.equal(adapted,original,'Every live reward evidence/identity/legacy/conflict/time guard and message preserved');checks++;
 const disabled=await booking(8);assert.deepEqual(await cancel(disabled),{success:false,code:'partner_cancellation_policy_pending'});
 check((await state(disabled)).quantity_remaining===0,'Disabled policy fails closed before ANY mutation');
 await actor(partner);const disabledPreview=(await db.query('select get_my_partner_cancellation_preview($1) result',[disabled.id])).rows[0].result;
 check(disabledPreview.enabled===false&&disabledPreview.penalty_amount===0,'Own-only preview works with activation disabled');
 // Local DB only. User has approved 6000P assessed debt/future normal reward offset.
 await owner();await db.exec(`create or replace function dayo_partner_cancellation_policy() returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('enabled',true,'late_penalty_amount',6000,'settlement_mode','future_reward_offset')$$;`);
 const exact=(await db.query("select dayo_partner_cancellation_is_late('2026-10-10 15:00:00+09','2026-10-10 09:00:00+09') exact,dayo_partner_cancellation_is_late('2026-10-10 14:59:59.999999+09','2026-10-10 09:00:00+09') below")).rows[0];
 check(exact.exact===false&&exact.below===true,'Exactly 6h early; one microsecond below late');
 // Nullable live column: missing original fact is rejected before any refund/event write.
 for(const hours of [8,5]){
  const missing=await booking(hours);await owner();await db.query('update bookings set created_at=null where id=$1',[missing.id]);
  const initial=await state(missing);
  const allocationBefore=(await db.query('select * from ticket_allocations where booking_id=$1',[missing.id])).rows[0];
  const pointsBefore=(await db.query('select point_balance,ticket_count from profiles where id in ($1,$2) order by id',[learner,partner])).rows;
  await assert.rejects(cancel(missing,'health',null,true),error=>error.code==='23514'&&error.hint==='booking_created_at_missing'&&/cancellation was not performed/.test(error.message));checks++;
  await assert.rejects(cancel(missing,'health',null,true),/Booking creation timestamp is missing/);checks++;
  await actor(partner);await assert.rejects(db.query('select get_my_partner_cancellation_preview($1)',[missing.id]),/Booking creation timestamp is missing/);checks++;
  assert.deepEqual(await state(missing),initial);checks++;
  assert.deepEqual((await db.query('select * from ticket_allocations where booking_id=$1',[missing.id])).rows[0],allocationBefore);checks++;
  assert.deepEqual((await db.query('select point_balance,ticket_count from profiles where id in ($1,$2) order by id',[learner,partner])).rows,pointsBefore);checks++;
  check((await db.query('select created_at from bookings where id=$1',[missing.id])).rows[0].created_at===null,'Missing creation time is never repaired/substituted; '+hours+'h');
  check(initial.status==='confirmed'&&initial.slot_status==='booked'&&initial.quantity_remaining===0&&initial.events===0&&initial.lifecycle_events===0&&initial.penalties===0&&initial.notifications===0,'Null-created booking fails closed without cancellation/refund/penalty/outbox; '+hours+'h');
 }
 const early=await booking(8);const e=await cancel(early,'schedule_change');check(e.success&&!e.late_cancel&&e.penalty_amount===0,'Partner early cancellation succeeds without penalty');
 const es=await state(early);check(es.status==='cancelled'&&es.ticket_refunded&&!es.partner_rewarded&&es.quantity_remaining===1&&es.slot_status==='available'&&es.events===1&&es.penalties===0&&es.notifications===2,'Atomic early original-ticket refund, slot reopen and two recipient events');
 assert.equal(es.source,early.original.source);assert.equal(es.expires_at.getTime(),early.original.expires_at.getTime());assert.equal(es.quantity_issued,1);checks++;
 const late=await booking(5);check((await cancel(late,'other','  private health details <script> \n ')).late_cancel,'Late cancellation creates assessment');
 const ls=await state(late);check(ls.quantity_remaining===1&&ls.penalties===1&&ls.notifications===2&&!ls.partner_rewarded,'Late cancellation refunds ONLY original ticket and records one penalty');
 const retry=await cancel(late);check(retry.already_cancelled&&retry.success,'Cancelled retry is idempotent');assert.deepEqual(await state(late),ls);checks++;
 await owner();const event=(await db.query('select * from partner_booking_cancellations where booking_id=$1',[late.id])).rows[0];
 check(event.reason_text==='private health details <script>','Trim/control-character sanitization; admin-only plain text remains auditable');
 // M-R: immutable lifecycle snapshots, actual refund refs, privacy and exact times.
 async function history(b){await actor(admin);return (await db.query('select get_admin_booking_lifecycle_history($1) result',[b.id])).rows[0].result;}
 const eh=(await history(early)).events,lh=(await history(late)).events;
 check(eh.length===1&&eh[0].event_type==='partner_cancelled'&&!eh[0].late_cancel&&eh[0].penalty_status==='none','M: >=6h cancellation has one canonical early history event');
 check(lh.length===1&&lh[0].late_cancel&&lh[0].penalty_ledger_booking_id===late.id&&lh[0].penalty_idempotency_key==='partner_late_cancel:'+late.id&&lh[0].penalty_amount===6000,'N: <6h history links actual 6000P penalty ledger');
 const lateHistoryBefore=JSON.stringify(lh);
 for(const [b,h] of [[early,eh[0]],[late,lh[0]]]){
  await owner();const actual=(await db.query(`select b.created_at,b.scheduled_at,b.ended_at,a.refunded_at,a.ticket_lot_id,
   a.refund_reason,l.quantity_remaining,s.status slot_status from bookings b
   join ticket_allocations a on a.booking_id=b.id join ticket_lots l on l.id=a.ticket_lot_id
   join availability_slots s on s.id=b.slot_id where b.id=$1`,[b.id])).rows[0];
  check(new Date(h.booking_created_at).getTime()===b.originalBooking.created_at.getTime()&&new Date(h.scheduled_at).getTime()===b.originalBooking.scheduled_at.getTime(),'R: History preserves exact booking creation/original scheduled timestamps');
  check(actual.created_at.getTime()===b.originalBooking.created_at.getTime()&&actual.scheduled_at.getTime()===b.originalBooking.scheduled_at.getTime(),'R: Cancellation never rewrites original booking creation/scheduled time');
  check(new Date(h.cancelled_at).getTime()===actual.ended_at.getTime()&&new Date(h.cancelled_at).getTime()===actual.refunded_at.getTime()&&h.occurred_at===h.cancelled_at,'M/N: Original cancellation timestamp exactly matches booking/refund event');
  check(Math.abs(h.seconds_before_session-(actual.scheduled_at-actual.ended_at)/1000)<0.001&&h.late_cancel===(h.seconds_before_session<21600)&&h.timezone==='Asia/Seoul','M/N: Lead time is recomputable from original timestamptz, KST display contract');
  check(h.refunded_allocation_id===b.allocation&&h.refunded_ticket_lot_id===actual.ticket_lot_id&&h.ticket_refunded&&actual.quantity_remaining===1&&h.compensation_ticket_count===0,'P: History matches real original allocation/lot refund, no compensation ticket');
  check(h.slot_id===b.slot&&h.slot_reopened&&actual.slot_status==='available','P: History slot reference/reopen fact matches actual slot');
  check(h.notifications.length===2&&h.notifications.every(n=>n.status==='pending')&&h.user_notification_key==='booking_cancelled:'+b.id+':learner'&&h.partner_notification_key==='booking_cancelled:'+b.id+':partner','History contains durable notification keys and actual delivery state');
 }
 await owner();check((await db.query("select extract(epoch from ('2026-10-06 18:00+09'::timestamptz-'2026-10-06 13:01+09'::timestamptz))::int seconds")).rows[0].seconds===17940,'Original timestamptz reconstructs 4h59m exactly without display-text storage');
 await cancel(late);check(JSON.stringify((await history(late)).events)===lateHistoryBefore&&(await state(late)).lifecycle_events===1,'O: Cancellation retry preserves identical single history and unchanged notification/refund state');
 await actor(partner);const mine=(await db.query('select get_my_partner_cancellation_history($1) result',[late.id])).rows[0].result;
 check(mine.reason_text===event.reason_text&&mine.partner_id===partner,'Q: Submitting Partner can read own detailed reason through owner RPC');
 check(lh[0].reason_text===event.reason_text,'Q: Admin lifecycle RPC can read canonical detailed reason');
 for(const id of [learner,otherPartner]){
  await actor(id);await assert.rejects(db.query('select get_admin_booking_lifecycle_history($1)',[late.id]),/Admin access/);checks++;
  await assert.rejects(db.query('select get_my_partner_cancellation_history($1)',[late.id]),/owner access/);checks++;
 }
 for(const role of ['authenticated','anon','service_role']){
  await actor(partner,role);await assert.rejects(db.query('select * from booking_lifecycle_events'),/permission denied/);checks++;
  await assert.rejects(db.query('select dayo_booking_lifecycle_history($1)',[late.id]),/permission denied/);checks++;
 }
 await actor(partner,'anon');await assert.rejects(db.query('select get_my_partner_cancellation_history($1)',[late.id]),/permission denied/);checks++;
 check(!JSON.stringify(retry).includes('reason_text')&&!JSON.stringify(retry).includes(event.reason_text),'Q: User-facing cancellation response contains no detailed reason');
 await owner();const rawHistory=(await db.query('select * from booking_lifecycle_events where booking_id=$1',[late.id])).rows[0];
 await assert.rejects(db.query("update booking_lifecycle_events set scheduled_at=scheduled_at+interval '1 hour' where booking_id=$1",[late.id]),/immutable/);checks++;
 await assert.rejects(db.query('delete from booking_lifecycle_events where booking_id=$1',[late.id]),/immutable/);checks++;
 await assert.rejects(db.exec('truncate booking_lifecycle_events'),/immutable/);checks++;
 await assert.rejects(db.query('insert into booking_lifecycle_events select * from booking_lifecycle_events where booking_id=$1',[late.id]),/unique|duplicate/);checks++;
 check(JSON.stringify((await db.query('select * from booking_lifecycle_events where booking_id=$1',[late.id])).rows[0])===JSON.stringify(rawHistory),'History immutable under UPDATE/DELETE/TRUNCATE/duplicate attempts');
 // Read-only Admin/Partner RPCs cannot change any durable cancellation ledger.
 const beforeReads=await state(late);await history(late);await actor(partner);await db.query('select get_my_partner_cancellation_history($1)',[late.id]);assert.deepEqual(await state(late),beforeReads);checks++;
 await owner();const logs=(await db.query('select * from booking_notification_log where booking_id=$1',[late.id])).rows;
 check(logs.every(n=>!JSON.stringify(n.snapshot).includes('private health')&&!Object.hasOwn(n.snapshot,'reason_text')),'Detailed reason never enters durable notification snapshots');
 const user=logs.find(n=>n.recipient_role==='learner');check(!Object.hasOwn(user.snapshot,'reason_code')&&user.snapshot.public_reason==='partner_circumstances','User snapshot conceals sensitive reason code');
 const userMail=buildMessage(user,'learner@fixture.test','Fixture Partner'),partnerMail=buildMessage(logs.find(n=>n.recipient_role==='partner'),'partner@fixture.test');
 check(userMail.subject==='[DayO 돼요] 예약된 대화가 취소됐어요'&&userMail.text.includes('파트너 사정')&&!userMail.text.includes('private health'),'Privacy-safe User cancellation email');
 check(partnerMail.subject==='[DayO 돼요] 대화 예약 취소가 완료됐어요'&&partnerMail.text.includes('취소 사유: 기타')&&partnerMail.text.includes('6,000P')&&!partnerMail.text.includes('private health'),'Partner email includes label and fixture penalty, never private text');
 await assert.rejects(cancel(await booking(), 'health',null,true,otherPartner),/Partner booking access/);checks++;
 await assert.rejects(cancel(await booking(), 'health',null,true,learner),/Partner access/);checks++;
 await actor(partner,'anon');await assert.rejects(db.query('select cancel_my_partner_booking($1,$2,null,true)',[early.id,'health']),/permission denied/);checks++;
 for(const status of ['completed','no_show','cancelled']){const b=await booking(8,{status});await assert.rejects(cancel(b),/confirmed|inconsistent/);check((await state(b)).quantity_remaining===0,'Non-confirmed '+status+' is rejected');}
 const past=await booking(-1);await assert.rejects(cancel(past),/Past booking/);checks++;
 const ack=await booking(5);check((await cancel(ack,'health',null,false)).code==='late_penalty_confirmation_required','Boundary change requires explicit late acknowledgement');check((await state(ack)).quantity_remaining===0,'Missing acknowledgement does not refund');
 for(const [reason,text] of [['invalid',null],['other','  '],['other','x'.repeat(301)],['health','secret']]){const b=await booking();await assert.rejects(cancel(b,reason,text),/reason|text/);check((await state(b)).events===0,'Invalid reason does not mutate');}
 const expired=await booking(8,{expired:true});check((await cancel(expired)).success,'Expired original ticket can be restored without extending expiry');check((await state(expired)).expires_at.getTime()===expired.original.expires_at.getTime(),'Original expiry preserved even when already expired');
 await owner();const lots=(await db.query('select count(*)::int n from ticket_lots')).rows[0].n;const allocations=(await db.query('select count(*)::int n from ticket_allocations')).rows[0].n;check(lots===allocations,'No compensation/free ticket lot exists');
 for(const id of [learner,partner,otherPartner,admin]){await actor(id);await assert.rejects(db.query('select * from partner_booking_cancellations'),/permission denied/);checks++;}
 await actor(partner);await assert.rejects(db.query('select get_admin_partner_cancellation($1)',[late.id]),/Admin access/);checks++;
 await actor(admin);check((await db.query('select get_admin_partner_cancellation($1) result',[late.id])).rows[0].result.reason_text===event.reason_text,'Admin compatibility RPC retains detailed reason access');
 await owner();await assert.rejects(db.query('update partner_cancellation_penalties set penalty_amount=1 where booking_id=$1',[late.id]),/immutable/);checks++;
 await assert.rejects(db.query('delete from partner_booking_cancellations where booking_id=$1',[late.id]),/immutable/);checks++;
 // SQL failure after refund/event writes must roll the whole cancellation back.
 const atomic=await booking();await db.exec(`create function fixture_slot_failure() returns trigger language plpgsql as $$begin if new.id='${atomic.slot}' and new.status='available' then raise exception 'fixture slot failure';end if;return new;end$$;create trigger fixture_slot_failure before update on availability_slots for each row execute function fixture_slot_failure();`);
 await assert.rejects(cancel(atomic),/fixture slot failure/);const as=await state(atomic);check(as.status==='confirmed'&&as.quantity_remaining===0&&as.events===0&&as.lifecycle_events===0&&as.penalties===0&&as.notifications===0,'Slot failure rolls back booking/refund/ledger/outbox atomically');await db.exec('drop trigger fixture_slot_failure on availability_slots');
 // Existing User actor keeps >6h refund and <=6h no refund +6000P.
 const uearly=await booking(8);await actor(learner);check((await db.query('select cancel_my_booking($1) result',[uearly.id])).rows[0].result.ticket_refunded===true,'Existing User early refund unchanged');
 const ulate=await booking(5);await actor(learner);check((await db.query('select cancel_my_booking($1) result',[ulate.id])).rows[0].result.ticket_refunded===false,'Existing User late no-refund unchanged');
 await owner();check((await db.query('select point_balance from profiles where id=$1',[partner])).rows[0].point_balance===6000,'Only legacy User late compensation changes points; Partner penalty never debits existing balance');
 await actor(partner);check((await db.query('select complete_session_and_reward_partner($1,$2,99999) result',[late.id,partner])).rows[0].result.code==='booking_not_rewardable','Cancelled Partner booking cannot earn normal reward');
 // Normal reward settles assessment without touching pre-existing balance.
 async function reward(){const b=await booking(-1);await owner();await db.query("update bookings set end_reason='normal',ended_at=now() where id=$1",[b.id]);await db.query("insert into session_events values($1,$2,'media_connected')",[b.id,partner]);await actor(partner);return {b,result:(await db.query('select complete_session_and_reward_partner($1,$2,99) result',[b.id,partner])).rows[0].result};}
 const firstReward=await reward();check(firstReward.result.success&&firstReward.result.penalty_offset===6000&&firstReward.result.rewarded_points===0&&firstReward.result.updated_points===6000,'Future normal 6000P reward fully offsets debt and preserves old 6000P balance');
 await actor(partner);const replay=(await db.query('select complete_session_and_reward_partner($1,$2,1) result',[firstReward.b.id,partner])).rows[0].result;
 check(replay.already_rewarded&&replay.penalty_offset===6000&&replay.rewarded_points===0&&replay.updated_points===6000,'Reward retry reports same offset/net and never settles twice');
 await owner();check((await db.query('select count(*)::int n,sum(offset_amount)::int amount from partner_cancellation_penalty_offsets where penalty_booking_id=$1',[late.id])).rows[0].n===1,'One immutable settlement for one penalty/reward pair');
 const settledHistory=(await history(late)).events[0];
 check(settledHistory.penalty_status==='offset'&&settledHistory.penalty_status_at_event==='pending_offset'&&settledHistory.penalty_offset_amount===6000&&settledHistory.penalty_remaining_amount===0&&settledHistory.penalty_offsets.length===1,'Current penalty status derives from immutable offsets; original pending status stays unchanged');
 await owner();assert.deepEqual((await db.query('select * from booking_lifecycle_events where booking_id=$1',[late.id])).rows[0],rawHistory);checks++;
 const nextReward=await reward();check(nextReward.result.success&&nextReward.result.penalty_offset===0&&nextReward.result.rewarded_points===6000&&nextReward.result.updated_points===12000,'No remaining debt: subsequent normal reward credits full 6000P');
 await owner();await assert.rejects(db.query('delete from partner_cancellation_penalty_offsets where penalty_booking_id=$1',[late.id]),/immutable/);checks++;
 await actor(partner);await assert.rejects(db.query('select apply_partner_cancellation_reward_offsets($1,$2,6000)',[firstReward.b.id,partner]),/permission denied/);checks++;
 const debt1=await booking(5),debt2=await booking(5);await cancel(debt1);await cancel(debt2);
 await owner();await db.query('update profiles set point_balance=0 where id=$1',[partner]);
 check((await state(debt1)).quantity_remaining===1&&(await state(debt2)).quantity_remaining===1,'Multiple cancellations refund immediately without waiting for settlement');
 const zero1=await reward(),zero2=await reward(),zero3=await reward();
 check(zero1.result.updated_points===0&&zero1.result.penalty_offset===6000&&zero2.result.updated_points===0&&zero2.result.penalty_offset===6000,'Zero balance remains zero while two future rewards each offset one debt');
 check(zero3.result.updated_points===6000&&zero3.result.penalty_offset===0,'After all debt settled, future normal reward credits normally');
 await owner();const offsets=(await db.query('select penalty_booking_id,sum(offset_amount)::int total from partner_cancellation_penalty_offsets group by penalty_booking_id')).rows;
 check(offsets.every(x=>x.total===6000),'No penalty is over-settled across repeated normal rewards');
 // A failed future settlement/reward transaction cannot undo earlier cancellation.
 const separate=await booking(5);await cancel(separate);await owner();
 await db.exec(`create function fixture_offset_failure() returns trigger language plpgsql as $$begin raise exception 'fixture settlement unavailable';end$$;create trigger fixture_offset_failure before insert on partner_cancellation_penalty_offsets for each row execute function fixture_offset_failure();`);
 await assert.rejects(reward(),/fixture settlement unavailable/);check((await state(separate)).status==='cancelled'&&(await state(separate)).quantity_remaining===1,'Future settlement failure never rolls back already-committed cancellation/refund');
 await db.exec('drop trigger fixture_offset_failure on partner_cancellation_penalty_offsets');
 const recoverReward=await reward();check(recoverReward.result.penalty_offset===6000,'Debt still available for next normal reward after failed settlement');
 // Real outbox claim, failure, provider acceptance with lost response, frozen retry.
 const sent=new Map();let fail=true;let lost=false;const bodies=[];
 const store={
  async claim(id,event){await owner();await db.exec('set role service_role');return (await db.query('select * from claim_booking_notification($1,$2)',[id,event])).rows[0]||null;},
  async user(id){return {id,email:id===learner?'learner@fixture.test':'partner@fixture.test'};},
  async save(row,changes){await owner();await db.exec('set role service_role');let values=Object.values(changes);values.push(row.event_key,row.lease_token);const n=Object.keys(changes).length;
   const set=Object.keys(changes).map((k,i)=>{assert.match(k,/^[a-z_]+$/);return k+'=$'+(i+1)}).join(',');
   const rows=await db.query('update booking_notification_log set '+set+' where event_key=$'+(n+1)+' and lease_token=$'+(n+2)+" and status='sending' returning event_key",values);assert.equal(rows.rows.length,1);
  }
 };
 const deliver=()=>dispatch(null,{}, {bookingId:late.id,eventType:'booking_cancelled'},{store,send:async(payload,key)=>{bodies.push({key,body:JSON.stringify(payload)});if(fail)throw new Error('provider_http_503');if(!sent.has(key))sent.set(key,JSON.stringify(payload));assert.equal(sent.get(key),JSON.stringify(payload));if(lost)throw new Error('provider_response_unknown');return 'fixture-'+key;}});
 check((await deliver()).failed===2,'Provider failure leaves both committed cancellation messages in retry queue');check((await state(late)).status==='cancelled','Email failure does not roll back cancellation');
 await owner();await db.query("update booking_notification_log set next_attempt_at=now()-interval '1 minute' where booking_id=$1",[late.id]);fail=false;lost=true;
 check((await deliver()).failed===2,'Ambiguous acceptance is retried with frozen payload and provider key');
 await owner();await db.query("update booking_notification_log set next_attempt_at=now()-interval '1 minute' where booking_id=$1",[late.id]);lost=false;
 check((await deliver()).sent===2&&sent.size===2,'Retry issues exactly one provider message per recipient key');check((await deliver()).sent===0,'Duplicate dispatch sends nothing');
 await owner();const after=(await db.query('select delivery_payload,status from booking_notification_log where booking_id=$1',[late.id])).rows;check(after.every(n=>n.status==='sent'&&!JSON.stringify(n.delivery_payload).includes(event.reason_text)),'Frozen delivery payloads never contain private reason');
 const sentHistory=(await history(late)).events[0];
 check(sentHistory.notifications.every(n=>n.status==='sent'&&n.sent_at&&n.attempts===3),'Admin history reflects real failed/retried/sent outbox state without mutating history');
 check(!JSON.stringify(sentHistory).includes('fixture.test')&&!Object.hasOwn(sentHistory,'delivery_payload'),'History projection never includes recipient email or frozen private contact payload');
 // A trigger enqueue/storage failure is recovered by the SAME retry worker.
 const missing=await booking(8);await owner();
 await db.exec(`create function fixture_enqueue_failure() returns trigger language plpgsql as $$begin if new.booking_id='${missing.id}' then raise exception 'fixture enqueue unavailable';end if;return new;end$$;create trigger fixture_enqueue_failure before insert on booking_notification_log for each row execute function fixture_enqueue_failure();`);
 check((await cancel(missing,'schedule_change')).success,'Enqueue failure cannot roll back Partner cancellation');
 const missingBefore=await state(missing);check(missingBefore.status==='cancelled'&&missingBefore.quantity_remaining===1&&missingBefore.notifications===0,'Canonical cancellation/refund survives an empty failed outbox enqueue');
 const notEnqueued=(await history(missing)).events[0];
 check(notEnqueued.notifications.every(n=>n.status==='not_enqueued')&&notEnqueued.user_notification_key&&notEnqueued.partner_notification_key,'History survives enqueue failure with repairable immutable notification keys');
 await owner();await db.exec('drop trigger fixture_enqueue_failure on booking_notification_log');
 // Simulate a later current-row change locally: history/repair must use the original
 // immutable timestamp, not whatever a future workflow leaves on bookings.
 await db.query("update bookings set scheduled_at=scheduled_at+interval '1 day',language='fr' where id=$1",[missing.id]);
 const independent=(await history(missing)).events[0];
 check(independent.scheduled_at===notEnqueued.scheduled_at&&independent.language==='en','R: History original schedule/language do not depend on later mutable booking row');
 const recovered=await dispatch(null,{}, {bookingId:missing.id,eventType:'booking_cancelled'},{store,send:async(payload,key)=>{check(payload.text.includes('티켓')&&!payload.text.includes('reason_text'),'Recovered email is private-safe');return 'fixture-recovered-'+key;}});
 check(recovered.sent===2&&(await state(missing)).notifications===2,'Existing retry claim reconstructs exactly two missing messages from immutable event');
 await owner();const repaired=(await db.query('select snapshot from booking_notification_log where booking_id=$1',[missing.id])).rows;
 check(repaired.length===2&&repaired.every(n=>n.snapshot.scheduled_at===notEnqueued.scheduled_at&&n.snapshot.language==='en'),'Notification repair uses immutable original schedule/language');
 // Restore only the fixture current row before testing strict retry consistency.
 await db.query('update bookings set scheduled_at=$2,language=$3 where id=$1',[missing.id,missing.originalBooking.scheduled_at,'en']);
 check((await cancel(missing)).already_cancelled&&(await state(missing)).notifications===2,'Retry after recovery never duplicates refund or outbox');
 check((await history(missing)).events[0].notifications.every(n=>n.status==='sent'),'Recovered notifications join history by stable keys and expose sent state');
 await owner();check((await db.query('select count(*)::int n from booking_lifecycle_events where booking_id in ($1,$2)',[uearly.id,ulate.id])).rows[0].n===0,'Only Partner cancellations write new lifecycle events; existing User cancellation contract untouched');
 // Existing cancelled User notification remains Partner-only.
 check((await db.query('select count(*)::int n from booking_notification_log where booking_id=$1',[ulate.id])).rows[0].n===1,'Existing User cancellation outbox recipient contract preserved');
 const config={url:'https://fixture.invalid',anonKey:'fixture',serviceKey:'fixture-server',resendKey:'fixture-provider'};
 let dispatched=0;
 const handler=createHandler({config,clients:()=>({auth:{auth:{getUser:async()=>({data:{user:{id:partner}}})}},service:{from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:late.id,learner_id:learner,partner_user_id:partner,status:'cancelled',end_reason:'partner_cancelled_late'}})})}}),dispatch:async()=>{dispatched++;return {sent:0,failed:0};}});
 let status,body;await handler({method:'POST',headers:{authorization:'Bearer fixture-session'},body:{bookingId:late.id,event:'booking_cancelled'}},{setHeader(){},set statusCode(v){status=v},end(v){body=JSON.parse(v)}});
 check(status===202&&body.ok&&dispatched===1,'Participant API dispatch accepts committed Partner cancellation');
 check(read('supabase/migrations/091_partner_booking_cancellation.sql').includes("'settlement_mode','future_reward_offset'"),'Approved future reward offset policy only; no negative balance mode');
 }finally{await db.close();}
}
async function frontend(){
 const dom=new JSDOM('<!doctype html><html><head></head><body><button id="origin">Open</button></body></html>',{runScripts:'outside-only',url:'https://fixture.invalid'});
 const w=dom.window,now=Date.now(),booking={id:uid(9000),scheduled_at:new Date(now+5*3600000).toISOString()};
 const calls=[];let enabled=true,late=true,success=true,notify=0,refreshed=0,missingCreatedAt=false;
 const client={rpc:async(name,args)=>{calls.push({name,args});if(missingCreatedAt)return {error:{code:'23514',hint:'booking_created_at_missing'}};if(name==='get_my_partner_cancellation_preview')return {data:{booking_id:booking.id,scheduled_at:booking.scheduled_at,learner_nickname:'Fixture <Learner>',remaining_seconds:5*3600,late_cancel:late,penalty_amount:late?6000:0,enabled}};return {data:success?{success:true}:{success:false,code:'late_penalty_confirmation_required'}};}};
 w.DayOI18n={getLang:()=> 'KO'};w.DayONotifyCommittedBooking=()=>{notify++;throw new Error('fixture transport failure');};w.loadPartnerBookings=()=>{refreshed++};w.loadPartnerSchedule=()=>{};
 w.eval(read('public/partner-booking-cancellation.js'));
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 async function open(){w.document.getElementById('origin').focus();await w.DayOPartnerCancellation.open(booking,client);}
 const btn=()=>w.document.querySelector('.pc-primary'),select=()=>w.document.getElementById('pc-reason');
 try{
  await open();check(btn().disabled,'Reason is required before continuing');
  check(w.document.querySelector('.pc-info').textContent.includes('(KST)')&&w.document.querySelector('.pc-info').textContent.includes('Fixture <Learner>')&&!w.document.querySelector('.pc-info img'),'KST + learner display uses textContent, never markup');
  select().value='other';select().dispatchEvent(new w.Event('change'));check(btn().disabled,'Other blank blocked');
  let other=w.document.getElementById('pc-other');other.value='   ';other.dispatchEvent(new w.Event('input'));check(btn().disabled,'Other whitespace blocked');other.value='Fixture reason';other.dispatchEvent(new w.Event('input'));check(!btn().disabled,'Valid other text enables initial CTA');
  btn().click();await settle();check(calls.filter(c=>c.name==='cancel_my_partner_booking').length===0,'First confirmation is read-only preview');
  check(btn().textContent==='확인하고 취소하기','Explicit second confirmation required');btn().click();await settle();check(notify===1&&refreshed===1&&!w.document.querySelector('[role=dialog]'),'Committed success closes UI despite notification transport failure');
  const sent=calls.find(c=>c.name==='cancel_my_partner_booking').args;assert.deepEqual(Object.keys(sent).sort(),['p_accept_late_penalty','p_booking_id','p_reason_code','p_reason_text']);checks++;check(sent.p_accept_late_penalty===true,'Server receives acknowledgement, never points/refund/partner ID');
  enabled=false;await open();select().value='health';select().dispatchEvent(new w.Event('change'));check(btn().disabled&&w.document.querySelector('.pc-panel').textContent.includes('정책 확정 전'),'Policy-pending cannot submit');w.DayOPartnerCancellation.close();
  enabled=true;late=false;success=false;await open();select().value='health';select().dispatchEvent(new w.Event('change'));btn().click();await settle();btn().click();await settle();check(w.document.querySelector('.pc-error').textContent.includes('패널티 기준'),'6h boundary crossing returns to review without cancellation');w.DayOPartnerCancellation.close();
  const before=calls.filter(c=>c.name==='cancel_my_partner_booking').length;await open();w.document.querySelector('.pc-actions button').click();check(calls.filter(c=>c.name==='cancel_my_partner_booking').length===before,'Go back creates no booking mutation');
  w.DayOI18n.getLang=()=> 'EN';await open();check(w.document.querySelector('.pc-panel').textContent.includes('Cancel booking')&&!w.document.querySelector('.pc-panel').textContent.includes('book.'),'English copy has no raw i18n keys');w.DayOPartnerCancellation.close();
  missingCreatedAt=true;await open();check(btn().disabled&&w.document.querySelector('.pc-error').textContent.includes('original creation time is missing'),'Missing creation timestamp shows safe English error and blocks CTA');
  w.DayOI18n.getLang=()=> 'KO';w.document.dispatchEvent(new w.CustomEvent('dayo:langchange'));check(w.document.querySelector('.pc-error').textContent.includes('예약 생성일이 없어'),'Missing timestamp error follows manual KO toggle without raw key');w.DayOPartnerCancellation.close();
  missingCreatedAt=false;success=true;await open();select().value='health';select().dispatchEvent(new w.Event('change'));btn().click();await settle();missingCreatedAt=true;btn().click();await settle();check(btn().disabled&&w.document.querySelector('.pc-error').textContent.includes('취소하지 않았습니다'),'Missing creation time at final RPC blocks retry and clearly states no cancellation');w.DayOPartnerCancellation.close();
  for(const file of ['availability-slots.js','partner-booking-cancellation.js'])check(read(file)===read('public/'+file),'Root/public mirror '+file);
  const existing=require('node:child_process').execFileSync('git',['show','HEAD:public/availability-slots.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  const current=read('public/availability-slots.js').replace(/\r\n/g,'\n');
  check(current.slice(current.indexOf('  window.savePartnerSchedule'))===existing.slice(existing.indexOf('  window.savePartnerSchedule')),'Availability save/request/window code preserved byte-for-byte');
  // Execute the real Upcoming renderer: only own confirmed FUTURE buttons.
  w.document.body.insertAdjacentHTML('beforeend','<div id="partner-upcoming-list"></div><div id="partner-upcoming-all-list"></div><div id="partner-upcoming-empty"></div><span id="partner-upcoming-count"></span>');
  const source=read('public/availability-slots.js');
  const renderer=source.slice(source.indexOf('  function renderPartnerUpcomingList('),source.indexOf('  function renderPartnerBookings('));
  w.eval(`var partnerHeroRequest=0,partnerHeroTimer=null,partnerBriefUserId='${partner}';
    function t(key){return key;}function formatUpcomingDay(){return 'Fixture';}function pad(n){return String(n).padStart(2,'0');}
    function bookingOptionLabel(){return '';}function getPartnerBookingBrief(){return Promise.resolve(null);}function closePartnerUpcomingAll(){}
    function openPartnerBookingPrep(){}function openPartnerCancellation(){return Promise.resolve();}`+renderer);
  const upcoming=[{id:uid(9500),status:'confirmed',partner_user_id:partner,scheduled_at:new Date(now+8*3600000).toISOString()},
    {id:uid(9501),status:'confirmed',partner_user_id:otherPartner,scheduled_at:new Date(now+9*3600000).toISOString()},
    {id:uid(9502),status:'confirmed',partner_user_id:partner,scheduled_at:new Date(now-10*60000).toISOString()},
    {id:uid(9503),status:'completed',partner_user_id:partner,scheduled_at:new Date(now+10*3600000).toISOString()},
    {id:uid(9504),status:'cancelled',partner_user_id:partner,scheduled_at:new Date(now+10*3600000).toISOString()},
    {id:uid(9505),status:'no_show',partner_user_id:partner,scheduled_at:new Date(now+10*3600000).toISOString()}];
  w.renderPartnerUpcomingList(upcoming,client,false);await settle();
  check(w.document.querySelectorAll('#partner-upcoming-list .partner-booking-cancel').length===1,'Only own confirmed future booking shows cancellation button; other/past/completed/cancelled/no-show excluded');
  const css=w.document.getElementById('partner-cancellation-style').textContent;
  check(css.includes('width:min(100%,480px)')&&css.includes('overflow-y:auto')&&css.includes('@media(max-width:400px)'),'Responsive containment present (visual 360/390 checked separately)');
 }finally{w.DayOPartnerCancellation.close();w.close();}
}
(async()=>{await database();await frontend();console.log('PASS Partner cancellation: '+checks+' assertions (real SQL/RLS + notification retry + DOM flow). No production mutation; approved future reward offset contract.');})().catch(e=>{console.error(e);process.exitCode=1;});
