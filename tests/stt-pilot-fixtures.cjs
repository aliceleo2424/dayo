'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.DAYO_PILOT_ROOT||path.resolve(__dirname,'..');
const {createHandler}=require(path.join(root,'api/stt-pilot-credentials.js'));
const {fixture,U,P,X}=require('./soniox-pilot-allocation-sql.cjs');
const B='cfb91da5-991b-48d9-b86f-a7e912cb8ed4', EVENING='de9cf057-af5e-4e5c-9d17-9ad099e070e0';
function config(){return {VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/soniox-owner-pilot',VERCEL_URL:'dayo-owner.vercel.app',
 DAYO_SONIOX_TEST_BOOKING:B,DAYO_SONIOX_TEST_ENABLED:'1',SONIOX_API_KEY:'synthetic-master',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid/rest/v1/',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-public',
 DAYO_SONIOX_PROJECT_BUDGET_USD:'2',DAYO_SONIOX_LIMITS_VERIFIED_AT:new Date().toISOString()};}
async function harness(options={}){
 const f=await fixture(),calls=[],mintBodies=[];let mints=0,probes=0;
 async function fetchImpl(url,request){
  const actor=(request.headers.Authorization||'').replace('Bearer fixture:','');calls.push({url,method:request.method||'GET'});
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:options.user||actor,is_anonymous:!!options.anonymous,user_metadata:{role:'admin'}})};
  if(url.includes('/rpc/dayo_soniox_pilot_allocation')){
   const args=JSON.parse(request.body),result=await f.actor(actor,args.p_action,args);
   if(args.p_action==='reserve'&&result.reserved&&options.reserveLost)throw Error('lost reservation acknowledgment');
   if(args.p_action==='finish'&&options.finishLost)throw Error('lost finish acknowledgment');
   return {ok:true,json:async()=>result};
  }
  if(url.endsWith('/v1/concurrency-limits'))return {ok:true,json:async()=>({project:{limits:{transcribe_concurrent:options.concurrency??2}}})};
  if(url.endsWith('/auth/temporary-api-key')){
   mints++;const body=JSON.parse(request.body);mintBodies.push(body);
   const rows=(await f.db.query("select state from soniox_owner_pilot_allocations where state='reserved'")).rows;assert(rows.length>0,'durable reservation commits BEFORE mint');
   if(options.providerFailure){if(options.providerFailure==='timeout'){const e=Error('DO NOT RETURN PRIVATE PROVIDER ERROR');e.name='TimeoutError';throw e;}return {ok:false,status:429};}
   await new Promise(r=>setTimeout(r,5));
   return {ok:true,json:async()=>({api_key:options.invalidGrant?'synthetic-master':'snx_temp_fixture-'+mints,
    expires_at:new Date(Date.now()+(options.expiry??60000)).toISOString()})};
  }
  if(url.includes('/rest/v1/bookings?'))return {ok:true,json:async()=>[{id:options.booking||B,learner_id:U,partner_user_id:P,is_test_session:false,status:'confirmed',scheduled_at:new Date(Date.now()+(options.future?600000:options.past?-1800000:0)).toISOString()}]};
  if(url.endsWith('/rpc/get_room_session_state'))return {ok:true,json:async()=>({success:true,booking_id:options.booking||B,participant_id:actor,role:actor===P?'partner':'learner',session_ended:!!options.ended})};
  throw Error('Unexpected URL '+url);
 }
 function worker(change={}){return createHandler({env:{...config(),...options.env,...(options.booking?{DAYO_SONIOX_TEST_BOOKING:options.booking}:{}),...change},fetchImpl,probeImpl:async()=>{probes++;return {authenticated:true,model:'stt-rt-v5',audioSentBytes:0,audioProcessedMs:0};}});}
 async function invoke(actor=U,body={action:'start',consent:true,bookingId:options.booking||B},change={},reqChange={}){
  let output;const headers={};await worker(change)({method:'POST',headers:{origin:'https://dayo-owner.vercel.app',authorization:'Bearer fixture:'+actor},body,...reqChange},
   {setHeader(k,v){headers[k]=v;},end(v){output={status:this.statusCode,body:JSON.parse(v),headers};}});return output;
 }
 return {...f,invoke,calls,mintBodies,mints:()=>mints,probes:()=>probes};
}
async function main(){
 let h=await harness();try{
  for(const actor of [U,P]){const r=await h.invoke(actor,{action:'state',bookingId:B});assert.equal(r.status,200);assert.equal(r.body.available,true);assert.equal(r.body.singleUse,true);assert.equal(r.body.startExpirySeconds,60);assert.equal(r.body.maxSessionSeconds,1500);}
  const probe=await h.invoke(U,{action:'probe',bookingId:B});assert.equal(probe.status,200);assert.equal(probe.body.audioSentBytes,0);assert.equal(probe.body.allocationConsumed,false);assert.equal(h.probes(),1);assert.equal((await h.actor(U)).available,true);
  assert.equal((await h.invoke(X,{action:'probe',bookingId:B})).status,403);assert.equal(h.probes(),1,'outsider cannot probe');
  assert.equal((await h.invoke(U,{action:'start',consent:true})).status,403,'every call requires the exact authorized booking');
  assert.equal(h.mints(),0,'Readiness never consumes a capture allocation or mints a key');
  // Fresh handlers model independent workers; each uses the same actual local DB.
  const results=await Promise.all(Array.from({length:60},(_,i)=>h.invoke(i%2?U:P)));
  const granted=results.filter(r=>r.status===200);assert.equal(granted.length,2);assert.equal(h.mints(),2);assert.deepEqual(granted.map(r=>r.body.role).sort(),['learner','partner']);
  for(const r of granted){assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(r.body.maxSessionSeconds,1500);assert.equal(r.body.startExpirySeconds,60);assert(!JSON.stringify(r).includes('synthetic-master'));}
  assert(h.mintBodies.every(b=>b.expires_in_seconds===60&&b.single_use===true&&b.usage_type==='transcribe_websocket'&&b.max_session_duration_seconds===1500));
  assert(h.mintBodies.every(b=>!JSON.stringify(b).includes(U)&&!JSON.stringify(b).includes(P)));
  for(const actor of [U,P]){assert.equal((await h.invoke(actor)).status,409);assert.equal((await h.invoke(actor,{action:'state',bookingId:B})).body.available,false);}
  assert.equal(h.mints(),2,'reloads/cold handlers do not mint replacement credentials');
  const baseline=(await h.db.query('select * from soniox_owner_pilot_allocations order by slot')).rows;
  assert.equal((await h.invoke(U,{action:'state',bookingId:B},{NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:''})).status,200,'already-published Auth configuration works without a service-role/Preview secret copy');
  assert.deepEqual((await h.db.query('select * from soniox_owner_pilot_allocations order by slot')).rows,baseline,'state-only load cannot consume or reset a slot');
  const rows=(await h.db.query('select * from soniox_owner_pilot_allocations')).rows;assert(!JSON.stringify(rows).includes('snx_temp_'));assert(!JSON.stringify(rows).includes('synthetic-master'));
 }finally{await h.db.close();}
 h=await harness();try{
  const invalid=[{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_GIT_COMMIT_REF:'main'},{DAYO_SONIOX_TEST_ENABLED:'0'},{SONIOX_API_KEY:''},{DAYO_SONIOX_PROJECT_BUDGET_USD:'3'},{DAYO_SONIOX_LIMITS_VERIFIED_AT:'2020-01-01'}];
  for(const env of invalid)assert.notEqual((await h.invoke(U,undefined,env)).status,200);
  for(const body of [{action:'start',consent:false},{action:'reset',consent:true},{action:'start',consent:true,user_id:P},{action:'start',consent:true,role:'partner'},{action:'start',consent:true,bookingId:X}])assert.notEqual((await h.invoke(U,body)).status,200);
  for(const origin of ['https://www.dayotalk.com','https://other.vercel.app','http://dayo-owner.vercel.app'])assert.notEqual((await h.invoke(U,undefined,{}, {headers:{origin,authorization:'Bearer fixture:'+U}})).status,200);
  assert.equal((await h.invoke(X)).status,403);assert.equal((await h.invoke(U,undefined,{}, {headers:{origin:'https://dayo-owner.vercel.app'}})).status,401);
  assert.equal((await h.invoke(U,undefined,{}, {method:'GET'})).status,405);
  assert.equal((await h.invoke(U,'{broken-json')).status,400);
  assert.equal((await h.invoke(U,[])).status,400);
  assert.equal(h.mints(),0);assert.equal((await h.actor(U)).available,true);assert.equal((await h.actor(P)).available,true);
 }finally{await h.db.close();}
 for(const mode of ['timeout','429','invalid','expired','longExpiry','reserveLost','finishLost']){
  const opt=mode==='timeout'||mode==='429'?{providerFailure:mode}:mode==='invalid'?{invalidGrant:true}:mode==='expired'?{expiry:-1}:mode==='longExpiry'?{expiry:120000}:{[mode]:true};
  h=await harness(opt);try{
   const r=await h.invoke();assert(r.status>=400);assert(!('api_key'in r.body));assert(!JSON.stringify(r).includes('PRIVATE'));
   if(mode==='reserveLost')assert.equal(r.body.allocationConsumed,null,'lost reserve ACK is explicitly unknown');else assert.equal(r.body.allocationConsumed,true);
   const count=h.mints();assert.equal((await h.invoke()).status,409);assert.equal(h.mints(),count,'no retry after any failure/unknown outcome');assert.equal((await h.actor(U)).available,false);
  }finally{await h.db.close();}
 }
 for(const opt of [{user:X},{anonymous:true},{concurrency:10},{future:true},{past:true},{ended:true}]){
  h=await harness(opt);try{const r=await h.invoke(U,opt.future||opt.past||opt.ended?{action:'start',consent:true,bookingId:B}:undefined);assert.notEqual(r.status,200);assert.equal(h.mints(),0);assert.equal((await h.actor(U)).available,true);}finally{await h.db.close();}
 }
 // The same protected Preview can authorize a NEW exact booking without code rewrites.
 // The server still rejects the previously authorized booking, wrong actors and invalid time.
 h=await harness({booking:EVENING});try{
  const current=await h.invoke(U,{action:'state',bookingId:EVENING});
  assert.equal(current.status,200);assert.equal(current.body.bookingId,EVENING);
  assert.equal((await h.invoke(U,{action:'state',bookingId:B})).status,403);
  assert.equal((await h.invoke(X,{action:'state',bookingId:EVENING})).status,403);
  assert.equal(h.mints(),0,'New booking readiness must not spend one-use slots');
  assert.equal((await h.invoke(U,{action:'start',consent:true,bookingId:EVENING})).status,200);
  assert.equal(h.mints(),1);
 }finally{await h.db.close();}
 console.log('PASS JIT API: 60 fresh-worker dispatches / actual local DB -> exactly two provider attempts; 60s single-use / 1500s capture; owner/consent/origin/exact Preview gates; no token persistence; failures and lost ACK consume slots; no replacement/retry. Provider fully mocked; no audio or real credentials.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
