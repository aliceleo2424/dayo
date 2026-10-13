const crypto=require('node:crypto');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const I=require('../api/_lib/partner-illustration-cloudflare.js'),L=require('../api/_lib/partner-letter.js');
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const texts=['I went to a crowded café and had coffee.','I love coffee at a quiet café.','I have a rabbit and I love my rabbit.'];
function fixture(mode='mixed',values=texts){return {user:{id:P},env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-token'},read:async route=>{
 if(route.includes('bookings?'))return [{id:B,learner_id:U,partner_user_id:P,status:'completed',language:'en',is_test_session:true}];
 if(route.includes('profiles?'))return [{id:P,role:'partner'}];
 if(route.includes('session_logs?'))return mode==='chat'?[]:[{id:'log',booking_id:B,participant_id:U,participant_role:'learner',transcript:values.map((text,i)=>({id:'s'+i,text,speaker:'learner',timestamp:'2026-10-10T09:46:00Z'}))}];
 if(route.includes('booking_chat_messages?'))return mode==='speech'?[]:values.map((text,i)=>({id:'m'+i,booking_id:B,sender_id:U,sender_role:'learner',text,created_at:'2026-10-10T09:46:00Z'}));
 throw Error('unexpected read');}};}
(async()=>{
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#fffbf4'}}).png().toBuffer();let calls=0,puts=0,motifPrompt='';
 const fetchImpl=async(url,opts)=>{calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+ 'a'.repeat(32)+'/ai/run/'+I.MODEL);assert.equal(opts.headers.Authorization,'Bearer mock-token');const prompt=opts.body.get('prompt');motifPrompt=prompt;assert(!prompt.includes(B)&&!prompt.includes(U)&&!prompt.includes(P)&&!prompt.includes(texts[0]));assert(!/Judy|Jen|Letter/.test(prompt));assert.equal(opts.body.get('width'),'1024');assert.equal(opts.body.get('height'),'1024');const reference=opts.body.get('input_image_0');const m=await sharp(Buffer.from(await reference.arrayBuffer())).metadata();assert(m.width<512&&m.height<512);return {ok:true,json:async()=>({success:true,result:{image:png.toString('base64')}})};};
 const storage={put:async data=>{puts++;assert.equal(data.bookingId,B);assert.equal(data.actorId,P);assert.equal(data.contentType,'image/png');assert(!('partner_comment' in data));return {url:'https://storage.fixture.invalid/approved/image.png',durable:true,firstParty:true};}};
 const quota={reserve:async data=>{assert.equal(data.freeOnly,true);assert.equal(data.maxAttempts,2);return {plan:'workers_free',allowed:true,attempt:1,token:'reservation'};}};
 const qualityCheck=async({bytes})=>({reviewed:true,imageHash:crypto.createHash('sha256').update(bytes).digest('hex'),visibleText:'',logoDetected:false,watermarkDetected:false});
 async function setup(mode,values){const f=fixture(mode,values),source=await L.handle({...f,input:{action:'partner_letter_topics',booking_id:B}});return {...f,input:{action:'partner_illustration_generate',booking_id:B,source_version:source.body.source_version},enabled:true,quota,storage,fetchImpl,qualityCheck};}
 for(const mode of ['speech','chat','mixed']){const o=await setup(mode);const r=await I.handle(o);assert.equal(r.status,200);assert.equal(r.body.status,'ready');}
 const o=await setup('mixed'),before=calls;
 assert.equal((await I.handle({...o,enabled:false})).body.error,'generation_disabled');
 assert.equal((await I.handle({...o,quota:null})).body.error,'durable_storage_and_quota_required');
 assert.equal((await I.handle({...o,storage:null})).body.error,'durable_storage_and_quota_required');
 assert.equal((await I.handle({...o,input:{...o.input,source_version:'stale'}})).status,409);
 assert.equal((await I.handle({...o,input:{...o.input,prompt:'private data'}})).status,400);
 assert.equal((await I.handle({...o,user:{id:U}})).status,403);
 for(const claim of [{plan:'paid',allowed:true,attempt:1,token:'x'},{plan:'workers_free',allowed:true,attempt:3,token:'x'},null])assert.equal((await I.handle({...o,quota:{reserve:async()=>claim}})).body.error,'generation_not_reserved');
 const runtime=require('../api/_lib/keepsake-test-runtime.js');
 let unexpectedRead=0;
 const other=await I.handle({...o,input:{...o.input,booking_id:'33333333-3333-4333-8333-333333333333'},read:async()=>{unexpectedRead++;return [];}});
 assert.equal(other.body.error,'not_booking_partner');assert.equal(unexpectedRead,1);
 const configuredEnv={...o.env,CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
  DAYO_KEEPSAKE_TEST_BOOKING:B,DAYO_CLOUDFLARE_FREE_VERIFIED_AT:new Date().toISOString()};
 assert(runtime.createPilot({env:configuredEnv}));
 for(const patch of [{CLOUDFLARE_ACCOUNT_ID:'invalid'},{CLOUDFLARE_API_TOKEN:''},{SUPABASE_SERVICE_ROLE_KEY:''}])
  assert.equal(runtime.createPilot({env:{...configuredEnv,...patch}}),null);
 let privileged=0;
 const guarded=require('../api/conversation-recap.js').createHandler({env:{SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture'},
  illustrationPilot:{contracts:async()=>{privileged++;throw Error('not permitted');}},
  fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('/auth/v1/user')?{id:U}:[]})});
 const deniedResponse={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
 await guarded({method:'POST',headers:{authorization:'Bearer fixture'},body:{action:'partner_illustration_generate',booking_id:B}},deniedResponse);
 assert.equal(deniedResponse.statusCode,403);assert.equal(privileged,0,'User/outsider denial precedes privileged contracts');
 assert.equal(calls,before,'all safety gates prevent provider calls');
 for(const values of [[],['coffee rabbit','song Soo is installed','My name is Alice and I love coffee.']])assert.equal((await I.handle(await setup('chat',values))).body.status,'insufficient_evidence');
 for(const [status,code] of [[429,'quota_unavailable'],[500,'provider_http_error']]){let n=0;assert.equal((await I.handle({...o,fetchImpl:async()=>{n++;return {ok:false,status};}})).body.error,code);assert.equal(n,1,'no automatic retry');}
 assert.equal((await I.handle({...o,fetchImpl:async()=>{throw Error('network secret');}})).body.error,'provider_request_failed');
 const aborted=new AbortController();aborted.abort();assert.equal((await I.handle({...o,signal:aborted.signal,fetchImpl:async()=>{throw Error('abort');}})).body.error,'timeout');
 for(const encoded of ['bogus',Buffer.from('<svg/>').toString('base64'),(await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer()).toString('base64')])assert.equal((await I.handle({...o,fetchImpl:async()=>({ok:true,json:async()=>({result:{image:encoded}})})})).body.error,'invalid_image');
 assert.equal((await I.handle({...o,storage:{put:async()=>{throw Error('storage');}}})).body.error,'save_failed');
 assert.equal((await I.handle({...o,storage:{put:async()=>({url:'data:image/png;base64,x'})}})).body.error,'save_failed');
 let reserved=false;const atomic={reserve:async()=>{if(reserved)return null;reserved=true;return {plan:'workers_free',allowed:true,attempt:1,token:'once'};}};
 const count=calls;const concurrent=await Promise.all([I.handle({...o,quota:atomic}),I.handle({...o,quota:atomic})]);assert.equal(concurrent.filter(r=>r.status===200).length,1);assert.equal(calls-count,1,'mock atomic reservation prevents duplicate generation');
 const duplicateCount=calls;
 const reused=await I.handle({...o,quota:{reserve:async()=>({reused:true,state:'ready',token:'stored'})},storage:{...storage,read:async()=>({url:'https://fixture.supabase.co/storage/v1/object/sign/dayo-keepsakes/saved',asset:{bucket:'dayo-keepsakes',object_path:'saved'},expires_at:'fixture'})}});
 assert.equal(reused.status,409);assert.equal(reused.body.error,'saved_image_quality_unverified');assert.equal(calls,duplicateCount,'saved image never generates twice');
 for(const state of ['reserved','cleanup','failed']){
  const result=await I.handle({...o,quota:{reserve:async()=>({reused:true,state})}});
  assert.equal(result.body.error,state==='reserved'?'generation_pending':'attempt_already_used');
 }
 let failures=0;
 await I.handle({...o,quota:{...quota,fail:async data=>{failures++;assert.equal(data.code,'provider_http_error');}},fetchImpl:async()=>({ok:false,status:500})});
 assert.equal(failures,1,'provider failures recorded without retry or budget refund');
 const preQualityCalls=calls,preQualityPuts=puts;
 const missing=await I.handle({...o,qualityCheck:null});assert.equal(missing.body.error,'quality_check_unavailable');assert.equal(calls,preQualityCalls);assert.equal(puts,preQualityPuts);
 for(const assessment of [{visibleText:'BIRTH'},{visibleText:'2026'},{visibleText:'축하'},{logoDetected:true},{watermarkDetected:true}]){
  let failed=0;
  const result=await I.handle({...o,qualityCheck:async image=>({...await qualityCheck(image),...assessment}),quota:{...quota,fail:async data=>{failed++;assert.equal(data.code,'invalid_image');}}});
  assert.equal(result.body.error,'quality_rejected');assert.equal(failed,1);assert.equal(puts,preQualityPuts,'rejected image never enters storage/attachment');
 }
 for(const inspection of [async()=>({}),async image=>({...await qualityCheck(image),imageHash:'different-image'}),async()=>{throw Error('private scanner detail');}]){
  const result=await I.handle({...o,qualityCheck:inspection});assert.equal(result.body.error,'quality_check_unavailable');assert.equal(puts,preQualityPuts);
 }
 let inspected=0;
 const timeout=await I.handle({...o,qualityCheck:async({signal})=>{inspected++;return new Promise(resolve=>signal.addEventListener('abort',()=>resolve({}),{once:true}));}});
 assert.equal(timeout.body.error,'quality_check_unavailable');assert.equal(inspected,1);assert.equal(puts,preQualityPuts);
 assert(motifPrompt.includes('No greeting cards')&&motifPrompt.includes('numbers')&&motifPrompt.includes('book covers'));
 const party=await setup('chat',['I went to a birthday party.','We talked about wine.','I like a quiet café.']);
 const actualParty=await I.handle(party);assert.equal(actualParty.status,200);assert(motifPrompt.includes('celebratory'));
 assert(!motifPrompt.includes('I went to a birthday party.')&&!motifPrompt.includes('We talked about wine.'));
 const clean=await setup('chat',[]),baseRead=clean.read;
 const contaminated={...clean,read:async route=>route.includes('booking_chat_messages?')?[{id:'unrelated',booking_id:'33333333-3333-4333-8333-333333333333',sender_id:U,sender_role:'learner',text:'I went to a birthday party and talked about wine.',created_at:'2026-10-10T09:46:00Z'}]:baseRead(route)};
 assert.equal((await I.handle(contaminated)).body.status,'insufficient_evidence','other booking cannot supply motifs');
 const retry=await I.handle({...o,quota:{reserve:async()=>({plan:'workers_free',allowed:true,attempt:2,token:'second'})}});assert.equal(retry.status,200);
 assert.equal((await I.handle({...o,quota:{reserve:async()=>{throw Error('budget unknown');}}})).body.error,'quota_unavailable');
 const route=require('../api/conversation-recap.js').createHandler({env:{SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture'},fetchImpl:async url=>{assert(url.endsWith('/auth/v1/user'));return {ok:true,json:async()=>({id:P})};}});
 function response(){return {setHeader(){},end(value){this.body=JSON.parse(value);}};}
 const unauth=response();await route({method:'POST',headers:{},body:{booking_id:B,action:'partner_illustration_generate'}},unauth);assert.equal(unauth.statusCode,401);
 const disabled=response();await route({method:'POST',headers:{authorization:'Bearer fixture'},body:{booking_id:B,action:'partner_illustration_generate'}},disabled);assert.equal(disabled.statusCode,503);assert.equal(disabled.body.error,'generation_disabled');
 // Production-compatible REST endpoint must reach chat-only evidence and existing quota,
 // not fail during SDK initialization. Synthetic data only; every request is mocked.
 const S=require('../api/_lib/keepsake-safety.js');
 const endpointEnv={...configuredEnv,NEXT_PUBLIC_SUPABASE_URL:' https://fixture.supabase.co/rest/v1/ ',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mock-anon'};
 const syntheticChat=Array.from({length:13},(_,i)=>({id:'chat-'+i,booking_id:B,
  sender_id:i<8?U:P,sender_role:i<8?'learner':'partner',
  text:i<8?texts[i%texts.length]:'I also enjoy coffee in a quiet café.',created_at:'2026-10-10T09:46:00Z'}));
 let providerRequests=0,reservations=0,chatReads=0,speechReads=0,assetReads=0;
 const mockSourceFetch=async(raw,options={})=>{
  const url=new URL(String(raw)),headers=new Headers(options.headers);
  if(url.hostname==='api.cloudflare.com'){providerRequests++;throw Error('provider prohibited');}
  assert.equal(url.origin,'https://fixture.supabase.co');
  assert(!url.pathname.includes('/rest/v1/rest/v1'),'REST suffix must not duplicate');
  let data;
  if(url.pathname==='/auth/v1/user')data={id:P};
  else if(url.pathname==='/rest/v1/bookings')data=[{id:B,learner_id:U,partner_user_id:P,status:'completed',language:'en',is_test_session:false}];
  else if(url.pathname==='/rest/v1/profiles')data=[{id:P,role:'partner'}];
  else if(url.pathname==='/rest/v1/session_logs'){speechReads++;data=[];}
  else if(url.pathname==='/rest/v1/booking_chat_messages'){
   chatReads++;assert.equal(headers.get('authorization'),'Bearer fixture');
   assert.equal(url.searchParams.get('booking_id'),'eq.'+B);
   data=syntheticChat.filter(m=>url.searchParams.get('sender_id')==='eq.'+m.sender_id);
  }else if(url.pathname==='/rest/v1/rpc/dayo_keepsake_reserve_review'){
   reservations++;assert.equal(headers.get('authorization'),'Bearer fixture-only');
   const args=JSON.parse(options.body);assert.equal(args.p_booking_id,B);assert.equal(args.p_actor_id,P);
   data={allowed:false,error:'daily_budget_exhausted'}; // Stop before any provider/storage writes.
  }else if(url.pathname==='/rest/v1/rpc/dayo_keepsake_asset'){
   assetReads++;assert.equal(headers.get('authorization'),'Bearer fixture');data=null;
  }else throw Error('unexpected mock path: '+url.pathname);
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const sourceHandler=require('../api/conversation-recap.js').createHandler({env:endpointEnv,fetchImpl:mockSourceFetch});
 const sourceResponse=response();await sourceHandler({method:'POST',headers:{authorization:'Bearer fixture'},
  body:{booking_id:B,action:'partner_letter_topics'}},sourceResponse);
 assert.equal(sourceResponse.statusCode,200);assert(sourceResponse.body.source_version);
 assert(sourceResponse.body.topics.length>0,'chat-only preflight has verified synthetic motifs');
 const generateResponse=response();await sourceHandler({method:'POST',headers:{authorization:'Bearer fixture'},
  body:{booking_id:B,action:'partner_illustration_generate',topic_id:require('../public/partner-report-contract.js').storyIllustrations(sourceResponse.body.topics)[0].theme,source_version:sourceResponse.body.source_version}},generateResponse);
 assert.equal(generateResponse.statusCode,409,'chat-only source and inspector wiring preserve the exhausted quota gate');
 assert.equal(generateResponse.body.error,'daily_budget_exhausted');assert.equal(reservations,1);
 assert.equal(providerRequests,0);assert.equal(chatReads,2);assert.equal(speechReads,2);
 const assetResponse=response();await sourceHandler({method:'POST',headers:{authorization:'Bearer fixture'},
  body:{booking_id:B,action:'keepsake_image'}},assetResponse);
 assert.equal(assetResponse.statusCode,200);assert.equal(assetResponse.body.image,null);assert.equal(assetReads,1);
 for(const value of ['https://fixture.supabase.co','https://fixture.supabase.co/',
  'https://fixture.supabase.co/rest/v1',' https://fixture.supabase.co/rest/v1/ ']){
  S.serviceClient({env:{...endpointEnv,NEXT_PUBLIC_SUPABASE_URL:value},fetchImpl:mockSourceFetch});
  S.participantClient({env:{...endpointEnv,NEXT_PUBLIC_SUPABASE_URL:value},jwt:'fixture',fetchImpl:mockSourceFetch});
 }
 for(const value of ['http://fixture.supabase.co','https://untrusted.invalid/rest/v1/',
  'https://fixture.supabase.co/other',''])assert.throws(()=>S.serviceClient({env:{...endpointEnv,NEXT_PUBLIC_SUPABASE_URL:value},fetchImpl:mockSourceFetch}));
 const C=require('../public/partner-report-contract.js');assert.equal(C.illustrationAvailable,true);assert.equal(C.illustrationProvider,'cloudflare');
 const api=fs.readFileSync(path.join(__dirname,'../api/conversation-recap.js'),'utf8');assert(api.includes('partner_illustration_generate'));assert(!api.includes('enabled:true'));
 console.log('PASS: speech/chat/mixed motifs; privacy/minimal provider payload; 511x285 reference; unconfigured-server fallback, normal-booking routing; ownership/revision; quota/attempt/atomic mock gates; 429/500/network/abort; format/dimensions; storage failure; no auto retries or report writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
