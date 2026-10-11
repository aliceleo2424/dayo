// P0 countdown: actual My Page loader, authenticated read mocks, Room gate parity, responsive UI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {JSDOM}=require('jsdom'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r/g,'');
const source=read('public/mypage-dashboard.js'),room=read('public/room.html');
const html=read('public/mypage.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const exposed=source.replace('  function init() {','  function init() { return;').replace(/\}\)\(\);\s*$/,
 'window.__timing={state:nextConversationState,refresh:refreshNextConversationTiming,load:loadUrgentSessionBanner,format:formatSessionWhen,eligible:eligibleUpcomingBookings};})();');
const start=Date.parse('2026-10-07T08:30:00+09:00'),id='66666666-6666-4666-8666-000000000000',user='33333333-3333-4333-8333-333333333333';
const row=(over={})=>({id,scheduled_at:'2026-10-06T23:30:00Z',status:'confirmed',partner_user_id:'partner',ended_at:null,is_test_session:false,...over});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(lang='KO',at=start-30*60000,options={}){
 const dom=new JSDOM(html,{url:'https://fixture.invalid/mypage',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 await new Promise(resolve=>w.document.readyState==='loading'?w.document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
 let now=at,hidden=false,n=0;const timers=new Map(),queries=[],calls=[];const booking=row();
 const Original=w.Date;w.Date=class extends Original{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 w.setTimeout=(fn,delay)=>{timers.set(++n,{fn,at:now+delay});return n;};w.clearTimeout=key=>timers.delete(key);
 Object.defineProperty(w.document,'hidden',{get:()=>hidden,configurable:true});w._dayoAuthUser={id:user};
 w.supabaseClient={auth:{getUser:async()=>({data:{user:{id:user}}})},rpc:async(name,args)=>{
  calls.push({name,args});if(name==='list_public_partner_profiles')return {data:[{id:'partner',nickname:'Alex',public_name_ready:true}]};
  assert.equal(name,'get_room_session_state','read-only canonical RPC only');
  if(options.rpc)return options.rpc(args);
  return {data:{success:true,booking_id:args.p_booking_id,session_ended:false}};
 },from(table){assert.equal(table,'bookings');queries.push({table,filters:[]});const entry=queries.at(-1);
  const q={select(v){entry.select=v;return q;},eq(k,v){entry.filters.push([k,v]);return q;},gte(k,v){entry.filters.push([k,v]);return q;},order(){return q;},
   then(resolve,reject){return Promise.resolve(options.queryError?{error:Error('fixture read')}:{data:options.rows||[booking]}).then(resolve,reject);}};return q;}};
 w.eval(read('public/i18n.js'));w.DayOI18n.setLang(lang,false);w.eval(exposed);await w.__timing.load();
 return {dom,w,queries,calls,booking,timers,set(time){now=time;},advance(time){while(true){const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>time)break;now=first[1].at;timers.delete(first[0]);first[1].fn();}now=time;},visibility(value){hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));}};
}
(async()=>{
 for(const name of ['mypage-dashboard.js','i18n.js'])assert.equal(read(name),read('public/'+name),'mirror '+name);
 const old=cp.execFileSync('git',['show','origin/main:public/mypage-dashboard.js'],{cwd:root,encoding:'utf8'}).replace(/\r/g,'');
 for(const [left,right] of [['  async function cancelUpcomingBooking(','  async function loadUrgentSessionBanner('],['  async function loadRecentTechIssueResults(','  window.enterStudio =']])
  assert.equal(source.slice(source.indexOf(left),source.indexOf(right)),old.slice(old.indexOf(left),old.indexOf(right)),'unchanged '+left);
 const parser=room.slice(room.indexOf('      function parseZonedInstant('),room.indexOf('      function parseSeoulSlotTime('));
 const early=room.match(/if \(!internalTest && (now < startAt - 5 \* 60 \* 1000)\)/)[1],late=room.match(/if \(!internalTest && (now >= startAt \+ 30 \* 60 \* 1000)\)/)[1];
 const roomGate=new Function('scheduled','now',parser+`const startAt=parseZonedInstant(scheduled);return Number.isFinite(startAt)&&!(${early})&&!(${late});`);
 for(const lang of ['KO','EN']){
  const f=await setup(lang),w=f.w,button=w.document.querySelector('#urgent-session-banner button[onclick="enterStudio()"]'),badge=w.document.getElementById('urgent-session-badge');
  for(const minutes of [30,10,6,5.01,5,1,0,-1,-29.99]){
   f.set(start-minutes*60000);const state=w.__timing.refresh();assert.equal(state.allowed,roomGate(f.booking.scheduled_at,w.Date.now()));assert.equal(button.disabled,!state.allowed);
   if(minutes>5)assert.equal(badge.textContent,lang==='KO'?Math.ceil(minutes)+'분 후 시작':'Starts in '+Math.ceil(minutes)+' min');
   if(minutes===5)assert.equal(badge.textContent,lang==='KO'?'입장 가능':'Ready to enter');
  }
  assert.equal(w.__timing.state({bookingId:id,scheduledAt:f.booking.scheduled_at},start+30*60000).allowed,false);
  assert.equal(w.__timing.state({bookingId:id,scheduledAt:'2026-10-07T08:30:00'},start-60000).allowed,false);
  assert.equal(w.__timing.state({bookingId:id,scheduledAt:'2026-10-07T08:30:00+09:00'},start-5*60000).allowed,true);
  assert.equal(w.__timing.state({bookingId:id,scheduledAt:f.booking.scheduled_at,internalTest:true},start-60*60000).allowed,true,'existing internal Room exception');
  const intervals=[
   [59,'59분 후 시작','Starts in 59 min'],[60,'1시간 후 시작','Starts in 1h'],
   [61,'1시간 1분 후 시작','Starts in 1h 1m'],[1439,'23시간 59분 후 시작','Starts in 23h 59m'],
   [1440,'1일 후 시작','Starts in 1d'],[1500,'1일 1시간 후 시작','Starts in 1d 1h'],
   [27000,'18일 18시간 후 시작','Starts in 18d 18h']];
  for(const [minutes,ko,en] of intervals){f.set(start-minutes*60000);w.__timing.refresh();assert.equal(badge.textContent,lang==='KO'?ko:en);assert(button.disabled);}
  f.set(start-10*60000);w.__timing.refresh();const before=f.queries.length;f.advance(start-5*60000);
  assert.equal(button.disabled,false);assert.equal(badge.textContent,lang==='KO'?'입장 가능':'Ready to enter');assert.equal(f.queries.length,before,'no DB polling');assert.equal(f.timers.size,1);
  f.visibility(true);assert.equal(f.timers.size,0);f.set(start-60000);f.visibility(false);assert.equal(button.disabled,false);
  f.advance(start+30*60000);await settle();assert.equal(button.disabled,true);assert.equal(w.document.getElementById('urgent-session-banner').hidden,true);
  assert.equal(w.__dayoUpcomingBookingId,'');assert.equal(f.queries.length,before+1,'one expiry-boundary read only');assert.equal(f.timers.size,0);
  f.set(start-60000);await w.__timing.load();w.dispatchEvent(new w.Event('focus'));assert.equal(button.disabled,false);
  const fresh=await setup(lang,start-60000);assert.equal(fresh.w.document.getElementById('urgent-session-badge').textContent,lang==='KO'?'입장 가능':'Ready to enter');fresh.dom.window.close();
  w.localStorage.setItem('dayo_next_session',JSON.stringify({partnerName:'Stale cache',bookingId:id,scheduledAt:f.booking.scheduled_at}));w.supabaseClient=null;
  await w.__timing.load();assert.equal(button.disabled,true);assert.equal(w.document.getElementById('urgent-session-banner').hidden,true,'cache is never upcoming evidence');
  f.dom.window.close();console.log('PASS '+lang+': compact durations, Room -5/+30 gate parity, timer/focus/visibility/reload, expiry removal, no polling/cache fallback');
 }
 // TEST is neither universally eligible nor universally excluded: time/status/ended evidence governs.
 const now=start-30*60000,validTest=row({id:'test-future',is_test_session:true}),validNormal=row({id:'normal-future',scheduled_at:'2026-10-07T00:30:00Z'});
 const excluded=[row({id:'past-test',is_test_session:true,scheduled_at:'2026-10-01T00:00:00Z'}),row({id:'ended',ended_at:'2026-10-06T23:00:00Z'}),row({id:'bad',scheduled_at:'bad'}),row({id:'unzoned',scheduled_at:'2026-10-07T08:30:00'}),row({id:'missing',scheduled_at:null}),row({id:'completed',status:'completed'}),row({id:'cancelled',status:'cancelled'}),row({id:'ended-event',is_test_session:true})];
 const f=await setup('KO',now,{rows:[validNormal,...excluded,validTest],rpc:async args=>({data:{success:true,booking_id:args.p_booking_id,session_ended:args.p_booking_id==='ended-event'}})});
 assert.equal(f.w.__dayoUpcomingBookingId,'test-future');assert.equal(f.w.document.querySelectorAll('#upcoming-booking-list>div').length,1);
 assert(f.queries[0].filters.some(([key,value])=>key==='learner_id'&&value===user));
 assert(!f.calls.some(call=>excluded.filter(r=>r.id!=='ended-event').some(r=>r.id===call.args?.p_booking_id)));
 f.dom.window.close();
 for(const data of [{success:true,booking_id:id,session_ended:true},{success:true,booking_id:'other',session_ended:false},{success:false},{success:true,booking_id:id},null]){
  const unknown=await setup('KO',now,{rpc:async()=>({data})});assert(unknown.w.document.getElementById('urgent-session-banner').hidden);unknown.dom.window.close();
 }
 const unavailable=await setup('KO',now,{queryError:true});assert(unavailable.w.document.getElementById('urgent-session-banner').hidden);unavailable.dom.window.close();
 const permission=await setup('KO',now,{rpc:async()=>({error:Error('not authorized')})});assert(permission.w.document.getElementById('urgent-session-banner').hidden);permission.dom.window.close();
 console.log('PASS selection: valid TEST/normal, expired/missing/unzoned/cancelled/completed/ended-event exclusion, unknown/RPC failure closed; no writes');
 const oldTZ=process.env.TZ;
 for(const zone of ['UTC','America/New_York','Asia/Seoul']){
  process.env.TZ=zone;const z=await setup('KO',Date.parse('2026-10-11T08:38:00Z'));
  assert.equal(z.w.__timing.format('2026-10-30T02:38:00Z'),'10월 30일 11:38');
  assert.equal(z.w.__timing.format('2026-10-30T11:38:00+09:00'),'10월 30일 11:38');
  z.set(Date.parse('2026-12-31T15:00:00Z'));assert.equal(z.w.__timing.format('2026-12-31T15:03:00Z'),'오늘 00:03');
  z.dom.window.close();
 }
 if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;
 console.log('PASS KST: UTC/New York/Seoul browser zones, midnight/year boundary, UTC/+09 same booked time');
 const shots=process.env.DAYO_TIMING_SCREENSHOTS;
 if(shots)fs.mkdirSync(shots,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [360,390,1280])for(const lang of ['KO','EN']){
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>console.log('Fixture page error:',e.message));await page.setContent(html);
  await page.addScriptTag({content:read('public/i18n.js')});await page.evaluate(lang=>DayOI18n.setLang(lang,false),lang);
  await page.evaluate(()=>{document.body.setAttribute('data-dayo-role','member');document.documentElement.classList.remove('dayo-auth-pending');});
  await page.addStyleTag({content:read('public/user-dashboard.css')});
  await page.addScriptTag({content:read('public/user-dashboard.js')});
  await page.addScriptTag({content:exposed});
  await page.evaluate(async({id,user})=>{
   const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-11T08:38:00Z']));}static now(){return RealDate.parse('2026-10-11T08:38:00Z');}};
   window._dayoAuthUser={id:user};document.body.setAttribute('data-dayo-role','member');
   const booking={id,scheduled_at:'2026-10-30T02:38:00Z',status:'confirmed',partner_user_id:'partner',is_test_session:true};
   window.supabaseClient={rpc:async(name,args)=>name==='get_room_session_state'?{data:{success:true,booking_id:args.p_booking_id,session_ended:false}}:{data:[{id:'partner',nickname:'Jen',public_name_ready:true}]},from(){const q={select(){return q;},eq(){return q;},gte(){return q;},order(){return q;},then(resolve){return Promise.resolve({data:[booking]}).then(resolve);}};return q;}};
   await __timing.load();
  },{id:'cec422d1-a06b-4c34-a8aa-a1a50452928e',user});
  const banner=page.locator('#urgent-session-banner');if(!(await banner.isVisible()))console.log(await banner.evaluate(el=>{const rows=[];while(el){rows.push({id:el.id,hidden:el.hidden,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility});el=el.parentElement;}return rows;}));assert(await banner.isVisible());
  assert.equal(await banner.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'card overflow '+width+' '+lang);
  assert.equal(await page.locator('#urgent-session-badge').innerText(),lang==='KO'?'18일 18시간 후 시작':'Starts in 18d 18h');
  assert((await page.locator('#urgent-session-title').innerText()).includes('11:38'));
  assert(await page.locator('#urgent-session-banner button[onclick="enterStudio()"] ').isDisabled());
  if(shots)await banner.screenshot({path:path.join(shots,'countdown-'+width+'-'+lang.toLowerCase()+'.png')});
  console.log('PASS UI '+lang+' '+width+'px: actual loader, compact label, KST title, correct disabled gate, no overflow');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
