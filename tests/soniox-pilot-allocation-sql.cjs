'use strict';
// Synthetic local PostgreSQL fixtures only; never production role simulation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const root=process.env.DAYO_PILOT_ROOT||path.resolve(__dirname,'..');
const {OWNERS}=require(path.join(root,'api/_lib/soniox-pilot-allocation.js'));
const [U,P]=Object.keys(OWNERS),X='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sql=fs.readFileSync(path.join(root,'supabase/migrations/108_soniox_owner_pilot_allocations.sql'),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,role text);
 insert into profiles values('${U}','user'),('${P}','partner'),('${X}','admin');
 alter table profiles enable row level security;
 create policy profiles_own on profiles for select to authenticated using(id=auth.uid());
 grant select on profiles to authenticated;
 create table public.bookings(id int primary key,state text);insert into bookings values(1,'sentinel-unchanged');
 create table public.session_reports(id int primary key,content text);insert into session_reports values(1,'sentinel-unchanged');`);
 await db.exec(sql);
 async function actor(id,action='state',params={},role='authenticated'){
  return db.transaction(async tx=>{
   await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);
   await tx.exec('set local role '+role);
   return (await tx.query('select public.dayo_soniox_pilot_allocation($1,$2,$3,$4,$5) result',[
    action,params.p_reservation_id||null,params.p_outcome||null,params.p_expires_at||null,params.p_failure_code||null])).rows[0].result;
  });
 }
 return {db,actor};
}
async function main(){
 const f=await fixture(),{db,actor}=f;try{
  assert.equal((await db.query('select count(*)::int n from soniox_owner_pilot_allocations')).rows[0].n,2);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='soniox_owner_pilot_allocations'::regclass")).rows[0].relrowsecurity,true);
  for(const id of [null,X])await assert.rejects(actor(id),/owner_required/);
  await assert.rejects(actor(U,'state',{},'anon'),/permission denied/);
  await assert.rejects(actor(U,'state',{},'service_role'),/permission denied/);
  for(const role of ['anon','authenticated','service_role'])for(const action of ['select * from','delete from','update']){
   const query=action==='update'?'update soniox_owner_pilot_allocations set state=\'available\'':action+' soniox_owner_pilot_allocations';
   await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query(query);}),/permission denied/);
  }
  for(const role of ['anon','authenticated','service_role'])for(const query of [
   "insert into soniox_owner_pilot_allocations(slot,owner_id,participant_role) values(1,'"+U+"','learner')",
   'truncate soniox_owner_pilot_allocations'
  ])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query(query);}),/permission denied/);
  assert.deepEqual(await actor(U),{role:'learner',state:'available',available:true});
  assert.deepEqual(await actor(P),{role:'partner',state:'available',available:true});
  await assert.rejects(actor(U,'reset'),/invalid_pilot_action/);
  await assert.rejects(actor(U,'reserve'),/invalid_pilot_request/);
  // Concurrent dispatch, isolated auth transactions. PGlite queues transactions;
  // this verifies PostgreSQL constraints/transition behavior, not physical lock contention.
  const results=await Promise.all(Array.from({length:80},(_,i)=>actor(i%2?U:P,'reserve',{p_reservation_id:require('node:crypto').randomUUID()})));
  const winners=results.filter(r=>r.reserved);assert.equal(winners.length,2);assert.deepEqual(winners.map(w=>w.role).sort(),['learner','partner']);
  const mine=winners.find(w=>w.role==='learner'),other=winners.find(w=>w.role==='partner');
  assert.equal((await actor(U,'reserve',{p_reservation_id:mine.reservation_id})).reserved,false,'same request cannot mint again');
  assert.equal((await actor(U,'finish',{p_reservation_id:other.reservation_id,p_outcome:'failed',p_failure_code:'provider_timeout'})).updated,false,'no cross-owner finish');
  await assert.rejects(actor(U,'finish',{p_reservation_id:mine.reservation_id,p_outcome:'issued',p_expires_at:new Date(Date.now()+120000).toISOString()}),/invalid_pilot_request/);
  await assert.rejects(actor(U,'finish',{p_reservation_id:mine.reservation_id,p_outcome:'issued',p_expires_at:new Date(Date.now()-1).toISOString()}),/invalid_pilot_request/);
  await actor(U,'finish',{p_reservation_id:mine.reservation_id,p_outcome:'issued',p_expires_at:new Date(Date.now()+60000).toISOString()});
  await actor(P,'finish',{p_reservation_id:other.reservation_id,p_outcome:'failed',p_failure_code:'provider_timeout'});
  assert.equal((await actor(U)).available,false);assert.equal((await actor(P)).available,false);
  assert.equal((await actor(U,'finish',{p_reservation_id:mine.reservation_id,p_outcome:'failed',p_failure_code:'confirmation_unavailable'})).updated,false,'terminal states immutable through RPC');
  await assert.rejects(db.exec("insert into soniox_owner_pilot_allocations(slot,owner_id,participant_role) values(3,'"+X+"','learner')"),/check constraint/);
  await assert.rejects(db.exec(sql),/already exist/);await db.exec('rollback');
  const before=(await actor(U));await db.query('delete from profiles where id=$1',[U]);
  await assert.rejects(actor(U),/owner_required/);await db.query("insert into profiles values($1,'user')",[U]);assert.deepEqual(await actor(U),before,'profile deletion cannot reset allocation');
  assert.deepEqual((await db.query('select * from bookings')).rows,[{id:1,state:'sentinel-unchanged'}]);
  assert.deepEqual((await db.query('select * from session_reports')).rows,[{id:1,content:'sentinel-unchanged'}]);
  const cols=(await db.query("select column_name from information_schema.columns where table_name='soniox_owner_pilot_allocations' order by ordinal_position")).rows.map(r=>r.column_name);
  assert(!cols.some(n=>/key|token|credential$|transcript|audio/.test(n)));assert(cols.includes('credential_expires_at'));
  console.log('PASS local SQL: two fixed slots; 80 concurrent dispatches yield two winners; own auth only; direct table/service/anon denial; no reset/replay/cross-owner finish; terminal failures consumed; deleted-profile denial; canonical sentinels unchanged; no stored credentials. Physical multi-connection contention not tested.');
 }finally{await db.close();}
}
module.exports={fixture,U,P,X};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
