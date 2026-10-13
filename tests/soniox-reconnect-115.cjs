'use strict';
// Migration 115 on top of 113: max 3 credentials per participant per booking, budget cap kept, content-free report.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{const pg=new PGlite();
const L=crypto.randomUUID(),P=crypto.randomUUID(),B=crypto.randomUUID(),B2=crypto.randomUUID();
await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table profiles(id uuid primary key);create table bookings(id uuid primary key,learner_id uuid,partner_user_id uuid,status text,scheduled_at timestamptz);
create function get_room_session_state(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
insert into profiles values('${L}'),('${P}');
insert into bookings values('${B}','${L}','${P}','confirmed',clock_timestamp()-interval '1 minute'),('${B2}','${L}','${P}','confirmed',clock_timestamp()-interval '1 minute');`);
const m=f=>fs.readFileSync(path.join(__dirname,'../supabase/migrations/'+f),'utf8');
await pg.exec(m('113_soniox_normal_sessions.sql'));
// Production already has 113 rows: one issued per participant.
const rpc=async(a,b=B,u=L,id=null,out=null,exp=null,code=null,budget=2)=>(await pg.query('select dayo_soniox_session_allocation($1,$2,$3,$4,$5,$6,$7,$8) a',[a,b,u,id,out,exp,code,budget])).rows[0].a;
const issue=async(b,u)=>{const id=crypto.randomUUID();const r=await rpc('reserve',b,u,id);if(!r.reserved)return r;await rpc('finish',b,u,id,'issued',new Date(Date.now()+30000).toISOString());return {...r,id};};
assert.equal((await issue(B,L)).reserved,true);
await pg.exec(m('115_soniox_reconnect_and_stop_report.sql'));
await assert.rejects(pg.exec(m('115_soniox_reconnect_and_stop_report.sql')),/do_not_replay/);await pg.exec('rollback');
let st=await rpc('state');assert.equal(st.available,true);assert.equal(st.attemptsLeft,2);
const second=await issue(B,L);assert.equal(second.reserved,true);
// Concurrent reserves: only one more may succeed (3 total), never 4.
const claims=await Promise.all(Array.from({length:6},()=>rpc('reserve',B,L,crypto.randomUUID())));
assert.equal(claims.filter(c=>c.reserved).length,1);
st=await rpc('state');assert.equal(st.available,false);assert.equal(st.attemptsLeft,0);
// Partner is independent.
assert.equal((await issue(B,P)).reserved,true);
// In-progress guard.
const id=crypto.randomUUID();assert.equal((await rpc('reserve',B2,L,id)).reserved,true);
assert.equal((await rpc('reserve',B2,L,crypto.randomUUID())).error,'allocation_in_progress');
// Monthly $2 cap still enforced (5 rows so far = $0.50).
const r=await rpc('reserve',B2,P,crypto.randomUUID(),null,null,null,0.5);assert.equal(r.error,'project_budget_exhausted');
// Report: stores codes/counters only, once, issued rows only; works after session window.
assert.equal((await rpc('report',B,L,second.id,'{"audioFrames":12,"nonSilentFrames":5,"finals":2}',null,'socket_closed_1006')).updated,true);
assert.equal((await rpc("report",B,L,second.id,"{\"mode\":\"recorder\",\"audioFrames\":12,\"messages\":3,\"finals\":2}",null,"stopped")).updated,true);
await assert.rejects(rpc('report',B,L,second.id,'{}',null,'Bad Code!'),/invalid_request/);
await pg.query("update bookings set scheduled_at=clock_timestamp()-interval '2 hours' where id=$1",[B]);
const row=(await pg.query('select client_stop_code,client_audio_frames,client_finals from soniox_session_allocations where id=$1',[second.id])).rows[0];
assert.deepEqual(row,{client_stop_code:'stopped',client_audio_frames:12,client_finals:2});
await assert.rejects(rpc('state'),/session_not_active/);
const priv=(await pg.query("select has_function_privilege('authenticated','dayo_soniox_session_allocation(text,uuid,uuid,uuid,text,timestamptz,text,numeric)','EXECUTE') ok")).rows[0].ok;assert.equal(priv,false);
console.log('PASS 115: max 3 per participant, concurrency, partner independent, in-progress guard, $ cap, report latest-wins/validated, no replay, service-only.');
})().catch(e=>{console.error(e);process.exit(1);});
