 'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
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
 await db.exec("alter table availability_slots alter column id set default gen_random_uuid();alter table availability_slots add constraint availability_slots_status_check check(status in ('available','booked'));alter table availability_slots add unique(partner_id,slot_time);");
 await db.exec(read('supabase/migrations/084_partner_monthly_availability.sql'));
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
  const slotTime=(await db.query("select to_char(((clock_timestamp() at time zone 'Asia/Seoul')::date+$1::int)+time '12:00','YYYY-MM-DD\"T\"HH24:MI:SS') value",[options.offset||8])).rows[0].value;
  await db.query("insert into availability_slots values($1,$2,'booked',$3,now())",[b.slot,partner,slotTime]);
  await db.query("insert into ticket_lots values($1,$2,0,1,now()+$3*interval '1 day','purchase',now())",[b.lot,learner,options.expired?-1:30]);
  await db.query("insert into bookings(id,learner_id,partner_id,partner_user_id,slot_id,status,ticket_deducted,scheduled_at,language) values($1,$2,$3,$3,$4,$5,true,$6::timestamp at time zone 'Asia/Seoul','en')",[b.id,learner,partner,b.slot,options.status||'confirmed',slotTime]);
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

 // Existing 084 and 091 are tested together; no migration or function is modified.
 async function roundedBooking(offset){
  const b=await booking(8,{offset});await owner();
  const date=(await db.query("select ((clock_timestamp() at time zone 'Asia/Seoul')::date+$1::int)::text as slot_date",[offset])).rows[0].slot_date;
  return {b,date};
 }
 for(const mode of ['closed','custom']){
  const {b,date}=await roundedBooking(mode==='closed'?2:3);
  await actor(partner);await db.query('select save_partner_availability_override($1,$2,$3)',[date,mode,mode==='custom'?['13:00']:[]]);
  check((await state(b)).slot_status==='booked'&&(await state(b)).status==='confirmed','Override '+mode+' preserves confirmed reservation');
  const result=await cancel(b,'schedule_change');
  check(result.success&&result.ticket_refunded&&result.penalty_amount===0,'091 refund succeeds with '+mode+' date override');
  const actual=await state(b);
  check(actual.status==='cancelled'&&actual.slot_status==='hidden'&&actual.quantity_remaining===1&&actual.events===1&&actual.lifecycle_events===1&&actual.notifications===2,'Cancellation releases booking while respecting '+mode+' effective availability');
  await cancel(b);assert.deepEqual(await state(b),actual);checks++;
  await actor(learner);const rows=(await db.query('select get_booking_calendar_slots($1) rows',[[partner]])).rows[0].rows;
  check(!rows.some(s=>s.id===b.slot),'Cancelled '+mode+' slot stays excluded from User booking');
  if(mode==='custom')check(rows.some(s=>s.slot_time===date+'T13:00:00'),'Unreserved custom time remains available');
 }
 const {b,date}=await roundedBooking(4);
 await actor(partner);await db.query('select save_partner_availability_override($1,$2,$3)',[date,'closed',[]]);
 await actor(learner);const user=(await db.query('select cancel_my_booking($1) result',[b.id])).rows[0].result;
 check(user.success&&user.ticket_refunded,'Existing User early cancellation still refunds original ticket');
 check((await state(b)).slot_status==='hidden'&&(await state(b)).quantity_remaining===1,'User cancellation respects closed override');
 }finally{await db.close();}
}
(async()=>{await database();console.log('PASS availability/cancellation integration: '+checks+' checks; unchanged 084 + 091, confirmed protection, original refund, closed/custom eligibility, notifications and retry. No production mutation.');})().catch(e=>{console.error(e);process.exitCode=1});
