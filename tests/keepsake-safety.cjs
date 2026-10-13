const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const S=require('../api/_lib/keepsake-safety.js');
const I=require('../api/_lib/partner-illustration-cloudflare.js');
const crypto=require('node:crypto');
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',X='33333333-3333-4333-8333-333333333333';
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',A='a'.repeat(32),K=crypto.createHash('sha256').update(A).digest('hex');
(async()=>{
 const pg=new PGlite();await pg.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create schema vault;create schema net;create schema cron;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('dayo_booking_notification_retry_secret',repeat('x',32));
 create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
 create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as
 $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
 create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language sql as
 $$update cron.job set active=$6 where jobid=$1$$;
 create table net.mock_requests(id bigint generated always as identity,url text,body jsonb);
 create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 1000) returns bigint language plpgsql as $$begin
 if headers->>'Authorization' <> 'Bearer '||repeat('x',32) then raise exception 'bad_auth'; end if;
 insert into net.mock_requests(url,body) values(url,body);return 1;end$$;
 create table auth.users(id uuid primary key);
 create table public.profiles(id uuid primary key references auth.users on delete cascade,role text);
 create table public.bookings(id uuid primary key,learner_id uuid,partner_user_id uuid,status text);
 create table public.session_reports(booking_id uuid,feedback jsonb);
 create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 alter table storage.buckets enable row level security;
 grant all on storage.buckets to anon,authenticated,service_role;
 create policy old_broad_bucket_access on storage.buckets for all to public using(true) with check(true);
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant all on storage.objects to anon,authenticated,service_role;
 create policy old_broad_access on storage.objects for all to public using(true) with check(true);
 create function auth.uid() returns uuid language sql stable as
 $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 insert into auth.users values('${U}'),('${P}'),('${X}');
 insert into profiles values('${U}','user'),('${P}','partner'),('${X}','partner');
 insert into bookings values('${B}','${U}','${P}','completed');
 insert into storage.buckets values('dayo-keepsakes',false,5242880,array['image/png']);
 `);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/107_keepsake_illustrations.sql'),'utf8');
 await pg.exec(sql);
 assert.equal((await pg.query("select active from cron.job where jobname='dayo-keepsake-cleanup'")).rows[0].active,false);
 assert.equal((await pg.query('select dayo_keepsake_dispatch_cleanup() request')).rows[0].request,null);
 assert.equal((await pg.query('select count(*)::int n from net.mock_requests')).rows[0].n,0);

 async function reserve(b=B,id=crypto.randomUUID(),actor=P,over={}){
  const values=[b,actor,id,'verified-source',K,'workers_free',new Date().toISOString(),new Date().toISOString().slice(0,10),null];
  for(const [key,v] of Object.entries(over))values[Number(key)]=v;
  return (await pg.query('select public.dayo_keepsake_reserve($1,$2,$3,$4,$5,$6,$7,$8,$9) as claim',values)).rows[0].claim;
 }
 async function finish(c,code=null){return pg.query('select public.dayo_keepsake_finish($1,$2,$3)',[c.token,P,code]);}
 async function as(role,id,query,params=[]){await pg.exec(`set role ${role};set request.jwt.claim.sub='${id||''}'`);try{return await pg.query(query,params);}finally{await pg.exec('reset role;reset request.jwt.claim.sub');}}
 await assert.rejects(reserve(B,crypto.randomUUID(),X),/not_booking_partner/);
 for(const role of ['anon','authenticated','service_role']){
  const permission=(await pg.query("select has_function_privilege($1,'public.dayo_keepsake_reserve(uuid,uuid,uuid,text,text,text,timestamptz,date,integer)','EXECUTE') ok",[role])).rows[0].ok;
  assert.equal(permission,role==='service_role');
 }
 for(const over of [{5:null},{5:'paid'},{6:null},{6:new Date(Date.now()-12*60*60*1000-1000).toISOString()},{6:new Date(Date.now()+10000).toISOString()},{7:'2000-01-01'},{8:10000}]){
  assert.equal((await reserve(B,crypto.randomUUID(),P,over)).error,'free_allowance_unverified');
 }
 assert.equal((await pg.query('select count(*)::int n from keepsake_illustration_attempts')).rows[0].n,0);
 const id=crypto.randomUUID(),claims=await Promise.all(Array.from({length:10},()=>reserve(B,id)));
 assert.equal(claims.filter(c=>c.allowed).length,1,'one provider allowance for ten queued concurrent DB requests');
 const one=claims.find(c=>c.allowed);assert.equal(one.attempt,1);
 assert(claims.filter(c=>c.reused).every(c=>c.token===one.token));
 assert.equal((await reserve()).error,'generation_pending');
 await assert.rejects(reserve(B,id,P,{3:'other-source'}),/request_identity_conflict/);
 await finish(one,'save_failed');
 assert.equal((await reserve(B,id)).allowed,false,'failed identity is never regenerated');
 const two=await reserve();assert.equal(two.attempt,2);await finish(two);
 assert.equal((await reserve()).error,'attempt_limit');
 const artifact=two.object_path;
 await pg.query('insert into storage.objects(bucket_id,name) values($1,$2)',['dayo-keepsakes',artifact]);
 for(const who of [U,P]){
  assert.equal((await as('authenticated',who,'select * from storage.objects')).rows.length,1);
  assert.equal((await as('authenticated',who,'select dayo_keepsake_asset($1) asset',[B])).rows[0].asset.object_path,artifact);
  await assert.rejects(as('authenticated',who,'select * from keepsake_illustration_attempts'),/permission denied/);
  await assert.rejects(as('authenticated',who,'select dayo_keepsake_cleanup_claim()'),/permission denied/);
  await assert.rejects(as('authenticated',who,'select dayo_keepsake_dispatch_cleanup()'),/permission denied/);
  await assert.rejects(as('authenticated',who,"insert into storage.objects(bucket_id,name) values('dayo-keepsakes','bad')"),/row-level security/);
 }
 assert.equal((await as('authenticated',X,'select * from storage.objects')).rows.length,0,'broad old policies cannot expose private images');
 assert.equal((await as('anon',null,'select * from storage.objects')).rows.length,0);
 assert.equal((await as('authenticated',P,"update storage.buckets set public=true where id='dayo-keepsakes' returning *")).rows.length,0);
 assert.equal((await as('authenticated',P,"delete from storage.buckets where id='dayo-keepsakes' returning *")).rows.length,0);
 await assert.rejects(as('authenticated',X,'select dayo_keepsake_asset($1)',[B]),/not_booking_participant/);
 await assert.rejects(as('anon',null,'select dayo_keepsake_asset($1)',[B]),/permission denied/);
 const blocked=await as('authenticated',U,'delete from storage.objects returning *');assert.equal(blocked.rows.length,0);
 await pg.exec("insert into storage.objects(bucket_id,name) values('other-bucket','unchanged')");
 assert.equal((await as('authenticated',X,'select * from storage.objects')).rows.length,1,'other bucket policies unchanged');
 // Per-account cap across different bookings. Failed attempts remain debited.
 for(let n=0;n<8;n++){
  const b=crypto.randomUUID();await pg.query('insert into bookings values($1,$2,$3,$4)',[b,U,P,'completed']);
  const c=await reserve(b);assert.equal(c.allowed,true);await finish(c,'provider_http_error');
 }
 const budgetBook=crypto.randomUUID();await pg.query('insert into bookings values($1,$2,$3,$4)',[budgetBook,U,P,'completed']);
 assert.equal((await reserve(budgetBook)).error,'daily_budget_exhausted');
 assert.equal((await pg.query('select reserved_neurons from keepsake_illustration_daily_budget')).rows[0].reserved_neurons,2000);
 // Deletion revokes access immediately, retaining only Storage API outbox work.
 await pg.query('delete from bookings where id=$1',[B]);
 assert.equal((await as('authenticated',U,"select * from storage.objects where bucket_id='dayo-keepsakes'")).rows.length,0);
 assert.equal((await pg.query('select count(*)::int n from keepsake_illustration_attempts where booking_id=$1',[B])).rows[0].n,0);
 await assert.rejects(finish(two),/reservation_inactive/);
 await pg.exec('update keepsake_illustration_attempts set updated_at=now()-interval \'3 minutes\'');
 await pg.query('select dayo_keepsake_dispatch_cleanup()');
 const network=(await pg.query('select * from net.mock_requests')).rows;
 assert.equal(network.length,1);assert.equal(network[0].url,'https://www.dayotalk.com/api/conversation-recap');
 assert.deepEqual(network[0].body,{action:'keepsake_cleanup'});
 const job=(await pg.query('select dayo_keepsake_cleanup_claim() job')).rows[0].job;assert(job);
 await pg.query('select dayo_keepsake_cleanup_done($1)',[job.token]);
 // Trigger covers profile AND auth deletion even when historical bookings are retained.
 await pg.query('delete from profiles where id=$1',[U]);
 assert.equal((await pg.query('select count(*)::int n from keepsake_illustration_attempts where booking_id is not null')).rows[0].n,0);
 await pg.query('delete from auth.users where id=$1',[P]);
 assert.equal((await pg.query('select count(*)::int n from keepsake_illustration_attempts where actor_id is not null')).rows[0].n,0);
 assert.equal((await pg.query('select reserved_neurons from keepsake_illustration_daily_budget')).rows[0].reserved_neurons,2000,'deletion never refunds budget');
 await assert.rejects(pg.exec(sql),/already present/);await pg.exec('rollback');
 await pg.close();

 let calls=[],uploadFail=false,signFail=false,deleted=false,removeFail=false,proof=null;
 const mock={rpc:async(name,args)=>{calls.push({name,args});if(name==='dayo_keepsake_reserve')return {data:{allowed:args.p_plan==='workers_free',plan:'workers_free',token:crypto.randomUUID(),attempt:1,error:args.p_plan?'': 'free_allowance_unverified'}};
  if(name==='dayo_keepsake_asset')return deleted?{error:{message:'denied'}}:{data:{bucket:S.BUCKET,object_path:artifact}};
  if(name==='dayo_keepsake_cleanup_claim')return {data:removeFail?{token:two.token,object_path:artifact}:null};return {data:{state:'ready'}};},
 from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:two.token,booking_id:B,actor_id:P,state:deleted?'cleanup':'reserved',object_path:artifact}})})})}),
 storage:{from:bucket=>{assert.equal(bucket,S.BUCKET);return {
 upload:async(_,bytes,opts)=>{calls.push({upload:true});assert.equal(opts.upsert,false);return uploadFail?{error:{}}:{data:{}};},
 createSignedUrl:async(_,ttl)=>{assert.equal(ttl,60);return signFail?{error:{}}:{data:{signedUrl:'https://fixture.supabase.co/storage/v1/object/sign/dayo-keepsakes/'+artifact+'?token=mock'}};},
 remove:async()=>{calls.push({remove:true});return removeFail?{error:{}}:{data:{}};}
 }}}};
 const C=S.createContracts({db:mock,participantDb:mock,accountId:A,verifyFreePlan:async()=>proof});
 const args={bookingId:B,actorId:P,sourceVersion:'verified-source',model:I.MODEL,freeOnly:true,maxAttempts:2};
 assert.equal((await C.quota.reserve(args)).allowed,false);
 proof={accountId:A,plan:'workers_free',source:'workers_dashboard',enforcedFreeLimit:true,verifiedAt:new Date().toISOString()};
 assert.equal((await C.quota.reserve(args)).allowed,true);
 for(const patch of [{accountId:'b'.repeat(32)},{source:'client'},{plan:'paid'},{enforcedFreeLimit:false},{verifiedAt:new Date(Date.now()-12*60*60*1000-1000).toISOString()},{verifiedAt:new Date(Date.now()+10000).toISOString()}]){
  const original=proof;proof={...proof,...patch};assert.equal((await C.quota.reserve(args)).allowed,false);proof=original;
 }
 assert(calls.filter(c=>c.name==='dayo_keepsake_reserve').every(c=>c.args.p_remaining_neurons===null),'never fabricate remaining free balance');
 const data={bookingId:B,actorId:P,reservationToken:two.token,bytes:Buffer.from('mock-image'),contentType:'image/png'};
 const saved=await C.storage.put(data);assert.equal(saved.asset.object_path,artifact);assert(saved.expires_at);assert.equal(saved.durable,true);
 uploadFail=true;await assert.rejects(C.storage.put(data),/save_failed/);uploadFail=false;
 signFail=true;await assert.rejects(C.storage.put(data),/image_access_unavailable/);signFail=false;
 deleted=true;await assert.rejects(C.storage.put(data),/save_failed/);await assert.rejects(S.readAsset(mock,B));deleted=false;
 removeFail=true;assert.equal((await S.cleanup(mock)).removed,0);assert(!calls.some(c=>c.name==='dayo_keepsake_cleanup_done'));
 removeFail=false;let pending=true;const cleanupDb={...mock,rpc:async(name)=>{calls.push({name});if(name==='dayo_keepsake_cleanup_claim'){const value=pending?{token:two.token,object_path:artifact}:null;pending=false;return {data:value};}return {data:null};}};
 assert.equal((await S.cleanup(cleanupDb)).removed,1);assert(calls.some(c=>c.name==='dayo_keepsake_cleanup_done'));
 let creates=0;
 await S.ensurePrivateBucket({storage:{getBucket:async()=>({error:{statusCode:404}}),createBucket:async(name,opts)=>{creates++;assert.equal(name,S.BUCKET);assert.equal(opts.public,false);return {data:{}};}}});assert.equal(creates,1);
 await assert.rejects(S.ensurePrivateBucket({storage:{getBucket:async()=>({data:{public:true}})}}),/configuration_mismatch/);
 assert.equal(S.requestId(args),S.requestId(args));assert.notEqual(S.requestId(args),S.requestId({...args,actorId:U}));
 { // Existing server-secret dispatcher: deny participants, bound batches, safe failures.
 const cleanupHandler=require('../api/_lib/keepsake-cleanup').createHandler;
 const SECRET='fixture-only-'+ 's'.repeat(32);
 function response(){return {setHeader(){},end(raw){this.body=JSON.parse(raw);}};}
 let cleanupClaims=0,removes=0,dones=0;
 const executorDb={rpc:async name=>{if(name==='dayo_keepsake_cleanup_claim'){cleanupClaims++;return {data:{token:two.token,object_path:artifact}};}dones++;return {data:null};},storage:{from:()=>({remove:async()=>{removes++;return {data:{}};}})}};
 const executor=cleanupHandler({env:{BOOKING_NOTIFICATION_RETRY_SECRET:SECRET},service:executorDb});
 for(const headers of [{},{authorization:'Bearer learner-jwt'},{authorization:'Bearer '+SECRET+'wrong'}]){const r=response();await executor({method:'POST',headers,body:{action:'keepsake_cleanup'}},r);assert.equal(r.statusCode,401);}
 assert.equal(cleanupClaims,0);
 const invalid=response();await executor({method:'POST',headers:{authorization:'Bearer '+SECRET},body:{action:'keepsake_cleanup',booking_id:B}},invalid);assert.equal(invalid.statusCode,400);
 const executed=response();await executor({method:'POST',headers:{authorization:'Bearer '+SECRET},body:{action:'keepsake_cleanup'}},executed);
 assert.equal(executed.statusCode,200);assert.equal(executed.body.removed,5);assert.equal(removes,5);assert.equal(dones,5);assert(!JSON.stringify(executed.body).includes(SECRET));
 const failed=response();await cleanupHandler({env:{BOOKING_NOTIFICATION_RETRY_SECRET:SECRET},service:{rpc:async()=>({error:{message:'private-secret-error'}})}})({method:'POST',headers:{authorization:'Bearer '+SECRET},body:{action:'keepsake_cleanup'}},failed);assert.equal(failed.statusCode,503);assert.equal(failed.body.error,'cleanup_unavailable');
 const cleanupRoute=require('../api/conversation-recap.js').createHandler({env:{BOOKING_NOTIFICATION_RETRY_SECRET:SECRET},fetchImpl:async()=>{throw Error('participant auth must not execute');}});
 const denied=response();await cleanupRoute({method:'POST',headers:{authorization:'Bearer learner-jwt'},body:{action:'keepsake_cleanup'}},denied);assert.equal(denied.statusCode,401);
 }
 // Existing authenticated route: JWT preserved for RPC and Storage signing, no service bypass.
 const handler=require('../api/conversation-recap.js').createHandler;
 for(const who of [U,P,X,null]){
  let requests=0;
  const handle=handler({env:{SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mock-anon'},fetchImpl:async(url,opts)=>{
   requests++;const auth=new Headers(opts.headers).get('authorization');assert.equal(auth,'Bearer fixture');
   if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:who||U}),{status:200,headers:{'Content-Type':'application/json'}});
   if(url.includes('/rpc/dayo_keepsake_asset')){assert.equal(JSON.parse(opts.body).p_booking_id,B);
    return new Response(JSON.stringify(who===X?{message:'not_booking_participant',code:'42501'}:{bucket:S.BUCKET,object_path:artifact}),{status:who===X?403:200,headers:{'Content-Type':'application/json'}});}
   assert(url.includes('/storage/v1/object/sign/dayo-keepsakes/'+artifact));
   return new Response(JSON.stringify({signedURL:'/object/sign/dayo-keepsakes/'+artifact+'?token=mock'}),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  const response={setHeader(){},end(v){this.body=JSON.parse(v);}};
  await handle({method:'POST',headers:who?{authorization:'Bearer fixture'}:{},body:{action:'keepsake_image',booking_id:B}},response);
  assert.equal(response.statusCode,who===null?401:who===X?403:200);
  if(who===null)assert.equal(requests,0);
  if(who===U||who===P)assert.equal(response.body.image.asset.object_path,artifact);
 }

 // Full local TEST route -> mocked Cloudflare -> private upload/read-back -> unchanged renderer.
 const sharp=require('sharp'),UI=require('../public/user-conversation-report.js');
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#fffbf4'}}).png().toBuffer();
 let providerCalls=0,ready=false,testBooking=true;
 const pilotQuota={reserve:async()=>ready?{reused:true,state:'ready'}:{allowed:true,plan:'workers_free',attempt:1,token:two.token},fail:C.quota.fail};
 const topics=['I went to a crowded café and had coffee.','I love coffee at a quiet café.','I have a rabbit and I love my rabbit.'];
 const api=handler({env:{SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mock-anon',SUPABASE_SERVICE_ROLE_KEY:'mock-service',CLOUDFLARE_ACCOUNT_ID:A,CLOUDFLARE_API_TOKEN:'mock-token'},
  illustrationPilot:{contracts:async()=>({quota:pilotQuota,qualityCheck:async({bytes})=>({reviewed:true,imageHash:require("node:crypto").createHash("sha256").update(bytes).digest("hex"),visibleText:"",logoDetected:false,watermarkDetected:false}),storage:{...C.storage,put:async data=>{const image=await C.storage.put(data);ready=true;return image;}}})},
  fetchImpl:async(url,opts)=>{
   if(url.includes('/ai/run/')){providerCalls++;const prompt=opts.body.get('prompt');assert(!prompt.includes(B)&&!prompt.includes(P)&&!prompt.includes('Existing test Letter'));return {ok:true,json:async()=>({success:true,result:{image:png.toString('base64')}})};}
   let data;if(url.endsWith('/auth/v1/user'))data={id:P};
   else if(url.includes('/bookings?'))data=[{id:B,learner_id:U,partner_user_id:P,status:'completed',language:'en',is_test_session:testBooking}];
   else if(url.includes('/profiles?'))data=[{id:P,role:'partner'}];
   else if(url.includes('/session_logs?'))data=[];
   else if(url.includes('/booking_chat_messages?'))data=topics.map((text,i)=>({id:'message-'+i,booking_id:B,sender_id:U,sender_role:'learner',text,created_at:'2026-10-10T09:46:00Z'}));
   else throw Error('unexpected local route '+new URL(url).pathname);
   return {ok:true,json:async()=>data};
  }});
 const L=require('../api/_lib/partner-letter.js');
 const input={booking_id:B,action:'partner_illustration_generate',source_version:(await L.handle({input:{booking_id:B,action:'partner_letter_topics'},user:{id:P},env:{SUPABASE_SERVICE_ROLE_KEY:'mock-service'},read:async url=>{
  if(url.includes('/bookings?'))return [{id:B,learner_id:U,partner_user_id:P,status:'completed',language:'en'}];if(url.includes('/profiles?'))return [{id:P,role:'partner'}];if(url.includes('/session_logs?'))return [];if(url.includes('/booking_chat_messages?'))return topics.map((text,i)=>({id:'message-'+i,booking_id:B,sender_id:U,sender_role:'learner',text,created_at:'2026-10-10T09:46:00Z'}));throw Error('unexpected');
 }})).body.source_version};
 const submit=async()=>{const response={setHeader(){},end(v){this.body=JSON.parse(v);}};await api({method:'POST',headers:{authorization:'Bearer fixture'},body:input},response);return response;};
 let full=await submit();assert.equal(full.statusCode,200);assert.equal(full.body.booking_id,B);assert.equal(providerCalls,1);
 const repeat=await submit();assert.equal(repeat.statusCode,409);assert.equal(repeat.body.error,"saved_image_quality_unverified");assert.equal(providerCalls,1,'re-read of ready reservation never calls provider');
 testBooking=false;assert.equal((await submit()).statusCode,403);assert.equal(providerCalls,1,'isolated pilot rejects normal bookings');
 const report={booking_id:B,partner_name:'Jen',__dayoPublicNameVerified:true,partner_comment:'Existing test Letter',quiz_score:100,feedback:[{kind:'existing-fixture'}],stamp:'cookie'};
 const Module=require('node:module'),cp=require('node:child_process');
 const baseline=new Module(path.join(__dirname,'../public/user-conversation-report.js'));
 baseline.filename=path.join(__dirname,'../public/user-conversation-report.js');baseline.paths=module.paths;
 baseline._compile(cp.execFileSync('git',['show','HEAD:public/user-conversation-report.js'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}),baseline.filename);
 for(const locale of ['ko','en'])for(const legacy of [report,{...report,illust_url:'https://legacy.fixture.invalid/image.png'}]){
  assert.deepEqual(UI.memoryData(legacy,locale),baseline.exports.memoryData(legacy,locale),'Memory Card unchanged without new private asset');
  assert.equal(UI.renderLetter(legacy,locale),baseline.exports.renderLetter(legacy,locale),'existing Letter rendering unchanged');
  assert.equal(UI.renderDetail(legacy,locale),baseline.exports.renderDetail(legacy,locale),'existing Recap/quiz rendering unchanged');
 }
 const original=JSON.stringify(report),db={auth:{getSession:async()=>({data:{session:{access_token:'mock'}}})}};
 const approved={booking_id:B,approved:true,content_type:'image/png',data:png.toString('base64'),asset:{bucket:S.BUCKET,object_path:artifact,image_sha256:crypto.createHash('sha256').update(png).digest('hex'),storage_version:'fixture-v1'}};
 const attach=async image=>UI.refreshKeepsakeImage(db,report,async(route,opts)=>{assert.equal(route,'/api/conversation-recap');assert.equal(JSON.parse(opts.body).review.booking_id,B);assert.equal(JSON.parse(opts.body).action,'keepsake_review');assert.equal(JSON.parse(opts.body).review.action,'read');return {ok:true,json:async()=>({managed:true,image})};});
 const displayed=await attach(approved);assert(UI.memoryData(displayed,'ko').image.startsWith('blob:'));assert.equal(JSON.stringify(report),original);
 assert.equal(displayed.partner_comment,report.partner_comment);assert.equal(displayed.quiz_score,100);assert.deepEqual(displayed.feedback,report.feedback);
 assert(UI.renderLetter(displayed,'ko').includes('ucr-illustration'));assert(!UI.memoryData(displayed,'ko').stamp);
 for(const wrong of [null,full.body,{...approved,booking_id:X},{...approved,approved:false},{...approved,content_type:'image/jpeg'},{...approved,asset:{bucket:S.BUCKET,object_path:X+'/'+two.token+'.png'}}])assert.equal(UI.memoryData(await attach(wrong),'en').image,'');
 const failed=await UI.refreshKeepsakeImage(db,report,async()=>({ok:false}));assert.equal(UI.memoryData(failed,'en').image,'');assert.equal(failed.partner_comment,report.partner_comment);
 const {chromium}=require('playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.route('https://fixture.supabase.co/**',r=>r.fulfill({status:200,contentType:'image/png',body:png,headers:{'access-control-allow-origin':'*'}}));
  await page.setContent('<html><body></body></html>');await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../public/memory-card.js'),'utf8')});
  for(const locale of ['ko','en']){const model=UI.memoryData(displayed,locale);await page.evaluate(async ({model,png})=>{const raw=atob(png),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));model.image=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));document.body.replaceChildren(await DayOMemoryCard.render(model));URL.revokeObjectURL(model.image);},{model,png:png.toString('base64')});
   assert.deepEqual(await page.locator('canvas').evaluate(c=>[c.width,c.height,c.dataset.memoryImage]),[1080,1350,'shown']);
  }
  await page.evaluate(async model=>{document.body.replaceChildren(await DayOMemoryCard.render(model));},UI.memoryData(failed,'ko'));
  assert.deepEqual(await page.locator('canvas').evaluate(c=>[c.width,c.height,c.dataset.memoryImage]),[1080,1350,'hidden']);await page.close();
 }finally{await browser.close();}
 console.log('PASS full local TEST path: authenticated route, chat motifs, mocked provider, private upload/read-back, duplicate reuse, normal-booking denial, exact-booking display, original Letter/score untouched, KO/EN 1080x1350 renderer and text-first fallback. No live provider/Storage writes.');
 const route=fs.readFileSync(path.join(__dirname,'../api/conversation-recap.js'),'utf8');assert(!route.includes('enabled:true'));
 assert.equal(require('../public/partner-report-contract.js').illustrationAvailable,false);
 console.log('PASS: local PostgreSQL migration/RLS/RPCs; two-attempt/idempotent queued concurrency; free-only daily cap; stale/unknown quota; private participant access despite broad legacy policy; booking/profile/auth deletion; upload/access/cleanup failures; no budget refund; bucket mocks; disabled UI.');
 console.log('LIMIT: PGlite serializes queued queries; real multi-connection Supabase lock/contention and Storage service behavior require approved staging verification.');
})().catch(e=>{console.error(e);process.exitCode=1;});
