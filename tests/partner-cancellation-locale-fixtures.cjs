// Local-only UI contract. No real login, booking, payment or database mutation.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));let checks=0;
function check(v,message){assert.ok(v,message);checks++;}
const raw=/\b(?:book|partner|cancel|checkout|mypage)\.[a-zA-Z_][\w.]*/;
function noKeys(node){check(!raw.test(node.textContent),'No raw i18n key in rendered UI');}
function partnerDefault(w){const src=read('public/partner.html'),start=src.indexOf('function initPartnerDashboard(');const contract=src.slice(start).match(/try \{[\s\S]*?\} catch \(e\) \{ \/\* keep the current locale \*\/ \}/);assert.ok(contract);w.eval(contract[0]);}
async function page(role='user',saved){
 const dom=new JSDOM('<!doctype html><html><head></head><body><div data-i18n-lang="inline" data-i18n-languages="KO,EN"></div><h1 data-i18n="page.title.mypage"></h1></body></html>',{url:'https://fixture.invalid',runScripts:'outside-only'});
 const w=dom.window;if(saved)w.localStorage.setItem('dayo_lang',saved);
 w.eval(read('public/i18n.js'));await tick();
 if(role==='partner')partnerDefault(w);
 return dom;
}
function toggle(w,lang){const btn=w.document.querySelector('.i18n-btn');assert.ok(btn);btn.click();const option=w.document.querySelector('.i18n-opt[data-lang="'+lang+'"]');assert.ok(option);option.click();check(w.DayOI18n.getLang()===lang,'Real header toggle switches locale');}
async function defaults(){
 for(const [role,saved,expected] of [['user',null,'KO'],['partner',null,'EN'],['user','EN','EN'],['partner','KO','KO']]){
  const dom=await page(role,saved),w=dom.window;check(w.DayOI18n.getLang()===expected,role+' default respects manual preference');
  if(!saved)check(w.localStorage.getItem('dayo_lang')===null,'Role default never persists over manual choice');
  const next=expected==='KO'?'EN':'KO';toggle(w,next);check(w.localStorage.getItem('dayo_lang')===next,'Manual selection uses existing dayo_lang storage');
  noKeys(w.document.body);w.close();const fresh=await page(role,next);check(fresh.window.DayOI18n.getLang()===next,'Refresh/relogin initialization restores saved preference');fresh.window.close();
 }
}
async function cancellation(){
 const dom=await page('partner'),w=dom.window;let reads=0,writes=0,enabled=true,fail=false,resolvePreview;
 const booking={id:'fixture-booking',scheduled_at:new Date(Date.now()+8*3600000).toISOString(),status:'confirmed',partner_user_id:'fixture-partner'};
 const stateBefore=JSON.stringify(booking);
 const data=()=>({booking_id:booking.id,scheduled_at:booking.scheduled_at,learner_nickname:'Fixture learner',remaining_seconds:8*3600,late_cancel:true,penalty_amount:6000,enabled});
 const client={rpc:async(name)=>{if(name!=='get_my_partner_cancellation_preview'){writes++;throw Error('unexpected write');}reads++;if(fail)throw Error('fixture');if(resolvePreview===null)return new Promise(r=>{resolvePreview=r});return {data:data()};}};
 w.eval(read('public/partner-booking-cancellation.js'));
 try{
  await w.DayOPartnerCancellation.open(booking,client);const doc=w.document,select=doc.querySelector('#pc-reason'),other=doc.querySelector('#pc-other'),submit=doc.querySelector('.pc-primary');
  check(doc.querySelector('#pc-title').textContent==='Cancel booking','Partner EN default cancellation UI');
  const keys=Array.from(select.options).map(o=>o.value);select.value='other';select.dispatchEvent(new w.Event('change'));other.value='Private fixture reason';other.focus();other.setSelectionRange(4,8);other.dispatchEvent(new w.Event('input'));
  const readBefore=reads;
  toggle(w,'KO');check(doc.querySelector('#pc-title').textContent==='예약 취소'&&submit.textContent==='예약 취소하기','Open modal title/CTA switches immediately to KO');
  check(select.options[1].textContent==='갑작스러운 일정 변경'&&doc.querySelector('.pc-notice').textContent.includes('향후 정상 대화 보상'),'KO reasons and late warning');
  check(select.value==='other'&&other.value==='Private fixture reason'&&other.selectionStart===4&&other.selectionEnd===8&&!submit.disabled,'Toggle preserves reason text, selection and validation');
  check(doc.querySelector('.pc-info p').textContent===new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(booking.scheduled_at))+' (KST)','KO date uses original instant and KST');
  noKeys(doc.querySelector('.pc-panel'));toggle(w,'EN');
  check(select.options[1].textContent==='Unexpected schedule change'&&doc.querySelector('.pc-notice').textContent.includes('future normal session rewards'),'EN reasons and warning');
  check(Array.from(select.options).map(o=>o.value).join('|')===keys.join('|'),'Canonical reason keys never change');
  check(reads===readBefore&&writes===0&&JSON.stringify(booking)===stateBefore,'Locale changes never fetch/mutate booking or role/session state');
  submit.click();await tick();check(submit.textContent==='Confirm cancellation','Existing confirmation stage');
  toggle(w,'KO');check(submit.textContent==='확인하고 취소하기'&&doc.querySelector('.pc-panel').textContent.includes('정말 이 예약을 취소할까요'),'Confirmation CTA/body translated without resetting stage');
  toggle(w,'EN');check(submit.textContent==='Confirm cancellation'&&doc.querySelector('#pc-reason').value==='other','Repeated toggle preserves confirmation/reason state');noKeys(doc.querySelector('.pc-panel'));w.DayOPartnerCancellation.close();
  enabled=false;await w.DayOPartnerCancellation.open(booking,client);toggle(w,'KO');check(doc.querySelector('.pc-panel').textContent.includes('정책 확정 전'),'Disabled policy translated');toggle(w,'EN');check(doc.querySelector('.pc-panel').textContent.includes('awaiting approval')&&doc.querySelector('.pc-primary').disabled,'Policy protection unaffected by language');w.DayOPartnerCancellation.close();
  enabled=true;fail=true;await w.DayOPartnerCancellation.open(booking,client);toggle(w,'KO');check(doc.querySelector('.pc-error').textContent.includes('아직 사용할 수 없습니다'),'Preview failure translates to KO');toggle(w,'EN');check(doc.querySelector('.pc-error').textContent.includes('not yet available'),'Existing error translates to EN');noKeys(doc.querySelector('.pc-panel'));w.DayOPartnerCancellation.close();
  fail=false;resolvePreview=null;const opening=w.DayOPartnerCancellation.open(booking,client);toggle(w,'KO');check(doc.querySelector('.pc-info').textContent==='예약 정보를 확인하고 있어요.','Loading copy switches before preview resolves');resolvePreview({data:data()});await opening;w.DayOPartnerCancellation.close();
  check(writes===0,'i18n fixture never cancels booking');
 }finally{w.DayOPartnerCancellation.close();w.close();}
}
async function bookingCopy(){
 const dom=await page('user'),w=dom.window;let writes=0;
 w.supabaseClient={from(){writes++;throw Error('unexpected booking write')}};w.DayOScrollLock={lock(){},unlock(){}};
 const source=read('public/availability-slots.js');w.eval(source.slice(0,source.indexOf('  function displayLocale()'))+'\n})();');
 try{
  const pending=w.DayOBookingWindow.confirmNoRefund();toggle(w,'EN');
  check(w.document.querySelector('#dayo-booking-window-title').textContent==='Please check the cancellation policy','User booking warning switches to EN while open');
  noKeys(w.document.querySelector('.dayo-booking-window-overlay'));toggle(w,'KO');
  check(w.document.querySelector('#dayo-booking-window-title').textContent==='예약 취소 규정을 확인해 주세요','User booking warning switches back to KO');
  w.document.querySelector('.dayo-booking-window-back').click();check(await pending===false&&writes===0,'Locale changes and back never confirm/create a booking');
 }finally{w.close();}
}
(async()=>{await defaults();await cancellation();await bookingCopy();for(const n of ['partner-booking-cancellation.js','availability-slots.js'])check(read(n)===read('public/'+n),'Root/public mirror '+n);console.log('PASS Partner cancellation locale: '+checks+' checks (role defaults, stored manual toggle, KO/EN modal and User booking warning; no production mutation).');})().catch(e=>{console.error(e);process.exitCode=1;});
