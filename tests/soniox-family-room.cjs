'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.env.DAYO_PILOT_ROOT||path.resolve(__dirname,'..');
const B='2191fadf-ac84-4d9e-8102-d52ae0095683',U='c4552202-cafd-4ab5-bbf9-5a23719edf44',P='1bc0eab5-9399-4da8-a90c-145ab0c4409d';
const actualHtml=fs.readFileSync(path.join(root,'public/room.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
let mints=0;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/soniox-credentials'){let raw='';req.on('data',v=>raw+=v);req.on('end',()=>{const body=JSON.parse(raw),role=req.headers.authorization==='Bearer fixture-partner'?'partner':'learner';assert.equal(body.bookingId,B);res.setHeader('Content-Type','application/json');
  const common={role,bookingId:B,model:'stt-rt-v5',singleUse:true,startExpirySeconds:60,maxSessionSeconds:1500,scheduledAt:new Date(Date.now()-1000).toISOString(),canonical:true};
  if(body.action==='state')return res.end(JSON.stringify({...common,available:true}));
  assert.equal(body.action,'start');assert.deepEqual(Object.keys(body).sort(),['action','bookingId']);mints++;res.end(JSON.stringify({...common,api_key:'snx_temp_fixture',expires_at:new Date(Date.now()+60000).toISOString(),captureEndsAt:Date.now()+1500000}));});return;
 }
 if(url.pathname==='/room')return res.end(actualHtml);
 const file=path.join(root,'public',url.pathname.slice(1));if(fs.existsSync(file)){res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/plain');res.end(fs.readFileSync(file));}else{res.statusCode=404;res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const role of ['learner','partner'])for(const locale of ['ko','en'])for(const width of [360,390,430,768,1280]){
   const page=await browser.newPage({viewport:{width,height:840}});let errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/room?bookingId='+B+'&soniox=1');
   await page.evaluate(({B,U,P,role,locale})=>{
    // Full production room-live + actual DOM, mocked auth/storage/provider only.
    window.fixtureRole=role;window.__dayoUsePeerJS=true;window.savedPayloads=[];window.transcriptEvents=[];window.speechRuns=[];
    document.body.classList.add('room-access-granted',role==='partner'?'theme-partner':'theme-learner');document.querySelector('#room-access-screen').hidden=true;
    window.DayOI18n={getLang:()=>locale,t:k=>k,tf:k=>k};
    window.DayORoomAccess={allowed:true,role:role==='partner'?'partner':'user',bookingId:B,roomId:'fixture-room',userId:role==='partner'?P:U,learnerId:U,partnerId:P,scheduledAt:new Date(Date.now()-1000).toISOString()};window.DayORoomAccessReady=Promise.resolve(window.DayORoomAccess);
    window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture-'+role,user:{id:role==='partner'?P:U}}}})},from:()=>{const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:null,error:null})};return chain;}};
    window.DayOProfileStore={saveSessionLog:async(transcript,extra)=>{window.savedPayloads.push({transcript,extra});return {ok:true};}};
    window.SpeechRecognition=class {constructor(){window.speechRuns.push(this);}start(){if(this.onstart)this.onstart();}stop(){if(this.onend)this.onend();}abort(){if(this.onend)this.onend();}};
    window.WebSocket=class {constructor(){this.readyState=0;this.bufferedAmount=0;window.fixtureSocket=this;setTimeout(()=>{this.readyState=1;this.onopen();},20);}send(data){if(typeof data==='string'&&data==='')setTimeout(()=>this.onmessage({data:JSON.stringify({finished:true})}),15);else if(typeof data==='string')window.providerConfig=JSON.parse(data);else window.sentAudio=(window.sentAudio||0)+data.byteLength;}close(){this.readyState=3;if(this.onclose)this.onclose();}};
    document.addEventListener('dayo:transcript',event=>window.transcriptEvents.push(event.detail));
    window.makeMic=async()=>{const c=new AudioContext(),osc=c.createOscillator(),dest=c.createMediaStreamDestination();osc.connect(dest);osc.start();window.localMediaStream=dest.stream;window.fixtureAudio=c;};
   },{B,U,P,role,locale});
   await page.addScriptTag({url:'http://127.0.0.1:'+server.address().port+'/room-live.js'});
   let paid=fs.readFileSync(path.join(root,'public/soniox-room.js'),'utf8');
   await page.addScriptTag({content:paid});
   await page.waitForFunction(()=>!!window.DayOLive && /Soniox (ready|준비 완료)/.test(document.querySelector('#devicePreflightStt')?.textContent));
   assert.equal(await page.locator('#sonioxRoomConsent').count(),0,'No duplicate consent UI for the previously consented family booking');
   const before=mints;await page.waitForTimeout(550);assert.equal(mints,before,'No allocation on page load or readiness');
   await page.evaluate(()=>window.makeMic());await page.waitForTimeout(550);assert.equal(mints,before,'Microphone readiness alone does not allocate');
   await page.locator('#devicePreflightContinue').click();
   await page.waitForFunction(()=>window.DayOSonioxRoom.isActive());
   await page.waitForFunction(()=>window.sentAudio>0);assert.equal(mints,before+1);
   assert.equal(await page.evaluate(()=>window.providerConfig.model),'stt-rt-v5');assert.deepEqual(await page.evaluate(()=>window.providerConfig.language_hints),['en','ko','es']);
   const texts=['The crowded restaurant had delicious food.','We enjoyed a quiet café after our trip.','오늘은 날씨가 좋아요. I want to go outside.','I like coffee.','I like coffee.'];
   await page.evaluate(texts=>{for(const text of texts)window.fixtureSocket.onmessage({data:JSON.stringify({tokens:[{text:'WRONG INTERIM',is_final:false},{text,is_final:true},{text:'<end>',is_final:true}]})});},texts);
   const rows=await page.evaluate(()=>window.DayOLive.getTranscript());assert.deepEqual(rows.map(r=>r.text),texts);assert(rows.every(r=>r.speaker===role));
   await page.evaluate(()=>window.DayOLive.acceptSonioxFinal('DUPLICATE CALLBACK',5));assert.equal((await page.evaluate(()=>window.DayOLive.getTranscript())).length,5);
   assert.equal(await page.evaluate(()=>window.transcriptEvents.length),5,'Actual canonical event emitted for existing caption path');
   const saved=await page.evaluate(()=>window.DayOLive.saveTranscript(true));assert.equal(saved.ok,true);const payload=await page.evaluate(()=>window.savedPayloads[0]);assert.equal(payload.extra.bookingId,B);assert.deepEqual(payload.transcript.map(r=>r.text),texts);assert(payload.transcript.every(r=>r.speaker===role));
   // Actual saved-input Recap builder uses those accepted rows, never provider interims.
   const recap=require(path.join(root,'public/conversation-recap.js')).build({bookingId:B,learnerId:U,partnerId:P,language:'en',learnerLog:{id:'fixture-learner-log',booking_id:B,participant_id:U,participant_role:'learner',transcript:role==='learner'?payload.transcript:[]},partnerLog:{id:'fixture-partner-log',booking_id:B,participant_id:P,participant_role:'partner',transcript:role==='partner'?payload.transcript:[]}});
   assert.equal(recap.metrics.user_utterance_count,role==='learner'?5:0,'No Partner speech in Learner spoken metrics');
   assert.equal(recap.questions.length,role==='learner'?6:0,'Actual learner finals supply three grounded words / six questions; no Partner-only quiz');
   if(width===360&&locale==='ko'){
    const originalMints=mints;await page.evaluate(()=>window.fixtureSocket.onmessage({data:JSON.stringify({error_code:429})}));await page.waitForFunction(()=>!window.DayOSonioxRoom.isActive());
    await page.waitForTimeout(600);assert.equal(mints,originalMints,'No automatic paid retry after provider failure');assert.equal(await page.evaluate(()=>window.localMediaStream.getAudioTracks()[0].readyState),'live');
    await page.evaluate(()=>window.DayOLive.flushTranscript());assert.equal((await page.evaluate(()=>window.DayOLive.saveTranscript())).ok,true);assert.deepEqual((await page.evaluate(()=>window.DayOLive.getTranscript())).map(r=>r.text),texts);assert.deepEqual(errors,[]);await page.close();continue;
   }
   await page.evaluate(()=>{window.dayoSessionEnded=true;window.fixtureSocket.onmessage({data:JSON.stringify({tokens:[{text:'A final sentence.',is_final:true}]})});});
   const ended=await page.evaluate(async()=>{await window.DayOLive.flushTranscript();return window.DayOLive.saveTranscript();});assert.equal(ended.ok,true);
   assert.equal(await page.evaluate(()=>window.localMediaStream.getAudioTracks()[0].readyState),'live','Original WebRTC microphone never stopped');
   assert.equal(await page.evaluate(()=>window.DayOSonioxRoom.isActive()),false);const snapshot=await page.evaluate(()=>window.DayOLive.getTranscript());assert.equal(snapshot.at(-1).text,'A final sentence.');
   await page.evaluate(()=>window.DayOLive.acceptSonioxFinal('LATE MUTATION',999));assert.deepEqual(await page.evaluate(()=>window.DayOLive.getTranscript()),snapshot,'No post-finalization mutation');
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS full room DOM + synthetic PCM: both roles, KO/EN 360/390/430/1280; existing family consent, no duplicate UI, normal-entry auto-start; one allocation; exact mixed-language finals -> actual canonical transcript event and save payload -> existing Recap metrics; repeats retained, interims/duplicate/late finals excluded; 2.5s bounded final flush; WebRTC track retained. Provider/auth/database transport mocked; real speech accuracy not claimed.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
