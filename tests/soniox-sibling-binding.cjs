'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const {fixture,U,P,OLD_U}=require(root+'/tests/soniox-pilot-allocation-sql.cjs');
const sql=fs.readFileSync(root+'/supabase/migrations/112_soniox_sibling_pilot_binding.sql','utf8');
(async()=>{
 for(const scenario of ['consumed','wrong-booking','wrong-role','valid']){
  const f=await fixture({rebind:false});try{
   if(scenario==='consumed')await f.actor(OLD_U,'reserve',{p_reservation_id:require('node:crypto').randomUUID()});
   if(scenario==='wrong-booking')await f.db.query("update bookings set scheduled_at=scheduled_at+interval '1 minute'");
   if(scenario==='wrong-role')await f.db.query("update profiles set role='partner' where id=$1",[U]);
   const before=(await f.db.query('select * from soniox_owner_pilot_allocations order by slot')).rows;
   const bookings=(await f.db.query('select * from bookings')).rows,profiles=(await f.db.query('select * from profiles order by id')).rows,reports=(await f.db.query('select * from session_reports')).rows;
   if(scenario!=='valid'){
    await assert.rejects(f.db.exec(sql),/untouched pilot slots|preflight mismatch/);await f.db.exec('rollback');
    assert.deepEqual((await f.db.query('select * from soniox_owner_pilot_allocations order by slot')).rows,before);
   }else{
    await f.db.exec(sql);assert.equal((await f.actor(U)).available,true);assert.equal((await f.actor(P)).available,true);await assert.rejects(f.actor(OLD_U),/owner_required/);
    assert.equal((await f.db.query('select count(*)::int n from soniox_owner_pilot_allocations')).rows[0].n,2);
    await assert.rejects(f.db.exec(sql),/untouched pilot slots/);await f.db.exec('rollback');
   }
   assert.deepEqual((await f.db.query('select * from bookings')).rows,bookings);assert.deepEqual((await f.db.query('select * from profiles order by id')).rows,profiles);assert.deepEqual((await f.db.query('select * from session_reports')).rows,reports);
  }finally{await f.db.close();}
 }
 console.log('PASS sibling binding: one unconsumed slot only; consumed-slot, wrong-booking, wrong-role and replay refusal; profiles/bookings/reports unchanged. Synthetic PostgreSQL only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
