const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'public/booking-modal.js'),'utf8');
const hook = {};
vm.runInNewContext(source, {
  window:{__DAYO_SMART_BOOKING_TEST__:hook},
  document:{readyState:'loading',addEventListener(){}}, console, Date, setTimeout, clearTimeout
});
const api=hook.api, plain=v=>JSON.parse(JSON.stringify(v));
assert.deepEqual(plain(api.stepOrder), [0,3,1,2,4], 'language/settings/time/partner/confirmation');
const previous = {id:'old',language:'en',conversation_brief:{purposes:['travel'],interests:['music','travel'],chat_request:'praise'}};
const original = JSON.stringify(previous);
const prefs=api.preferencesFromBooking(previous);
assert.equal(prefs.koreanHelp,null,'missing is unknown, never any');
assert.equal(prefs.style,'encourage','legacy praise mapped at read boundary');
assert.equal(prefs.chatStyle,null,'missing comfort remains empty');
assert.equal(api.preferencesFromBooking({id:'empty',language:'en'}).style,null);
assert.equal(api.preferencesFromBooking(previous,{bookingId:'someone-else',koreanSupport:'any'}).koreanHelp,null);
assert.equal(api.preferencesFromBooking(previous,{bookingId:'old',koreanSupport:'required'}).koreanHelp,'needed');
assert.equal(api.canonicalStyle({partner_preference:'slow',chat_request:'praise'}),'slow');
assert.equal(api.canonicalStyle({partner_preference:'korean',chat_request:'praise'}),null,'capability never masquerades as style');
const v1 = {id:'v1',language:'en',conversation_brief:{schema_version:1,korean_support_preference:'any',conversation_style:'correct',purposes:['casual'],interests:['games']}};
assert.equal(api.preferencesFromBooking(v1).style,'correct');
assert.equal(api.preferencesFromBooking(v1).koreanHelp,'any');
Object.assign(api.state, plain(prefs), {koreanHelp:'needed',style:'encourage',purposes:['casual'],interests:['movies']});
const snapshot=api.preferenceSnapshot();
assert.equal(snapshot.koreanSupport,'required');
assert.equal(snapshot.conversationStyle,'encourage');
assert.equal(snapshot.brief.schema_version,1);
assert.equal(snapshot.brief.conversation_style,'encourage');
assert.equal(snapshot.brief.korean_support_preference,'required');
assert.equal(snapshot.brief.chat_request,undefined);
assert.equal(snapshot.brief.partner_preference,undefined);
assert.deepEqual(plain(snapshot.brief.interests),['movies']);
api.state.interests.push('music');
assert.deepEqual(plain(snapshot.brief.interests),['movies'],'snapshot array does not follow later edits');
assert.equal(JSON.stringify(previous),original,'previous server row is never mutated');
const reuseBase={language:'en',koreanHelp:'needed',purposes:['travel'],interests:['music'],style:'slow'};
for(const help of ['needed','any',null,'invalid']) {
  const input={...reuseBase,koreanHelp:help};
  const resolved=api.resolveRecentPreferences(input);
  Object.assign(api.state,resolved);
  assert.deepEqual(plain(api.recentRequiredFields()),[],'valid required fields enable reuse');
  assert.equal(resolved.koreanHelp,help==='needed'?'needed':'any');
  assert.equal(input.koreanHelp,help,'original settings are not mutated');
  const payload=api.preferenceSnapshot();
  assert.equal(payload.brief.korean_support_preference,help==='needed'?'required':'any');
  assert.equal(payload.brief.conversation_style,'slow');
  assert.deepEqual(plain(payload.brief.purposes),['travel']);
  assert.deepEqual(plain(payload.brief.interests),['music']);
}
Object.assign(api.state,api.resolveRecentPreferences({...reuseBase,koreanHelp:null,interests:[],chatStyle:null,chatRequest:null}));
assert.deepEqual(plain(api.recentRequiredFields()),[],'optional interests/legacy preferences never block reuse');
assert.deepEqual(plain(api.preferenceSnapshot().brief.interests),[]);
Object.assign(api.state,{language:null});
assert.deepEqual(plain(api.recentRequiredFields()),['book.summaryLanguage'],'required language is specifically identified');
Object.assign(api.state,{...reuseBase,purposes:[],style:null});
assert.deepEqual(plain(api.recentRequiredFields()),['book.summaryPurpose','book.summaryStyle'],'existing v1 server-required purpose/style remain required');
assert.match(source,/var prefs = resolveRecentPreferences\(preferencesFromBooking\(booking, supplement\)\)/,'recent load resolves only new booking defaults');
assert.match(source,/recentSummary \? recentRequiredFields\(\)\.length > 0/,'button uses required fields only');
assert.match(source,/if \(recentRequiredFields\(\)\.length\) return;/,'click guard matches button readiness');
Object.assign(api.state,{language:'ko',koreanHelp:null});
assert.equal(api.isStepReady(0),true,'KO requires no Korean help choice');
assert.equal(api.preferenceSnapshot().koreanSupport,'any','KO skips the help question and explicitly stores unrestricted support');
const baseline=execFileSync('git',['show','HEAD:public/booking-modal.js'],{cwd:root,encoding:'utf8'});
// Alpha eligibility is exercised in alpha-partner-eligibility.cjs. All other kernels stay protected.
for(const name of ['fetchDateAvailability','isInternalBookingTest','canBypassBookingLeadTime','isBookableStart','requiresNoRefundWarning','bookingSlotStartMs','isFutureThirtyMinuteConcreteSlot','getTicketCount','needsTicketTopup','ensureLoggedInForBooking','requestOpen','routeToTicketTopup','persistLearningLanguage']) {
  const rx=new RegExp('(?:async )?function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}');
  assert.ok(source.match(rx),name);
  const actualFunction=source.match(rx)[0].replace(/\r\n/g,'\n'),oldFunction=baseline.match(rx)[0];
  if(name==='fetchDateAvailability'){
    // 084 intentionally adds a monthly RPC adapter before the intact legacy query.
    assert(actualFunction.includes('loadCalendarSlots(eligiblePartnerIds)'));
    const queryStart='    var supabase = dbClient();';
    assert.equal(actualFunction.slice(actualFunction.indexOf(queryStart)),oldFunction.slice(oldFunction.indexOf(queryStart)),'legacy query and failure behavior unchanged');
  }else assert.equal(actualFunction,oldFunction,name+' unchanged');
}
assert.doesNotMatch(source,/id="bkComfort"|id="bkChatStyles"|id="bkChatRequests"|id="bkFirstTip"/,'no comfort option UI');
assert.match(source,/code: id\.toUpperCase\(\)/,'canonical language codes');
assert.match(source,/state\.interests\.slice\(0, 3\)/,'compact interests +N');
assert.match(source,/\.bk-chip\.is-on\{background:var\(--bk-selected\)/,'selected chips stay secondary to the primary CTA');
assert.match(source,/\.bk-btn--primary\{background:var\(--bk-primary\)/);
for (const [start,end] of [['    var partnerId = state.partner;', '    var bookingId = null;'],['    var deducted = false;', '    try {\n      if (bookingId) localStorage']]) {
  const normalized=source.replace(/\r\n/g,'\n');
  const oldPart=baseline.slice(baseline.indexOf(start),baseline.indexOf(end,baseline.indexOf(start)));
  const newPart=normalized.slice(normalized.indexOf(start),normalized.indexOf(end,normalized.indexOf(start)));
  // The success-only session supplement is outside confirmation/deduction guards.
  const guardEnd='    if (!deducted) return;';
  assert.equal(start.includes('deducted') ? newPart.slice(0,newPart.indexOf(guardEnd)+guardEnd.length) : newPart,
    start.includes('deducted') ? oldPart.slice(0,oldPart.indexOf(guardEnd)+guardEnd.length) : oldPart,
    'slot/cutoff revalidation and confirmation RPC guards unchanged');
}
(async()=>{
  const calls=[],rows=[
    {id:'test',learner_id:'user-a',is_test_session:true,status:'confirmed',created_at:'2100'},
    {id:'pending',learner_id:'user-a',status:'pending',created_at:'2099'},
    {id:'other',learner_id:'user-b',status:'confirmed',created_at:'2098'},
    {id:'older',learner_id:'user-a',status:'confirmed',created_at:'2025'},
    {id:'newest',learner_id:'user-a',status:'completed',created_at:'2026'}
  ];
  let uid,statuses,testFlag;
  const query={
    select(v){calls.push(['select',v]);return this},eq(k,v){calls.push(['eq',k,v]);if(k==='learner_id')uid=v;else if(k==='is_test_session')testFlag=v;return this},
    in(k,v){calls.push(['in',k,plain(v)]);statuses=v;return this},order(k,v){calls.push(['order',k,plain(v)]);return this},
    limit(n){calls.push(['limit',n]);return Promise.resolve({data:rows.filter(r=>r.learner_id===uid&&(r.is_test_session===true?true:false)===testFlag&&statuses.includes(r.status)).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,n),error:null})}
  };
  const recent=await api.readRecentBooking({from(table){assert.equal(table,'bookings');return query}},'user-a');
  assert.equal(recent.id,'newest','only own successful bookings, newest submission first');
  assert.deepEqual(calls[1],['eq','learner_id','user-a']);
  assert.deepEqual(calls[2],['eq','is_test_session',false]);
  assert.deepEqual(calls[3],['in','status',['confirmed','completed']]);
  await assert.rejects(api.readRecentBooking({from(){return {...query,limit(){return Promise.resolve({error:new Error('RLS fixture')})}}}},'user-a'),/RLS/);
  assert.equal(source,fs.readFileSync(path.join(root,'booking-modal.js'),'utf8'),'public/root synchronized');
  console.log('PASS: recent source isolation, unknown fields, canonical/legacy mapping, copied snapshots, KO, unchanged slot queries/timing, mirrors.');
})().catch(e=>{console.error(e);process.exitCode=1});
