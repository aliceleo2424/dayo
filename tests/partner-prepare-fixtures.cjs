const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {JSDOM}=require('jsdom'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const source=read('public/availability-slots.js'),html=read('public/partner.html'),css=read('public/partner-dashboard.css'),i18n=read('public/i18n.js');
const template=new JSDOM(html).window.document;
const styles=[...template.querySelectorAll('style,link[rel="stylesheet"]')].map(n=>n.tagName==='STYLE'?n.outerHTML:'<style>'+read('public/'+n.getAttribute('href').split('?')[0].replace(/^\//,''))+'</style>').join('');
const fixture=`<!doctype html><html><head>${styles}</head><body class="theme-partner partner-page-body is-partner-lounge"><main class="page partner-container partner-dashboard-wrap" id="partner-dashboard-section"><section class="card dashboard-next"><h2>Upcoming Schedule</h2><div id="partner-upcoming-list" class="partner-upcoming-list"></div><p id="partner-upcoming-empty"></p><span id="partner-upcoming-count"></span></section></main>${template.getElementById('bookingPrepModal').outerHTML}${template.getElementById('partnerUpcomingAllModal').outerHTML}</body></html>`;
const start=source.indexOf('  var partnerHeroTimer ='),end=source.indexOf('  function renderPartnerBookings(');
const harness=`var cancellationCalls=[];function openPartnerCancellation(booking){cancellationCalls.push(booking.id);return Promise.resolve();}
function t(key,vars){return vars?DayOI18n.tf(key,vars):DayOI18n.t(key);}
function formatUpcomingDay(date){return date.toISOString().slice(0,10);}
function pad(n){return String(n).padStart(2,'0');}
${source.slice(start,end)}
partnerBriefUserId='partner-fixture';`;
// Fixture data contains private fields to prove only approved display/brief fields render.
const rows=[{id:'booking-a',language:'en',status:'confirmed',partner_user_id:'partner-fixture',scheduled_at:new Date(Date.now()+8*3600000).toISOString()},
{id:'booking-b',language:'fr',status:'confirmed',partner_user_id:'partner-fixture',scheduled_at:new Date(Date.now()+9*3600000).toISOString()},
{id:'booking-c',language:'en',status:'confirmed',partner_user_id:'partner-fixture',scheduled_at:new Date(Date.now()-10*60000).toISOString()},
{id:'booking-d',language:'en',status:'confirmed',partner_user_id:'partner-fixture',scheduled_at:new Date(Date.now()+10*3600000).toISOString()},
{id:'booking-e',language:'en',status:'confirmed',partner_user_id:'partner-fixture',scheduled_at:new Date(Date.now()+11*3600000).toISOString()}];
const briefs={
'booking-a':{learner_display_name:'Alex',language:'en',email:'private@example.invalid',phone:'010-1234-5678',legal_name:'PRIVATE LEGAL NAME',conversation_brief:{schema_version:1,purposes:['travel','casual'],interests:['travel','food_cafe','movies'],conversation_style:'encourage',korean_support_preference:'required'}},
'booking-b':{learner_display_name:'Bo',language:'fr',conversation_brief:{schema_version:1,purposes:['work_school'],conversation_style:'slow'}},
'booking-c':{learner_display_name:'Casey',language:'en',conversation_brief:{purposes:['casual'],interests:['movies'],chat_style:'casual',chat_request:'gentle'}}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function visibleText(w){return [...w.document.querySelectorAll('#bookingPrepModal p,#bookingPrepModal dt,#bookingPrepModal dd')].filter(n=>!n.closest('[hidden]')).map(n=>n.textContent).join(' ');}
function client(w){w.rpcCalls=[];return {rpc(name,args){assert.equal(name,'get_partner_booking_brief');w.rpcCalls.push(args.p_booking_id);return Promise.resolve({data:briefs[args.p_booking_id]});},from(){throw Error('Unexpected profile/booking query');}};}
async function unit(){
 for(const f of ['partner.html','availability-slots.js','partner-dashboard.css','i18n.js'])assert.equal(read(f),read('public/'+f),f+' mirror');
 const base=cp.execFileSync('git',['show','c0f34f8:public/availability-slots.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(source.slice(0,start),base.slice(0,base.indexOf('  var partnerHeroTimer =')),'Availability/booking helpers unchanged');
 assert.equal(source.slice(end),base.slice(base.indexOf('  function renderPartnerBookings(')),'Booking/availability implementation unchanged');
 for(const [left,right] of [['  function updateEntry()','    enter.onclick'],['    enter.onclick','    partnerPrepRender'],['  // Load the separate Partner cancellation','  function renderPartnerUpcomingList(']]){
  assert.equal(source.slice(source.indexOf(left),source.indexOf(right,source.indexOf(left))),base.slice(base.indexOf(left),base.indexOf(right,base.indexOf(left))),'Protected '+left);
 }
 const w=new JSDOM(fixture,{url:'https://fixture.local/partner',runScripts:'outside-only'}).window;
 try{
  w.eval(i18n);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.DayOI18n.setLang('EN');w.eval(harness);
  const c=client(w);w.renderPartnerUpcomingList(rows,c,false);await settle();
  assert.equal(w.document.querySelectorAll('#partner-upcoming-list .partner-upcoming-prepare').length,4);
  assert.equal(w.document.querySelectorAll('#partner-upcoming-list .partner-booking-cancel').length,3);
  for(const [index,id] of [[0,'booking-c'],[1,'booking-a'],[2,'booking-b']]){
    w.document.querySelectorAll('#partner-upcoming-list .partner-upcoming-prepare')[index].click();await settle();
    assert.ok(w.document.getElementById('booking-prep-name').textContent.includes(briefs[id].learner_display_name));
    const help=w.document.querySelector('[data-brief-field="korean_support_preference"]');
    assert.equal(help.hidden,id!=='booking-a');
    assert.equal(w.document.querySelector('[data-brief-field="chat_request"]').hidden,id!=='booking-c');
    if(id==='booking-a'){
      assert.equal(w.document.querySelectorAll('[data-brief-field="purposes"] .booking-prep-chip').length,2);
      assert.equal(w.document.querySelectorAll('[data-brief-field="interests"] .booking-prep-chip').length,3);
      assert.ok(visibleText(w).includes('Plenty of praise and encouragement'));
      assert.ok(visibleText(w).includes('Needed'));
      assert.ok(visibleText(w).includes('Here’s what your user would like for this conversation.'));
      assert.ok(visibleText(w).includes('Your user’s preferred conversation style'));
      assert.equal(w.document.querySelector('[data-brief-field="talk_topics"]'),null,'Prepare has no Talk Card suggestion section');
      assert.doesNotMatch(visibleText(w),/Suggested Talk Card topics|Travel & culture|Food & desserts/);
    }
    if(id==='booking-b'){assert.equal(w.document.querySelector('[data-brief-field="interests"]').hidden,true);assert.equal(w.document.querySelector('[data-brief-field="interests"] dd').textContent,'');}
    assert.doesNotMatch(visibleText(w),/private@example|010-1234|PRIVATE LEGAL NAME|booking-[abc]/);
    assert.equal(w.document.getElementById('booking-prep-enter').disabled,id!=='booking-c');
  }
  for(const display of ['email@example.invalid','010-1234-5678','123e4567-e89b-12d3-a456-426614174000'])assert.equal(w.partnerBriefLabels({learner_display_name:display}).display,w.DayOI18n.t('partner.upcoming.userFallback'));
  for(const brief of [null,{}, {purposes:'travel',interests:{email:'leak'}},{schema_version:1,korean_support_preference:null}]){const labels=w.partnerBriefLabels({conversation_brief:brief});assert.equal(labels.values.korean_support_preference,'');assert.equal(labels.values.talk_topics || '','');}
  assert.equal(w.partnerBriefLabels({conversation_brief:{interests:['movies','unknown'],purposes:['unknown']}}).values.talk_topics || '','','No invented Talk Card category');
  for(const category of ['daily','travel','food'])assert.ok(read('public/room.html').includes('data-talk-cat="'+category+'"'),'Hint group exists in room');
  assert.equal(w.partnerBriefLabels({conversation_brief:{schema_version:1,korean_support_preference:'any'}}).values.korean_support_preference,'Any');
  w.closePartnerBookingPrep();w.document.querySelectorAll('#partner-upcoming-list .partner-upcoming-prepare')[3].click();await settle();assert.equal(w.document.getElementById('booking-prep-empty').hidden,false);
  w.closePartnerBookingPrep();w.partnerBriefCache.clear();
  const pending={};const delayed={rpc(name,args){return new Promise(resolve=>pending[args.p_booking_id]=resolve);}};
  w.openPartnerBookingPrep(rows[0],delayed);w.openPartnerBookingPrep(rows[1],delayed);
  assert.ok(w.document.getElementById('booking-prep-empty').textContent.includes('Loading'));
  pending['booking-b']({data:briefs['booking-b']});await settle();pending['booking-a']({data:briefs['booking-a']});await settle();
  assert.ok(w.document.getElementById('booking-prep-name').textContent.includes('Bo'),'Late A cannot replace B');
  assert.ok(!visibleText(w).includes('Alex'));assert.ok(w.rpcCalls.every(id=>rows.some(row=>row.id===id)));
  w.DayOI18n.setLang('KO',false);w.partnerPrepRender();assert.ok(visibleText(w).includes('일 · 학교'));
  w.closePartnerBookingPrep();w.partnerBriefCache.clear();w.console.warn=()=>{};w.openPartnerBookingPrep(rows[0],{rpc(){return Promise.reject(Error('fixture unavailable'));}});await settle();await settle();
  assert.ok(w.document.getElementById('booking-prep-empty').textContent.includes('불러오지 못'));
  assert.equal(w.document.querySelectorAll('#booking-prep-brief .booking-prep-chip').length,0,'RPC error cannot reuse another booking chips');
  console.log('PASS snapshot fields, optional omissions, private fields, malformed data, exact booking and out-of-order responses; protected behavior unchanged');
 }finally{w.close();}
}
async function visual(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [390,1280,1440])for(const lang of ['EN','KO']){
  const page=await browser.newPage({viewport:{width,height:900}});await page.setContent(fixture);await page.addScriptTag({content:i18n});await page.addScriptTag({content:harness});
  await page.evaluate(({rows,briefs,lang})=>{DayOI18n.setLang(lang,false);window.fixtureClient={rpc(name,args){return Promise.resolve({data:briefs[args.p_booking_id]});}};renderPartnerUpcomingList(rows,fixtureClient,false);},{rows,briefs,lang});
  const cards=page.locator('#partner-upcoming-list .partner-upcoming-row'),buttons=page.locator('#partner-upcoming-list .partner-upcoming-prepare');let offset=null,size=null;
  for(let n=0;n<3;n++){const card=await cards.nth(n).boundingBox(),button=await buttons.nth(n).boundingBox();assert.ok(card && button);const actual=button.y-card.y;if(offset===null){offset=actual;size=[button.width,button.height];}assert.ok(Math.abs(actual-offset)<1,'Equal action vertical offset');assert.deepEqual([button.width,button.height],size);assert.equal(button.height,44);assert.ok(card.x+card.width<=width+1,'Card fits viewport');}
  for(let n=1;n<3;n++){const prep=await buttons.nth(n).boundingBox(),cancel=await cards.nth(n).locator('.partner-booking-cancel').boundingBox();assert.equal(cancel.y-(prep.y+prep.height),8);assert.equal(cancel.width,prep.width);assert.equal(cancel.height,44);}
  await buttons.nth(1).click();await page.locator('#booking-prep-brief').waitFor({state:'visible'});
  assert.equal(await page.locator('#booking-prep-brief').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.ok((await page.locator('#booking-prep-name').textContent()).includes('Alex'));
  assert.equal(await page.locator('#bookingPrepModal .booking-prep-chip').count(),6);
  assert.equal(await page.locator('#bookingPrepModal [data-brief-field="talk_topics"]').count(),0);
  assert.equal(await page.locator('#bookingPrepModal [data-i18n="partner.prep.snapshot"]').textContent(),lang==='EN'?'Here’s what your user would like for this conversation.':'이번 대화에서 유저가 원하는 내용을 확인해 주세요.');
  assert.equal(await page.locator('#bookingPrepModal [data-brief-field="chat_style"] dt').textContent(),lang==='EN'?'Your user’s preferred conversation style':'유저가 선호하는 대화 스타일');
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('bookingPrepModal')).opacity==='1');
  if(process.env.DAYO_PREP_SCREENSHOTS){fs.mkdirSync(process.env.DAYO_PREP_SCREENSHOTS,{recursive:true});await page.screenshot({animations:'disabled',path:path.join(process.env.DAYO_PREP_SCREENSHOTS,`brief-${lang}-${width}.png`)});await page.evaluate(()=>closePartnerBookingPrep());await page.waitForFunction(()=>getComputedStyle(document.getElementById('bookingPrepModal')).opacity==='0');await page.screenshot({animations:'disabled',path:path.join(process.env.DAYO_PREP_SCREENSHOTS,`schedule-${lang}-${width}.png`)});}
  // The existing dashboard count control delegates to this hidden renderer button.
  await page.evaluate(()=>{closePartnerBookingPrep();document.querySelector('.partner-upcoming-more').click();});
  const all=page.locator('#partner-upcoming-all-list .partner-upcoming-prepare');assert.equal(await all.count(),5);
  for(let n=0;n<5;n++){const button=await all.nth(n).boundingBox();assert.ok(button && button.x+button.width<=width && button.width===128 && button.height===44);}
  await all.nth(2).click();assert.ok((await page.locator('#booking-prep-name').textContent()).includes('Bo'));
  await page.locator('#booking-prep-enter').scrollIntoViewIfNeeded();const entry=await page.locator('#booking-prep-enter').boundingBox();assert.ok(entry && entry.y>=0 && entry.y+entry.height<=900,'Entry action reachable in scrollable brief');
  await page.close();console.log('PASS consistent Prepare size/top alignment and brief chips '+lang+' '+width);
 }}finally{await browser.close();}
}
(async()=>{await unit();await visual();})().catch(error=>{console.error(error);process.exitCode=1;});
