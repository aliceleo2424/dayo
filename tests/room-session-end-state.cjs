const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const L='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',X='33333333-3333-4333-8333-333333333333',B='44444444-4444-4444-8444-444444444444';
function definition(sql,name){const a=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'('),b=sql.indexOf('$function$',sql.indexOf('AS $function$',a)+14);assert(a>=0&&b>a);return sql.slice(a,b+10)+';';}
async function database(){const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.dayo_is_admin() returns boolean language sql stable as $$select false$$;
 create table bookings(id uuid primary key,learner_id uuid,partner_user_id uuid,status text,is_test_session boolean,scheduled_at timestamptz,ended_at timestamptz,completed_at timestamptz,end_reason text,updated_at timestamptz,ticket_deducted boolean default false,ticket_refunded boolean default false,partner_rewarded boolean default false,test_completed_at timestamptz,test_end_reason text);
 create table profiles(id uuid primary key,role text);
 insert into profiles values('${L}','user'),('${P}','partner');
 insert into bookings(id,learner_id,partner_user_id,status,is_test_session,scheduled_at) values('${B}','${L}','${P}','confirmed',true,now()-interval '10 minutes');`);
 await db.exec(read('supabase/migrations/048_add_session_event_logging.sql'));
 const old=read('supabase/migrations/093_admin_test_sessions.sql'); await db.exec(old.slice(old.indexOf('create function public.finish_test_session('),old.indexOf('revoke all on function public.finish_test_session')));
 const hash=()=>db.query("select md5(pg_get_functiondef('log_session_event(uuid,uuid,text,jsonb)'::regprocedure)) hash");const before=(await hash()).rows[0].hash;
 await db.exec(read('supabase/migrations/100_room_session_end_state.sql'));
 assert.equal((await hash()).rows[0].hash,before,'event write contract unchanged');
 const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const state=async()=> (await db.query('select get_room_session_state($1) s',[B])).rows[0].s;
 const snapshot=async()=>(await db.query('select * from bookings where id=$1',[B])).rows[0];
 await actor(L);const initial=await snapshot();assert.equal((await state()).session_ended,false);
 const early=(await db.query("select finish_test_session($1,'learner','personal') s",[B])).rows[0].s;assert.equal(early.success,false,'25-minute gate retained');
 await db.query("update bookings set scheduled_at=now()-interval '26 minutes' where id=$1",[B]);
 await assert.rejects(db.query("select finish_test_session($1,'learner','personal')",[B]),/Invalid end reason/i);
 await db.query('update bookings set scheduled_at=$2 where id=$1',[B,initial.scheduled_at]);
 const stable=(await state()).end_event_id;
 const log=async(type,id,payload)=> (await db.query('select log_session_event($1,$2,$3,$4::jsonb) s',[id,B,type,JSON.stringify(payload)])).rows[0].s;
 await log('media_connected','55555555-5555-4555-8555-555555555555',{});assert.equal((await state()).session_ended,false,'disconnect/media does not end session');
 assert.equal((await log('session_ended',stable,{reason:'personal',role:'partner'})).inserted,true);
 assert.equal((await log('session_ended',stable,{reason:'personal'})).inserted,false,'stable ID retry duplicate suppressed');
 const ended=await state();assert.equal(ended.session_ended,true);assert.equal(ended.source,'session_event');assert.equal(ended.role,'learner');
 assert.deepEqual(await snapshot(),initial,'ended event has no financial or timestamp mutation');
 await actor(P);assert.equal((await state()).session_ended,true,'same booking closes for other participant');assert.notEqual((await state()).end_event_id,stable);
 await actor(X);assert.equal((await state()).code,'not_booking_participant');await actor('');assert.equal((await state()).code,'unauthorized');
 assert.equal((await db.query("select has_function_privilege('anon','get_room_session_state(uuid)','execute') ok")).rows[0].ok,false);
 await actor(L);await db.exec('set role authenticated');assert.equal((await db.query('select count(*)::int n from session_events')).rows[0].n,0,'no direct participant event read');assert.equal((await state()).session_ended,true);await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int n from session_events where event_type='session_ended'")).rows[0].n,1);
 // Wrong actor/role and invalid reasons must not become canonical ended evidence.
 await db.query('delete from session_events');
 await db.query("insert into session_events(id,booking_id,actor_user_id,event_type,payload) values(gen_random_uuid(),$1,$2,'session_ended','{\"role\":\"learner\",\"reason\":\"personal\"}')",[B,X]);assert.equal((await state()).session_ended,false);
 await db.query("insert into session_events(id,booking_id,actor_user_id,event_type,payload) values(gen_random_uuid(),$1,$2,'session_ended','{\"role\":\"partner\",\"reason\":\"personal\"}')",[B,L]);assert.equal((await state()).session_ended,false);
 await db.query("insert into session_events(id,booking_id,actor_user_id,event_type,payload) values(gen_random_uuid(),$1,$2,'session_ended','{\"role\":\"learner\",\"reason\":\"disconnect\"}')",[B,L]);assert.equal((await state()).session_ended,false);
 await db.query("update bookings set status='completed' where id=$1",[B]);assert.equal((await state()).source,'booking','legacy settled compatibility');
 console.log('PASS local PostgreSQL: TEST constraints, exact participant/role/reason, disconnect, both roles, read authorization, event retry, unchanged booking settlement. No production write.');
}finally{await db.close();}}
const helper=read('public/room-session-state.js'),room=read('public/room.html'),gate=[...room.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],boot=[...read('public/session-recap.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
function mock(o={}){const id=o.user||L,booking={id:B,learner_id:L,partner_user_id:P,status:'confirmed',language:'en',scheduled_at:new Date().toISOString()},calls=[];return {calls,auth:{async getUser(){return o.noAuth?{data:{user:null}}:{data:{user:{id}}};}},from(table){const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){calls.push([table,filters]);return {data:table==='profiles'?{role:id===P?'partner':'user'}:booking};}};},async rpc(name,args){calls.push([name,args]);assert.equal(name,'get_room_session_state');assert.equal(args.p_booking_id,B);if(o.error)return {error:{message:'network'}};return {data:{success:true,booking_id:B,participant_id:id,role:id===P?'partner':'learner',session_ended:!!o.ended,end_event_id:B}};}};}
async function roomGate(){for(const o of [{ended:true},{user:P,ended:true},{ended:false,local:true},{error:true},{user:X}]){
 const db=mock(o),nodes={};const document={readyState:'complete',body:{classList:{add(){},contains(){return false;}}},getElementById(id){return nodes[id]||(nodes[id]={});}};
 const w={document,supabaseClient:db,location:{search:'?bookingId='+B,replace(url){w.redirect=url;}},localStorage:{getItem(){return null;}},sessionStorage:{getItem(){return o.local?'true':null;}},DayOI18n:{t:k=>k},setTimeout,clearTimeout};w.window=w;
 const c=vm.createContext({...w,window:w,document,location:w.location,localStorage:w.localStorage,sessionStorage:w.sessionStorage,console,URLSearchParams,Intl,Date,setTimeout,clearTimeout});vm.runInContext(helper,c);vm.runInContext(gate,c);await w.DayORoomAccessReady;
 if(o.error||o.user===X)assert.equal(w.DayORoomAccess.allowed,false);
 else if(o.ended){assert.equal(w.DayORoomAccess.allowed,false);if(o.user===P)assert.equal(w.DayORoomAccess.sessionEnded,true);else assert.equal(w.redirect,'session-recap.html?bookingId='+B);}
 else assert.equal(w.DayORoomAccess.allowed,true,'forged local ended flag ignored');
 }console.log('PASS actual room gate: User recap routing, Partner ended screen, local flag ignored, exact identity, error fail closed.');}
async function recovery(){for(const o of [{ended:true},{ended:true,noRecap:true},{ended:false},{ended:true,noAuth:true},{ended:true,user:X},{error:true}]){
 const dom=new JSDOM('<p id="recovery-status"></p><button id="recovery-retry" hidden></button>',{url:'https://fixture.invalid/session-recap.html?bookingId='+B,runScripts:'outside-only'}),w=dom.window;try{Object.defineProperty(w.document,'readyState',{value:'complete'});w.supabaseClient=mock(o);w.DayORoomAccess={allowed:false};w.DayOI18n={t:k=>k};w.prepareSessionReviewSource=async()=>({available:!o.noRecap});let opened=0;w.openQuizModalImmediately=()=>opened++;w.eval(helper);w.eval(boot);await new Promise(setImmediate);
 let key=o.noAuth?'room.recapRecoveryAuth':o.user===X?'room.recapRecoveryDenied':o.error?'room.recapRecoveryError':!o.ended||o.noRecap?'room.recapRecoveryPending':null;
 assert.equal(opened,key?0:1);if(key)assert.equal(w.document.getElementById('recovery-status').textContent,key);
 if(o.error){w.supabaseClient=mock({ended:true});w.document.getElementById('recovery-retry').click();await new Promise(setImmediate);assert.equal(opened,1,'retry reads new server state');}
 }finally{w.close();}}
 console.log('PASS actual recap boot: fresh TEST confirmed recovery, auth/access/pending/network separation, retry latest state.');}
(async()=>{await database();await roomGate();await recovery();})().catch(e=>{console.error(e);process.exitCode=1;});
