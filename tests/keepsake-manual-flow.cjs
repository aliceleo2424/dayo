const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const {JSDOM}=require('jsdom');const repo=path.join(__dirname,'..');
const I=require(path.join(repo,'api/_lib/partner-illustration-cloudflare.js')),L=require(path.join(repo,'api/_lib/partner-letter.js')),Q=require(path.join(repo,'api/_lib/partner-illustration-quality.js')),UI=require(path.join(repo,'public/user-conversation-report.js'));
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
(async()=>{
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#fffbf4'}}).png().toBuffer();
 const env={SUPABASE_SERVICE_ROLE_KEY:'fixture-only',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-only'};
 const chat=[{id:'chat-1',booking_id:B,sender_id:U,sender_role:'learner',text:'I talked about a birthday party and wine.',created_at:'2026-10-10T09:46:00Z'}];
 const read=async route=>route.includes('bookings?')?[{id:B,learner_id:U,partner_user_id:P,is_test_session:true,status:'completed',language:'en'}]:route.includes('profiles?')?[{id:P,role:'partner'}]:route.includes('session_logs?')?[]:route.includes('booking_chat_messages?')?chat:[];
 const source=await L.handle({input:{action:'partner_letter_topics',booking_id:B},user:{id:P},read,env});
 const choices=await I.choices({input:{booking_id:B},user:{id:P},read,env});assert.equal(choices.body.choices[0].id,'chat_birthday_wine');
 let calls=0,staged=0,published=0;
 const inspectorResult={model:'clef-omni',answers:{text:{type:'noul',noul:0.01},mark:{type:'noul',noul:0.01},object:{type:'noul',noul:0.01},clear:{type:'noul',noul:0.70}},usage:{input_tokens:1559,output_tokens:0}};
 const quality=Q.createInspector({env,manualReview:true,fetchImpl:async()=>({ok:true,json:async()=>({result:inspectorResult})})});
 const auto=Q.createInspector({env,fetchImpl:async()=>({ok:true,json:async()=>({result:inspectorResult})})});
 await assert.rejects(auto({bytes:png,contentType:'image/png'}),{code:'quality_check_unavailable'});
 const options={input:{action:'partner_illustration_generate',booking_id:B,topic_id:'chat_birthday_wine',source_version:source.body.source_version,request_id:crypto.randomUUID()},read,user:{id:P},env,enabled:true,manualReview:true,testOnly:false,
 quota:{reserve:async()=>({allowed:true,plan:'workers_free',attempt:1,token:'reserved-image'}),fail:async()=>{}},
 storage:{put:async()=>{published++;throw Error('must never publish');},putPending:async data=>{staged++;assert.equal(data.bookingId,B);return {status:'pending_review',booking_id:B,attempt_id:'reserved-image'};},reviewStatus:async()=>({status:'pending_review',url:null})},qualityCheck:quality,
 fetchImpl:async(url,opts)=>{calls++;assert(!opts.body.get('prompt').includes(chat[0].text));return {ok:true,json:async()=>({result:{image:png.toString('base64')}})};}};
 const pending=await I.handle(options);assert.equal(pending.body.status,'pending_review');assert.equal(pending.body.url,null);assert.equal(staged,1);assert.equal(published,0);
 const repeated=await I.handle({...options,quota:{reserve:async()=>({reused:true,state:'ready',token:'reserved-image'})}});assert.equal(repeated.body.status,'pending_review');assert.equal(calls,1);
 assert.equal((await I.handle({...options,input:{...options.input,topic_id:'invented-event'}})).status,400);assert.equal(calls,1);
 inspectorResult.answers.text.noul=0.99;
 assert.equal((await I.handle(options)).body.error,'quality_rejected');assert.equal(staged,1,'text-contaminated image is never staged/published');assert.equal(published,0);
 const report={booking_id:B,partner_comment:'Saved Letter',quiz_score:100,feedback:[{kind:'saved'}]},original=JSON.stringify(report);
 const client={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}},asset={bucket:'dayo-keepsakes',object_path:B+'/'+crypto.randomUUID()+'.png'};
 const approved=await UI.refreshKeepsakeImage(client,report,async()=>({ok:true,json:async()=>({managed:true,image:{approved:true,booking_id:B,asset,content_type:'image/png',data:png.toString('base64')}})}));
 assert(UI.memoryData(approved,'ko').image.startsWith('blob:'));
 for(const locale of ['ko','en']){const noLetter={...approved,partner_comment:''};assert(UI.renderDetail(noLetter,locale).includes('ucr-approved-keepsake'));assert(!UI.renderLetter(noLetter,locale).includes('Letter from'));assert.equal(UI.renderLetter({...report,partner_comment:''},locale),'');}
 const revoked=await UI.refreshKeepsakeImage(client,approved,async()=>({ok:true,json:async()=>({managed:true,image:null})}));assert.equal(UI.memoryData(revoked,'en').image,'');assert.equal(JSON.stringify(report),original);
 assert.equal(revoked.partner_comment,'Saved Letter');assert.equal(revoked.quiz_score,100);
 // Real IncomingMessage headers are prototype accessors, not enumerable spread fields.
 const {IncomingMessage}=require('node:http'),{Socket}=require('node:net');
 const ReviewAPI=require(path.join(repo,'api/conversation-recap.js')).createHandler;
 const request=new IncomingMessage(new Socket());request.method='POST';request.headers={authorization:'Bearer fixture'};request.body={action:'keepsake_review',review:{action:'read',booking_id:B}};
 const response={setHeader(){},end(raw){this.body=JSON.parse(raw);}};
 let authChecks=0;
 const route=ReviewAPI({env:{SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-only'},fetchImpl:async url=>{
  if(url.endsWith('/auth/v1/user')){authChecks++;return new Response(JSON.stringify({id:P}),{status:200});}
  if(url.endsWith('/rest/v1/rpc/dayo_keepsake_asset'))return new Response('null',{status:200});
  if(url.endsWith('/rest/v1/rpc/dayo_keepsake_beta_access'))return new Response('true',{status:200});
  throw Error('unexpected request');
 }});
 await route(request,response);assert.equal(authChecks,1);assert.equal(response.statusCode,200);assert.equal(response.body.image,null);assert.equal(response.body.managed,true);
 const html=fs.readFileSync(path.join(repo,'public/keepsake-beta.html'),'utf8'),dom=new JSDOM(html,{url:'https://fixture.vercel.app/keepsake-beta?bookingId='+B,runScripts:'outside-only'}),w=dom.window;
 w.supabaseClient=client;w.AbortSignal=AbortSignal;w.crypto.randomUUID=crypto.randomUUID;let requests=0;
 w.fetch=async(route,opts)=>{requests++;let input=JSON.parse(opts.body);if(input.action==='keepsake_review')input=input.review;assert.equal(input.booking_id,B);return {ok:true,json:async()=>input.action==='partner_illustration_choices'?{source_version:source.body.source_version,choices:choices.body.choices}:input.action==='partner_illustration_generate'?{status:'pending_review'}:{managed:true,image:null}};};
 const script=[...w.document.scripts].find(s=>!s.src).textContent;w.eval(script);
 const settle=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
 w.document.getElementById('choices').click();await settle();assert.equal(w.document.getElementById('topic').value,'chat_birthday_wine');assert.equal(w.document.getElementById('generate').disabled,false);
 w.document.getElementById('generate').click();w.document.getElementById('generate').click();await settle();assert.equal(requests,2,'repeated click only sends one request');assert(w.document.getElementById('status').textContent.includes('Awaiting Partner review'));assert.equal(w.document.getElementById('image').hidden,true);
 w.document.getElementById('read').click();await settle();assert.equal(w.document.getElementById('image').hidden,true);assert(w.document.getElementById('status').textContent.includes('No approved image'));
 assert.equal(fs.readFileSync(path.join(repo,'public/user-conversation-report.js'),'utf8'),fs.readFileSync(path.join(repo,'user-conversation-report.js'),'utf8'));
 assert.equal(fs.readFileSync(path.join(repo,'public/keepsake-beta.html'),'utf8'),fs.readFileSync(path.join(repo,'keepsake-beta.html'),'utf8'));
 dom.window.close();console.log('PASS: exact-session theme selection, uncertain→unpublished only, contaminated rejection, duplicate request status/no extra generation, approved-only customer attachment/revocation refresh, original Letter/score unchanged, actual beta DOM click flows and mirrors. Mocked provider only.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
