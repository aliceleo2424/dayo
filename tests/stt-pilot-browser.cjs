'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=process.env.DAYO_PILOT_ROOT||path.resolve(__dirname,'..');
const BOOKING='cfb91da5-991b-48d9-b86f-a7e912cb8ed4';
const room=`<!doctype html><html><body>Existing room fixture<script>
window.DayORoomAccess={allowed:true,role:'user',bookingId:'${BOOKING}'};
window.pilotUser='learner';window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-'+window.pilotUser,user:{id:window.pilotUser}}}})}};
window.makeMic=async()=>{const ctx=new AudioContext();const osc=ctx.createOscillator();const dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();window.localMediaStream=dest.stream;};
</script></body></html>`;
let grants=0;const used=new Set();
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/stt-pilot-credentials'){
  let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
   const body=JSON.parse(raw),role=(req.headers.authorization||'').includes('partner')?'partner':'learner',fixture=req.headers['x-local-fixture']||'default';
   res.setHeader('Content-Type','application/json');
   if(body.action==='state')return res.end(JSON.stringify({role,available:!used.has('snx_temp_'+fixture+'_'+role),model:'stt-rt-v5',singleUse:true,startExpirySeconds:60,maxSessionSeconds:300}));
   assert(!body.action||body.action==='start','Page never probes provider or auto-mints');
   grants++;const max=fixture.includes('deadline')?1:fixture.includes('overlong')?601:300;
   res.end(JSON.stringify({bookingId:BOOKING,role,model:'stt-rt-v5',
    api_key:'snx_temp_'+fixture+'_'+role,expires_at:new Date(Date.now()+30000).toISOString(),maxSessionSeconds:max,captureEndsAt:Date.now()+max*1000}));
  });return;
 }
 if(url.pathname==='/room')return res.end(room);
 const name=path.basename(url.pathname);if(!['stt-pilot.html','stt-pilot.js','stt-pilot-pcm-worklet.js'].includes(name)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'public',name)));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  async function make(width,scenario,role='learner'){
   const page=await browser.newPage({viewport:{width,height:850},extraHTTPHeaders:{'x-local-fixture':width+'-'+scenario}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.exposeFunction('claimFixtureGrant',key=>{if(used.has(key))return false;used.add(key);return true;});
   await page.addInitScript(()=>{
    window.transport=[];
    class WS{
     constructor(url,protocols){this.url=url;this.protocols=protocols;this.readyState=0;this.bufferedAmount=0;window.testSocket=this;
      setTimeout(async()=>{this.readyState=1;this.onopen&&this.onopen();const allowed=await window.claimFixtureGrant(protocols[1]);
       if(!allowed){this.onmessage&&this.onmessage({data:JSON.stringify({error_code:401,tokens:[]})});this.close();}},0);}
     send(value){window.transport.push(typeof value==='string'?value:value.byteLength);if(value==='')setTimeout(()=>{
      this.onmessage&&this.onmessage({data:JSON.stringify({tokens:[],finished:true})});this.close();},10);}
     close(){this.readyState=3;this.onclose&&this.onclose();}
    }
    window.WebSocket=WS;window.emitPilot=message=>window.testSocket.onmessage({data:JSON.stringify(message)});
   });
   async function prepare(){
    await page.goto('http://127.0.0.1:'+server.address().port+'/stt-pilot.html?bookingId='+BOOKING);
    const f=page.frames().find(f=>f.url().includes('/room?'));await f.waitForFunction(()=>!!window.DayORoomAccess);
    await f.evaluate(r=>{window.DayORoomAccess.role=r==='partner'?'partner':'user';window.pilotUser=r;},role);
    await page.waitForFunction(()=>!document.querySelector('#check').disabled);
    await page.locator('#check').click();
    await page.waitForFunction(()=>!document.querySelector('#check').disabled);
    return f;
   }
   let frame=await prepare();return{page,errors,frame,prepare};
  }
  async function begin(c){await c.frame.evaluate(()=>window.makeMic());await c.page.locator('#consent').check();await c.page.locator('#start').click();}
  for(const width of [360,390,1280]){
   const role=width===390?'partner':'learner';let c=await make(width,'main',role),before=grants;
   assert(await c.page.locator('#start').isDisabled());assert.equal(grants,before);
   assert((await c.page.locator('#readiness').innerText()).includes('Ready · '+role));
   assert.equal(await c.page.locator('#remaining').innerText(),'05:00');
   await c.page.locator('#consent').check();await c.page.locator('#start').click();assert.equal(grants,before,'No mic means no credential request');
   await begin(c);await c.page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Streaming'));
   await c.page.waitForFunction(()=>window.transport.some(x=>typeof x==='number'));
   const config=await c.page.evaluate(()=>JSON.parse(window.transport.find(x=>typeof x==='string')));
   assert.deepEqual(config.language_hints,['en','ko','es']);assert.equal(config.model,'stt-rt-v5');assert(!('api_key'in config));assert(!('translation'in config));
   assert.notEqual(config.language_hints_strict,true);assert.equal(config.enable_language_identification,true);assert.equal(config.enable_endpoint_detection,true);
   await c.page.evaluate(()=>{
    window.emitPilot({tokens:[{text:'interim guess',is_final:false}]});
    for(const text of ['I like coffee.','I like coffee.','I visited 경복궁.','경복궁에 갔어요.','Me gusta conversar.'])
     window.emitPilot({tokens:[{text,is_final:true,end_ms:1},{text:'<end>',is_final:true}]});
   });assert.equal(await c.page.locator('#paid-output p').count(),5);
   assert(!(await c.page.locator('#paid-output').innerText()).includes('interim guess'));
   const mixedExamples=[
    "I'm going to 강남역 tomorrow.",
    'I had 김치찌개 for lunch.',
    '오늘은 날씨가 좋아요. I want to go outside.',
    'I speak English, 한국어, and un poco de español.'
   ];
   for(const [exampleIndex,text] of mixedExamples.entries()){
    const initialRows=await c.page.locator('#paid-output p').count();
    await c.page.evaluate(({text,exampleIndex})=>{
     // Deterministic response fixtures only: no simulated recognition-quality claim.
     const pieces=Array.from(text),mid=Math.floor(pieces.length/2),base=(exampleIndex+1)*1000;
     const token=(text,index,is_final=true)=>({text,is_final,language:/[가-힣]/.test(text)?'ko':'en',start_ms:base+index,end_ms:base+index+1});
     window.emitPilot({tokens:[token('미확정 wrong interim',0,false)]});
     window.emitPilot({tokens:pieces.slice(0,mid).map((v,i)=>token(v,i)).concat([token('미확정 wrong interim',mid,false)])});
     window.emitPilot({tokens:pieces.slice(mid).map((v,i)=>token(v,mid+i))});
    },{text,exampleIndex});
    assert.equal(await c.page.locator('#paid-output p').count(),initialRows,'No premature sentence flush or interim rows');
    await c.page.evaluate(()=>window.emitPilot({tokens:[{text:'<end>',is_final:true}]}));
    assert.equal(await c.page.locator('#paid-output p').count(),initialRows+1);
    const rendered=await c.page.locator('#paid-output p').last().innerText();
    assert(rendered.startsWith(role+': '+text+' · final latency ~'),'Original multilingual sentence, order and local-role attribution preserved');
   }
   assert(!(await c.page.locator('#paid-output').innerText()).includes('미확정 wrong interim'));

   await c.frame.evaluate(r=>{
    document.dispatchEvent(new CustomEvent('dayo:transcript',{detail:{speaker:r==='partner'?'learner':'partner',text:'OTHER PARTICIPANT'}}));
    document.dispatchEvent(new CustomEvent('dayo:transcript',{detail:{speaker:r,text:'Actual local browser final'}}));
   },role);assert.equal(await c.page.locator('#browser-output p').count(),1);
   await c.frame.evaluate(()=>{window.localMediaStream.getAudioTracks()[0].enabled=false;});await c.page.waitForTimeout(150);
   assert.equal(await c.page.locator('#paid-output p').count(),9,'Silence/mute never fabricates a result');
   await c.frame.evaluate(()=>{window.localMediaStream.getAudioTracks()[0].enabled=true;});
   await c.page.locator('#stop').click();await c.page.waitForTimeout(40);
   assert(await c.page.locator('#start').isDisabled(),'One attempt only; no same-page paid restart');
   assert.equal(await c.frame.evaluate(()=>window.localMediaStream.getAudioTracks()[0].readyState),'live');
   assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await c.page.screenshot({path:'C:/Users/Alice/Documents/DayO/qa/soniox-pilot/bounded-'+width+'.png',fullPage:true});
   const beforeReload=grants;c.frame=await c.prepare();
   await c.page.waitForFunction(()=>document.querySelector('#readiness').textContent.includes('Allocation already consumed'));
   await c.page.locator('#consent').check();
   assert.equal(grants,beforeReload,'Reload state check never requests a replacement credential');
   assert(await c.page.locator('#start').isDisabled(),'Durable exhausted state survives reload');assert.deepEqual(c.errors,[]);await c.page.close();
   for(const scenario of ['disconnect','account','mic','deadline','overlong','consent']){
    c=await make(width,scenario,role);await begin(c);
    if(scenario==='overlong'){
     await c.page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Pilot unavailable'));
     assert.equal(await c.page.evaluate(()=>!!window.testSocket),false,'An overlong grant never opens a paid connection');
    }else{
     await c.page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Streaming'));
     if(scenario==='disconnect')await c.page.evaluate(()=>window.testSocket.close());
     if(scenario==='account')await c.frame.evaluate(()=>{window.pilotUser='other-account';});
     if(scenario==='mic')await c.frame.evaluate(()=>window.localMediaStream.getAudioTracks()[0].stop());
     if(scenario==='consent')await c.page.locator('#consent').uncheck();
     const message={disconnect:'Disconnected',account:'Account changed',mic:'Room or microphone changed',deadline:'Capture limit reached',consent:'Consent withdrawn'}[scenario];
     await c.page.waitForFunction(m=>document.querySelector('#status').textContent.includes(m),message).catch(async e=>{throw new Error(width+' '+scenario+' status: '+await c.page.locator('#status').innerText());});
     if(scenario==='deadline')assert.equal(await c.page.locator('#remaining').innerText(),'00:00');
     const current=grants;await c.page.waitForTimeout(150);assert.equal(grants,current,'No automatic paid retry');assert(await c.page.locator('#start').isDisabled());
    }
    assert.deepEqual(c.errors,[]);await c.page.close();
   }
  }
  console.log('PASS actual DOM + synthetic PCM: 360/390/1280, both roles, one-shot and reload rejection, all four requested en/ko/es code-switch examples across token batches, exact Unicode/order/role preservation, interim omission, repeat preservation, mute/silence, independent attribution, original mic preserved, disconnect/account/mic/consent/time limits, overlong grant rejected. No live provider/real voice/billing/data writes.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
