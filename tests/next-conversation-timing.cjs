// SESSIONEND-01-ADD1: real My Page timing code, isolated DB and fake clock; no live writes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process'),{JSDOM}=require('jsdom'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r/g,''),source=read('public/mypage-dashboard.js'),room=read('public/room.html');
const html=read('public/mypage.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const exposed=source.replace('  function init() {','  function init() { return;').replace(/\}\)\(\);\s*$/,"window.__timing={state:nextConversationState,refresh:refreshNextConversationTiming,load:loadUrgentSessionBanner};})();");
const start=Date.parse('2026-10-07T08:30:00+09:00'),id='66666666-6666-4666-8666-000000000000',user='33333333-3333-4333-8333-333333333333';
const setup=async(lang='KO',at=start-30*60000,iso='2026-10-06T23:30:00Z')=>{
 const dom=new JSDOM(html,{url:'https://fixture.invalid/mypage',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 await new Promise(resolve=>w.document.readyState==='loading'?w.document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
 let now=at,hidden=false,n=0;const timers=new Map(),queries=[];
 const Original=w.Date;w.Date=class extends Original{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 w.setTimeout=(fn,delay)=>{timers.set(++n,{fn,at:now+delay});return n;};w.clearTimeout=key=>timers.delete(key);
 Object.defineProperty(w.document,'hidden',{get:()=>hidden,configurable:true});
 w._dayoAuthUser={id:user};const booking={id,scheduled_at:iso,status:'confirmed',partner_user_id:'partner'};
 w.supabaseClient={auth:{getUser:async()=>({data:{user:{id:user}}})},rpc:async()=>({data:[{id:'partner',nickname:'Alex'}]}),from(table){queries.push(table);const q={select(){return q;},eq(){return q;},gte(){return q;},order(){return q;},then(resolve,reject){return Promise.resolve({data:[booking]}).then(resolve,reject);}};return q;}};
 w.eval(read('public/i18n.js'));w.DayOI18n.setLang(lang,false);w.eval(exposed);await w.__timing.load();
 return {dom,w,queries,booking,timers,set(time){now=time;},advance(time){while(true){const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>time)break;now=first[1].at;timers.delete(first[0]);first[1].fn();}now=time;},visibility(value){hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));}};
};
(async()=>{
 for(const name of ['mypage-dashboard.js','i18n.js'])assert.equal(read(name),read('public/'+name),'mirror '+name);
 const old=cp.execFileSync('git',['show','origin/main:public/mypage-dashboard.js'],{cwd:root,encoding:'utf8'}).replace(/\r/g,'');
 for(const [left,right] of [['  async function cancelUpcomingBooking(','  async function loadUrgentSessionBanner('],['  async function loadRecentTechIssueResults(','  window.enterStudio =']])assert.equal(source.slice(source.indexOf(left),source.indexOf(right)),old.slice(old.indexOf(left),old.indexOf(right)),'protected '+left);
 assert(room.includes('now < startAt - 5 * 60 * 1000'));assert(room.includes('now >= startAt + 30 * 60 * 1000'));
 const parser=room.slice(room.indexOf('      function parseZonedInstant('),room.indexOf('      function parseSeoulSlotTime('));
 const early=room.match(/if \(!internalTest && (now < startAt - 5 \* 60 \* 1000)\)/)[1],late=room.match(/if \(!internalTest && (now >= startAt \+ 30 \* 60 \* 1000)\)/)[1];
 const roomGate=new Function('scheduled','now',parser+`const startAt=parseZonedInstant(scheduled);return Number.isFinite(startAt)&&!(${early})&&!(${late});`);
 for(const lang of ['KO','EN']){
  const f=await setup(lang),w=f.w,button=w.document.querySelector('#urgent-session-banner button[onclick="enterStudio()"]'),badge=w.document.getElementById('urgent-session-badge');
  for(const minutes of [30,10,6,5.01,5,1,0,-1,-29.99,-30]){
   f.set(start-minutes*60000);const s=w.__timing.refresh();assert.equal(s.allowed,roomGate(f.booking.scheduled_at,w.Date.now()));assert.equal(button.disabled,!s.allowed);
   if(minutes>5)assert.equal(badge.textContent,lang==='KO'?Math.ceil(minutes)+'분 후 시작':'Starts in '+Math.ceil(minutes)+' min');
   if(minutes===5)assert.equal(badge.textContent,lang==='KO'?'입장 가능':'Ready to enter');
  }
  assert.equal(w.__timing.state({bookingId:id,scheduledAt:'2026-10-07T08:30:00'},start-60000).allowed,false,'Unzoned input cannot claim ready');
  assert.equal(w.__timing.state({bookingId:id,scheduledAt:'2026-10-07T08:30:00+09:00'},start-5*60000).allowed,true,'KST offset is same instant');
  assert.equal(w.__timing.state({bookingId:id,scheduledAt:f.booking.scheduled_at,internalTest:true},start-60*60000).allowed,true,'Existing special internal room exception remains');
  f.set(start-10*60000);w.__timing.refresh();const before=f.queries.length;f.advance(start-5*60000);assert.equal(button.disabled,false);assert.equal(badge.textContent,lang==='KO'?'입장 가능':'Ready to enter');assert.equal(f.queries.length,before,'No DB polling');assert.equal(f.timers.size,1,'One timing timer');
  f.visibility(true);assert.equal(f.timers.size,0);f.set(start+30*60000);f.visibility(false);assert.equal(button.disabled,true);assert.equal(badge.textContent,lang==='KO'?'입장 시간 종료':'Entry window closed');
  f.set(start-60000);w.dispatchEvent(new w.Event('focus'));assert.equal(button.disabled,false);assert.equal(f.queries.length,before);
  const fresh=await setup(lang,start-60000);assert.equal(fresh.w.document.getElementById('urgent-session-badge').textContent,lang==='KO'?'입장 가능':'Ready to enter');fresh.dom.window.close();
  const cached=JSON.stringify({partnerName:'Cache',scheduledAt:f.booking.scheduled_at});w.localStorage.setItem('dayo_next_session',cached);w.supabaseClient=null;await w.__timing.load();assert.equal(button.disabled,true);assert.notEqual(badge.textContent,lang==='KO'?'입장 가능':'Ready to enter','Unverified cache cannot claim entry');
  f.dom.window.close();console.log('PASS '+lang+': 30/10/6/5/1/start/+30 boundaries, real Room gate parity, zoned KST/UTC, refresh, foreground/focus, elapsed time, no DB polling, unverified cache');
 }
 const browser=await chromium.launch({channel:'chrome',headless:true});try{for(const width of [390,1280])for(const lang of ['KO','EN']){
  const page=await browser.newPage({viewport:{width,height:900}});await page.setContent(html);await page.addScriptTag({content:read('public/i18n.js')});await page.evaluate(lang=>DayOI18n.setLang(lang,false),lang);await page.addScriptTag({content:exposed});
  await page.evaluate(({start,id})=>{document.getElementById('urgent-session-banner').hidden=false;document.getElementById('urgent-session-title').textContent='Alex';document.getElementById('urgent-session-badge').textContent=DayOI18n.tf('mypage.urgent.ready');document.querySelector('#urgent-session-banner button[onclick="enterStudio()"] ').disabled=false;},{start,id});
  assert.equal(await page.locator('#urgent-session-banner').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  console.log('PASS Next Conversation '+lang+' '+width+'px no overflow');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
