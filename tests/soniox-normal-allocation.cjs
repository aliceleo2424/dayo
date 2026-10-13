'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{const pg=new PGlite();let checks=0;
const L=crypto.randomUUID(),P=crypto.randomUUID(),X=crypto.randomUUID(),B=crypto.randomUUID();
await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table profiles(id uuid primary key);create table bookings(id uuid primary key,learner_id uuid,partner_user_id uuid,status text,scheduled_at timestamptz);
create function get_room_session_state(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
insert into profiles values('${L}'),('${P}'),('${X}');
insert into bookings values('${B}','${L}','${P}','confirmed',clock_timestamp()-interval '1 minute');`);
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/113_soniox_normal_sessions.sql'),'utf8');await pg.exec(sql);
async function rpc(action,b=B,u=L,id=null,out=null,exp=null,code=null,budget=2){return (await pg.query('select dayo_soniox_session_allocation($1,$2,$3,$4,$5,$6,$7,$8) a',[action,b,u,id,out,exp,code,budget])).rows[0].a;}
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
eq((await rpc('state')).available,true);await assert.rejects(rpc('state',B,X),/not_booking_participant/);checks++;
for(const role of ['anon','authenticated','service_role']){const r=await pg.query("select has_function_privilege($1,'dayo_soniox_session_allocation(text,uuid,uuid,uuid,text,timestamptz,text,numeric)','EXECUTE') ok",[role]);eq(r.rows[0].ok,role==='service_role');}
const ids=Array.from({length:10},()=>crypto.randomUUID());const claims=await Promise.all(ids.map(id=>rpc('reserve',B,L,id)));eq(claims.filter(c=>c.reserved).length,1);
const grant=claims.find(c=>c.reserved);assert(grant.max_seconds>0&&grant.max_seconds<=1500);checks++;
eq((await rpc('state')).available,false);eq((await rpc('reserve',B,P,crypto.randomUUID())).reserved,true);
await rpc('finish',B,L,grant.reservation_id,'failed',null,'provider_timeout');eq((await rpc('reserve',B,L,crypto.randomUUID())).reserved,false);
const other=crypto.randomUUID();await pg.query("insert into bookings values($1,$2,$3,'confirmed',clock_timestamp()-interval '1 minute')",[other,L,P]);eq((await rpc('reserve',other,L,crypto.randomUUID())).reserved,true);
const future=crypto.randomUUID(),past=crypto.randomUUID(),cancel=crypto.randomUUID();
await pg.query("insert into bookings values($1,$4,$5,'confirmed',clock_timestamp()+interval '1 hour'),($2,$4,$5,'confirmed',clock_timestamp()-interval '1 hour'),($3,$4,$5,'cancelled',clock_timestamp()-interval '1 minute')",[future,past,cancel,L,P]);
for(const b of [past,cancel]){await assert.rejects(rpc('reserve',b,L,crypto.randomUUID()),/session_not_active/);checks++;}
await assert.rejects(rpc('reserve',future,L,crypto.randomUUID()),/session_not_started/);checks++;
await assert.rejects(rpc('reserve',other,P,crypto.randomUUID(),null,null,null,3),/invalid_request/);checks++;
eq((await rpc('reserve',other,P,crypto.randomUUID(),null,null,null,.3)).error,'project_budget_exhausted');
const before=(await pg.query('select sum(reserved_usd)::text v from soniox_session_allocations')).rows[0].v;
await pg.query('delete from profiles where id=$1',[L]);eq((await pg.query('select sum(reserved_usd)::text v from soniox_session_allocations')).rows[0].v,before);
await pg.query('delete from bookings where id=$1',[B]);eq((await pg.query('select sum(reserved_usd)::text v from soniox_session_allocations')).rows[0].v,before);
await assert.rejects(pg.exec(sql),/soniox_session_objects_exist/);await pg.exec('rollback');checks++;
console.log('PASS '+checks+' new normal-session allocation checks: roles, service-only RPC, per-booking guard, queued concurrent reservation, time/status limits, conservative budget, failure/deletion do not refund.');
console.log('NOT TESTED: real multi-worker PostgreSQL contention, actual Soniox issuance/audio; no Production writes.');await pg.close();
})().catch(e=>{console.error(e);process.exitCode=1;});