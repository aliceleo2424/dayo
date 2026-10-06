// Local DOM fixture: real Calendar RPC rows remain visible; existing eligibility stays authoritative.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
let checks=0;const check=(v,label)=>{assert.ok(v,label);checks++;};
(async()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://www.dayotalk.com/',runScripts:'outside-only'}),w=dom.window;
 try{
  const now=Date.parse('2026-10-06T00:00:00Z'),NativeDate=w.Date;
  w.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
  let bypass=false,rows=[],calls=[];
  w._dayoAuthUser={id:'fixture-user'};w.DayOPreopenBooking={canCreate:()=>true,isInternalTest:()=>false,canBypassLeadTime:()=>bypass};
  w.localStorage.setItem('dayo_ticket_count','1');
  w.eval(read('public/i18n.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.eval(read('public/availability-calendar.js'));
  w.DayOI18n.setLang('KO');w.__DAYO_SMART_BOOKING_TEST__={};
  const partner={id:'partner-1',nickname:'Fixture Partner',conversation_languages:['en'],korean_support_level:'fluent',conversation_preferences:null};
  w.supabaseClient={from(){return{}},rpc:async(name,args)=>{calls.push({name,args});if(name==='list_matching_partner_profiles')return{data:[partner],error:null};if(name==='get_booking_calendar_slots')return{data:rows,error:null};return{data:null,error:null};}};
  // Expose private UI functions only in this evaluated fixture, never in shipped source.
  const source=read('public/booking-modal.js').replace('stepOrder: STEP_ORDER.slice(),','fixture: {mount: mount, load: loadDateAvailability, calendar: refreshBookingCalendar}, stepOrder: STEP_ORDER.slice(),').replace("document.addEventListener('DOMContentLoaded', init);",'/* fixture mounts explicitly */');
  w.eval(source);const a=w.__DAYO_SMART_BOOKING_TEST__.api;a.fixture.mount();
  Object.assign(a.state,{step:1,language:'en',koreanHelp:'any',date:'2026-10-06',viewYear:2026,viewMonth:9});
  const slot=(id,time,status='available',partner_id=partner.id)=>({id,partner_id,slot_time:'2026-10-06T'+time+':00+09:00',status});
  rows=[slot('near','10:00'),slot('boundary','13:00'),slot('later','16:00'),slot('booked','11:00','booked'),slot('past','08:30'),slot('quarter','10:15'),slot(null,'10:30'),slot('outsider','11:30','available','other'),{id:'weekly',partner_id:partner.id,slot_time:'weekly:tue|10:00',status:'available'}];
  const visible=await a.fetchVisibleDateAvailability('2026-10-06',[partner.id]);
  assert.deepEqual(Array.from(visible,s=>s.id),['near','boundary','later']);checks++;
  const before=calls.length;check((await a.fetchVisibleDateAvailability('2026-11-05',[partner.id])).length===0&&calls.length===before,'outside 30-day window does not query');
  check(!a.isBookableStart(now+4*3600000-1)&&a.isBookableStart(now+4*3600000),'exact existing cutoff boundary');
  calls=[];const eligible=await a.fixture.load();
  assert.deepEqual(Array.from(eligible,s=>s.id),['boundary','later']);checks++;
  check(calls.filter(c=>c.name==='get_booking_calendar_slots').length===1,'one existing Calendar RPC per selected-date load');
  const chip=id=>w.document.querySelector('[data-group="time"][data-id="'+a.slotStartKey(slot(id,id==='near'?'10:00':'13:00').slot_time)+'"]');
  check(chip('near').disabled&&chip('near').getAttribute('aria-disabled')==='true','near slot visible and disabled');
  check(!chip('boundary').disabled,'4-hour boundary selectable');
  check(w.document.querySelector('.bk-slot-cutoff-note').textContent==='4시간 전까지 예약할 수 있어요.','Korean cutoff guidance');
  chip('near').click();check(a.state.timeKey===null&&!a.isStepReady(1),'disabled click cannot select or proceed');
  chip('boundary').click();check(a.isStepReady(1),'eligible click preserves existing time flow');
  check(a.partnersForTime(eligible,[partner],a.slotStartKey(slot('near','10:00').slot_time)).length===0,'near slot cannot preselect a partner');
  // Losing eligibility clears a prior selected time even though it stays visible.
  a.state.timeKey=a.slotStartKey(slot('near','10:00').slot_time);await a.fixture.load();check(a.state.timeKey===null&&!a.isStepReady(1),'restricted stale selection cleared');
  w.DayOI18n.setLang('EN');await a.fixture.load();check(w.document.querySelector('.bk-slot-cutoff-note').textContent==='Book at least 4 hours before the session.','English guidance, no raw key');
  bypass=true;const testEligible=await a.fixture.load();check(testEligible.some(s=>s.id==='near')&&!chip('near').disabled&&!w.document.querySelector('.bk-slot-cutoff-note'),'existing lead-time bypass remains eligible');
  chip('near').click();check(a.isStepReady(1),'test learner near slot selectable');
  bypass=false;rows=[slot('near','10:00')];await a.fixture.calendar();
  const day=d=>w.document.querySelector('[data-date="'+d+'"]');
  check(!day('2026-10-06').disabled,'date containing only cutoff-restricted real slots remains inspectable');
  check(day('2026-10-07').disabled,'no-slot date disabled');
  check(day('2026-10-09').getAttribute('aria-label').includes('Hangul'),'holiday label without auto-close');
  check(!day('2026-10-05')||day('2026-10-05').disabled,'past date disabled');
  rows=[slot('booked','11:00','booked')];await a.fixture.load();check(w.document.querySelectorAll('[data-group=time]').length===0,'booked-only date supplies no fabricated slot');
  w.supabaseClient.rpc=async()=>({data:null,error:{code:'42501',message:'denied'}});
  await assert.rejects(a.fetchVisibleDateAvailability('2026-10-06',[partner.id]),e=>e.code==='42501');checks++;
  check(!w.document.body.textContent.match(/\b(?:book|partner|cancel)\.[A-Za-z]/),'no raw i18n key in modal');
  check(read('public/booking-modal.js')===read('booking-modal.js'),'root/public mirror');
  console.log('PASS cutoff visibility:',checks,'checks; actual rows only, unchanged eligibility/bypass, disabled click, selection reset, KST window, KO/EN, no raw keys.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
