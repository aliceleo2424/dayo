// Real local room DOM and click handlers; synthetic server outcomes, no live writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,'public',f),'utf8');
const room=read('room.html'),B='44444444-4444-4444-8444-444444444444',P='22222222-2222-4222-8222-222222222222';
const send=room.slice(room.indexOf('    function setPartnerReportSubmitStatus('),room.indexOf('    window.handleHeaderExitClick =',room.indexOf('    function setPartnerReportSubmitStatus(')));
const routing=room.slice(room.indexOf('    function handleSessionEndRouting('),room.indexOf('    function beginUserSessionEndFlow('));
const immediate=room.slice(room.indexOf('      window.openQuizModalImmediately = function'),room.indexOf('      window.refreshCurrentRecapLetter ='));
const html=room.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const shots=process.env.DAYO_LETTER_SCREENSHOTS;
async function run(){
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!name){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}const file=path.resolve(root,'public',name);if(!file.startsWith(path.resolve(root,'public')+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});let cases=0;
 try{
  for(const locale of ['KO','EN'])for(const width of [360,390,1280])for(const endReason of ['normal','personal']){
   const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);
   for(const f of ['i18n.js','learner-expressions.js','conversation-recap.js','user-conversation-report.js'])await page.addScriptTag({url:base+'/'+f});
   await page.evaluate(({locale,B,P})=>{
    document.body.classList.add('room-access-granted','theme-partner');DayOI18n.setLang(locale);localStorage.setItem('dayo_lang',locale);
    window.DayORoomAccess={allowed:true,role:'partner',bookingId:B,partnerId:P};window.stopPartnerSentencePolling=()=>{};window.persistTranscript=async()=>({ok:true});
    window.__calls={save:0,read:0,reward:0};window.__stored='';window.__saveMode='success';window.__readFailure=false;
    window.supabaseClient={auth:{getUser:async()=>({data:{user:{id:P}}}),getSession:async()=>({data:{session:{access_token:'local-fixture'}}})}};
    window.DayOPartnerReport={payload:()=>({})};window.DayOPartnerReward={complete:async()=>{__calls.reward++;return {success:true,reward_amount:0,is_test_session:true};}};
    window.persistSessionReport=async d=>{__calls.save++;if(__saveMode==='rejected')return {ok:false,confirmedFailure:true};__stored=d.partnerComment;return {ok:__saveMode!=='lost-ack'};};
    window.fetch=async()=>{__calls.read++;if(__readFailure)return {ok:false};const bytes=new TextEncoder().encode(__stored);const digest=__stored?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join(''):null;return {ok:true,json:async()=>({letter_sent:!!__stored,letter_digest:digest})};};
    document.getElementById('partner-report-popup').style.setProperty('display','flex','important');
    document.getElementById('popup-partner-comment').value='';
    // Do not navigate the local fixture after confirmed success.
    const original=setTimeout;window.setTimeout=(f,ms)=>ms===1200?original(()=>{},0):original(f,ms);
   },{locale,B,P});
   await page.addScriptTag({content:send});
   const button=page.locator('#btn-final-partner-submit'),status=page.locator('#partner-report-submit-status');
   await button.click();await page.waitForFunction(()=>!document.getElementById('btn-final-partner-submit').disabled);assert.match(await status.textContent(),locale==='KO'?/작성해 주세요/:/Write a Letter/);
   await page.locator('#popup-partner-comment').fill('A synthetic test Letter.');await page.evaluate(()=>{__readFailure=true;});await button.click();await page.waitForFunction(()=>!document.getElementById('btn-final-partner-submit').disabled);assert.equal(await page.evaluate(()=>__calls.save),0);assert.match(await status.textContent(),locale==='KO'?/전송을 시도하지/:/Sending was not attempted/);
   await page.evaluate(()=>{__readFailure=false;});await button.click();await page.waitForFunction(()=>document.getElementById('partner-report-submit-status').textContent.includes('No saved')||document.getElementById('partner-report-submit-status').textContent.includes('저장된 레터가 없습니다'));
   await page.evaluate(()=>{__saveMode='rejected';});await button.click();await page.waitForFunction(()=>!document.getElementById('btn-final-partner-submit').disabled);assert.match(await status.textContent(),locale==='KO'?/보내지 못했습니다/:/couldn’t send/);assert.equal(await page.locator('#popup-partner-comment').inputValue(),'A synthetic test Letter.');
   await page.evaluate(()=>{__saveMode='lost-ack';});await button.click();await page.waitForFunction(()=>!!document.getElementById('partner-letter-lounge-link'));assert.equal(await page.evaluate(()=>__calls.reward),1);assert.match(await status.textContent(),locale==='KO'?/레터를 보냈어요/:/^Letter sent/);
   assert.deepEqual(errors,[]);cases++;
   // Feedback -> Recap, with actual room rendering and styles.
   await page.evaluate(({B,locale})=>{
    document.getElementById('partner-report-popup').style.setProperty('display','none','important');document.body.classList.remove('theme-partner');document.body.classList.add('theme-learner');
    window.DayORoomAccess={allowed:true,role:'user',bookingId:B,partnerName:'Jen',language:'en'};
    window.__feedbackSaves=0;window.__feedbackFailure=false;window.supabaseClient.rpc=async n=>n.startsWith('get_')?{data:null}:(__feedbackSaves++,__feedbackFailure?{error:{message:'fixture-error'}}:{data:{}});
    window.stopAllMedia=()=>{};window.hideLiveVideoStage=()=>{};window.getUserQuizModal=()=>document.getElementById('quiz-modal');window.getUserRatingModal=()=>null;
    window.isPartnerRoomMode=()=>false;window.isObserverRoomMode=()=>false;
    const model=DayOConversationRecap.build({bookingId:B,learnerId:'fixture-user',language:'en',learnerLog:{id:'fixture-log',booking_id:B,participant_role:'learner',participant_id:'fixture-user',transcript:[{id:'fixture-final',text:'The cafe was quiet and crowded.',speaker:'learner',timestamp:'2026-10-12T00:00:00Z'}]}});
    window.getLearnerReviewSnapshot=()=>({booking_id:B,feedback:[model],partner_comment:'',key_expressions:[],partner_name:'Jen'});
   },{B,locale});
   await page.addScriptTag({url:base+'/conversation-partner-feedback.js'});await page.addScriptTag({content:immediate+routing});
   for(const reason of [endReason]){
    await page.evaluate(reason=>{window.__dayoSessionEndRouted=false;window.isEarlyExit=reason==='personal';window.__endPromise=handleSessionEndRouting();document.dispatchEvent(new CustomEvent('dayo:session-ended',{detail:{reason,finalized:true}}));},reason);
    await page.locator('dialog[open]').waitFor();assert.equal(await page.locator('.cpf-actions button').count(),1);
    assert.equal(await page.locator('#quiz-modal').isVisible(),false,'Recap stays hidden during Feedback');
    const box=await page.locator('.cpf-primary').boundingBox();assert(box.x>=0&&box.x+box.width<=width);assert(await page.locator('.cpf-primary').evaluate(e=>e.scrollWidth<=e.clientWidth));
    if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,`feedback-${locale}-${width}.png`)});}
    if(width===390){await page.locator('input[value="spoke_slowly"]').check({force:true});await page.evaluate(()=>{__feedbackFailure=true;});await page.locator('.cpf-primary').click();await page.waitForFunction(()=>!document.querySelector('.cpf-primary').disabled);assert.match(await page.locator('.cpf-status').textContent(),locale==='KO'?/저장/:/couldn’t confirm/);assert.equal(await page.locator('#quiz-modal').isVisible(),false);}
    await page.locator('.cpf-primary').click();await page.locator('dialog').waitFor({state:'detached'});await page.evaluate(()=>__endPromise);await page.locator('#quiz-modal').waitFor({state:'visible'});
    assert.equal(await page.locator('#quiz-content-box .ucr-letter-pending,#quiz-content-box .ucr-report-refresh,#quiz-content-box .btn-save-card').count(),0);
    assert.equal(await page.evaluate(()=>__feedbackSaves),width===390?1:0);
    assert.match(await page.locator('#quiz-content-box').textContent(),/crowded/);assert.match(await page.locator('#quiz-content-box').textContent(),/quiet/);
    assert.equal(await page.evaluate(()=>DayOConversationRecap.saved(getLearnerReviewSnapshot()).questions.length),4,'two source words retain four questions');
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('dayo:session-ended',{detail:{finalized:true}})));assert.equal(await page.locator('dialog').count(),0);
    if(shots)await page.screenshot({path:path.join(shots,`recap-${locale}-${width}.png`)});
   }
   assert.deepEqual(errors,[]);cases++;await page.close();
  }
  console.log('PASS actual Chromium room DOM: '+cases+' KO/EN 360/390/1280 Letter/Feedback cases; empty Letter, preflight failure, rejection, lost ACK, exact read-back, draft, one CTA, failure continuation, Recap separation/no placeholders, no overflow. Synthetic transport only; no live DB save claimed.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
