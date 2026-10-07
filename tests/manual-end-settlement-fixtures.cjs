'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/093_admin_test_sessions.sql'),'utf8');
function definition(name){const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');assert(start>=0);const end=sql.indexOf('$function$',sql.indexOf('AS $function$',start)+14);assert(end>start);return sql.slice(start,end+'$function$'.length)+';';}
const L='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
async function main(){const db=new PGlite();try{
 await db.exec(`create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text,point_balance integer default 0,updated_at timestamptz);
 create table bookings(id uuid primary key,learner_id uuid,partner_user_id uuid,status text,is_test_session boolean default false,scheduled_at timestamptz,partner_rewarded boolean default false,end_reason text,ended_at timestamptz,completed_at timestamptz,updated_at timestamptz,ticket_deducted boolean default true,ticket_refunded boolean default false);
 create table availability_slots(booking_id uuid,status text);
 create table ticket_lots(user_id uuid,quantity_remaining integer);
 create table ticket_allocations(booking_id uuid,quantity integer,refunded_at timestamptz);
 create table partner_session_rewards(booking_id uuid primary key,partner_id uuid,reward_amount integer);
 create table partner_cancellation_penalty_offsets(reward_booking_id uuid,offset_amount integer);
 create table session_events(booking_id uuid,actor_user_id uuid,event_type text);
 insert into profiles(id,role) values('${L}','user'),('${P}','partner');
 insert into ticket_lots values('${L}',0);`);
 await db.exec(definition('complete_learner_session'));await db.exec(definition('complete_session_and_reward_partner'));
 const outputs=[];
 async function snapshot(id){return (await db.query(`select status,end_reason,completed_at::text,ended_at::text,partner_rewarded,ticket_deducted,ticket_refunded,
 (select status from availability_slots where booking_id=b.id) slot_status,(select quantity from ticket_allocations where booking_id=b.id) allocated,
 (select refunded_at::text from ticket_allocations where booking_id=b.id) allocation_refund,(select count(*)::integer from partner_session_rewards where booking_id=b.id) reward_rows from bookings b where id=$1`,[id])).rows[0];}
 for(const [index,label,minutes,role]of [[1,'User minus 30 seconds',24.5,'user'],[2,'User middle',10,'user'],[3,'Partner manual',10,'partner'],[4,'Normal timer',25.5,'user']]){
  const id='44444444-4444-4444-8444-'+String(index).padStart(12,'0');
  await db.query(`insert into bookings(id,learner_id,partner_user_id,status,scheduled_at) values($1,$2,$3,'confirmed',now()-($4::text||' minutes')::interval)`,[id,L,P,minutes]);
  await db.query("insert into availability_slots values($1,'booked')",[id]);await db.query('insert into ticket_allocations values($1,1,null)',[id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[role==='user'?L:P]);
  const before=await snapshot(id);
  if(role==='user'){
   const reason=label==='Normal timer'?'normal':'personal';const result=(await db.query('select complete_learner_session($1,$2) result',[id,reason])).rows[0].result;assert.equal(result.success,true);
   const after=await snapshot(id);assert.equal(after.end_reason,reason);assert.equal(after.status,reason==='personal'?'completed':'confirmed');assert.equal(after.completed_at!==null,reason==='personal');
   const first=after.completed_at;await db.query('select complete_learner_session($1,$2)',[id,reason]);assert.equal((await snapshot(id)).completed_at,first,'retry preserves first completion');
   if(reason==='personal'){
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[P]);const reward=(await db.query('select complete_session_and_reward_partner($1,$2,6000) result',[id,P])).rows[0].result;assert.equal(reward.success,false);assert.equal(reward.code,'booking_not_rewardable');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[L]);const promote=(await db.query("select complete_learner_session($1,'normal') result",[id])).rows[0].result;assert.equal(promote.success,false,'personal cannot silently become normal');
   }
  }else{
   // New Partner finalize calls neither learner settlement nor automatic reward.
   // The old learner-only RPC would reject this role; the DB remains unchanged.
   const rejected=(await db.query("select complete_learner_session($1,'personal') result",[id])).rows[0].result;assert.equal(rejected.success,false);assert.deepEqual(await snapshot(id),before);
  }
  const state=await snapshot(id);assert.equal(state.ticket_deducted,true);assert.equal(state.ticket_refunded,false);assert.equal(state.allocated,1);assert.equal(state.allocation_refund,null);assert.equal(state.slot_status,'booked');assert.equal(state.partner_rewarded,false);assert.equal(state.reward_rows,0);
  outputs.push({case:label,...state});
 }
 assert.equal((await db.query('select quantity_remaining from ticket_lots where user_id=$1',[L])).rows[0].quantity_remaining,0);assert.equal((await db.query('select point_balance from profiles where id=$1',[P])).rows[0].point_balance,0);
 console.log('PASS real PostgreSQL current 093 definitions: manual/personal vs normal, role, first timestamp/retry, no reward/refund/slot/ticket mutation. No production access.');console.log(JSON.stringify(outputs));
}finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
