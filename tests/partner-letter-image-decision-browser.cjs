'use strict';
// Owner decision 2026-10-17 (later): opening the Letter auto-draws one picture from the user's words (once per booking per device,
// never over an existing image); the Partner can draw again or switch to the DayO picture.
// Owner decision 2026-10-17: a Partner Letter needs an explicit image decision (create, "Don't use", or
// "Send without a picture"); an image failure never blocks because "Send without a picture" is always offered.
// Real room popup DOM + real scripts; provider/auth/Storage mocked. The send rule is evaluated from room.html itself.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),crypto=require('crypto'),sharp=require('sharp'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),B='44444444-4444-4444-8444-444444444444',P='22222222-2222-4222-8222-222222222222',A='55555555-5555-4555-8555-555555555555';
const roomSrc=fs.readFileSync(path.join(root,'public/room.html'),'utf8');
const rule=roomSrc.slice(roomSrc.indexOf("        var letterPopup = document.getElementById('partner-report-popup');"),roomSrc.indexOf("        // Owner decision 2026-10-15: the image shown in the Letter popup goes with the Letter unless"));
assert.ok(rule.length>200&&rule.includes("image_required"),'send rule found in room.html');
(async()=>{const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#fffbf4'}}).png().toBuffer(),hash=crypto.createHash('sha256').update(png).digest('hex');let gens=0,state=null,fail=false;
 const room=roomSrc.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const row=()=>({id:A,booking_id:B,state:'ready',review_state:state,object_path:B+'/'+A+'.png',image_sha256:hash,storage_version:'v1'});
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/conversation-recap'){let raw='';for await(const c of req)raw+=c;const q=JSON.parse(raw);res.setHeader('Content-Type','application/json');
  if(q.action==='partner_letter_topics')return res.end(JSON.stringify({topics:[],source_version:'v1'}));
  if(q.action==='partner_illustration_choices')return res.end(JSON.stringify({source_version:'v1',mode:'keywords',max_pick:2,choices:[{id:'k1',label:'Wine',token:'tok-wine'}]}));
  if(q.action==='partner_illustration_generate'){gens++;await new Promise(r=>setTimeout(r,300));if(fail){res.statusCode=502;return res.end(JSON.stringify({error:'provider_http_error'}));}state='pending';return res.end(JSON.stringify({status:'pending_review',booking_id:B,attempt_id:A}));}
  const a=q.review.action;if(a==='list')return res.end(JSON.stringify(state?[row()]:[]));
  if(a==='preview')return res.end(JSON.stringify({booking_id:B,attempt_id:A,asset:{bucket:'dayo-keepsakes',...row()},content_type:'image/png',data:png.toString('base64')}));
  state={approve:'approved',reject:'rejected',revoke:'revoked'}[a];return res.end(JSON.stringify({status:state}));}
  if(url.pathname==='/')return res.end(room);const file=path.resolve(root,'public','.'+url.pathname);if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  async function prepare(locale,keepAuto){await page.goto(base);if(!keepAuto)await page.evaluate(()=>localStorage.clear());await page.evaluate(({B,P,locale,rule})=>{window.partnerLetterLocale=()=>locale.toUpperCase();window.DayOI18n={getLang:()=>locale};window.DayORoomAccess={allowed:true,bookingId:B,role:'partner',partnerId:P};window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}}),getUser:async()=>({data:{user:{id:P}}})}};document.body.classList.add('room-access-granted','theme-partner');document.getElementById('partner-report-popup').style.setProperty('display','flex','important');
    window.sendRule=new Function('bookingId','var out="ok";function setPartnerReportSubmitStatus(c){out=c;}(function(){'+rule+'})();return out;');},{B,P,locale,rule});
   for(const f of ['partner-report-contract.js','partner-illustration.js','keepsake-partner-review.js','partner-report.js'])await page.addScriptTag({url:base+'/'+f});await page.evaluate(B=>DayOPartnerReport.open({bookingId:B}),B);await page.locator('#pr-keyword-options button').first().waitFor({state:'attached'});}
  const decide=()=>page.evaluate(B=>sendRule(B),B);
  for(const locale of ['ko','en']){
   // Auto-draw success: one picture is drawn on open and counts as the decision; reopening never draws again.
   state=null;fail=false;gens=0;await prepare(locale);
   await page.waitForFunction(()=>document.querySelector('[data-keepsake-action="reject"]')&&!document.querySelector('[data-keepsake-action="reject"]').disabled);
   assert.equal(gens,1,'opening the Letter auto-draws once');assert.equal(await decide(),'ok','auto-drawn image sends');
   await prepare(locale,true);await page.waitForTimeout(500);assert.equal(gens,1,'reopening never auto-draws again');
   // Auto-draw failure: never stuck; the old explicit-decision flow applies.
   state=null;fail=true;gens=0;await prepare(locale);
   await page.waitForFunction(B=>!document.getElementById('pr-image-make').disabled&&DayOKeepsakePartnerReview.decision(B,document.getElementById('partner-report-popup'))!=='busy',B);assert.equal(gens,1,'auto-draw attempted once');
   const skip=page.locator('#pr-image-skip');assert.equal(await skip.textContent(),locale==='ko'?'기본 그림으로 보내기':'Send with the DayO picture');
   assert.equal(await decide(),'image_required','failed auto-draw and no decision blocks the Letter');
   await skip.click();assert.equal(await skip.getAttribute('aria-pressed'),'true');assert.match(await page.locator('#pr-illustration').getAttribute('src'),/keepsake-default\.webp$/,'default picture shown');assert.equal(await page.locator('#pr-illustration').isVisible(),true);assert.equal(await decide(),'ok','"Send without a picture" allows sending');
   await skip.click();assert.equal(await decide(),'image_required','un-skipping blocks again');
   // Provider failure: still never stuck, "Send without a picture" works.
   fail=true;{const wine=page.getByRole('button',{name:'Wine',exact:true});if(await wine.getAttribute('aria-pressed')!=='true')await wine.click();}await page.locator('#pr-image-make').click();
   assert.equal(await decide(),'image_busy','while drawing, wait');
   await page.waitForFunction(B=>!document.getElementById('pr-image-make').disabled&&DayOKeepsakePartnerReview.decision(B,document.getElementById('partner-report-popup'))!=='busy',B);assert.equal(await decide(),'image_required');await skip.click();assert.equal(await decide(),'ok','failure + skip sends');
   // Success: shown image counts as a decision; "Don't use" also counts.
   fail=false;await page.locator('#pr-image-make').click();await page.waitForFunction(()=>document.querySelector('[data-keepsake-action="reject"]')&&!document.querySelector('[data-keepsake-action="reject"]').disabled);
   assert.equal(await skip.getAttribute('aria-pressed'),'false','drawing resets the skip choice');assert.equal(await page.evaluate(B=>DayOKeepsakePartnerReview.decision(B,document.getElementById('partner-report-popup')),B),'shown');assert.equal(await decide(),'ok','shown image sends');
   await page.locator('[data-keepsake-action="reject"]').click();await page.waitForFunction(B=>DayOKeepsakePartnerReview.decision(B,document.getElementById('partner-report-popup'))==='unused',B);assert.equal(await decide(),'ok','"Don\'t use" sends');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  // Missing modules (e.g. older cached page) never block the Letter.
  await page.goto(base);assert.equal(await page.evaluate(({B,rule})=>new Function('bookingId','var out="ok";function setPartnerReportSubmitStatus(c){out=c;}(function(){'+rule+'})();return out;')(B),{B,rule}),'ok');
  assert.deepEqual(errors,[]);
  console.log('PASS image decision: auto-draw on open (once, sends); failed auto-draw + none blocks; skip/shown/"Don\'t use" send; drawing waits; provider failure never stuck; missing modules never block; KO/EN labels');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
