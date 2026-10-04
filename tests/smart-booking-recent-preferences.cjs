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
assert.equal(snapshot.brief.chat_request,'praise');
assert.equal(snapshot.brief.partner_preference,null,'no unsupported encourage enum in 062 payload');
assert.deepEqual(plain(snapshot.brief.interests),['movies']);
api.state.interests.push('music');
assert.deepEqual(plain(snapshot.brief.interests),['movies'],'snapshot array does not follow later edits');
assert.equal(JSON.stringify(previous),original,'previous server row is never mutated');
Object.assign(api.state,{language:'ko',koreanHelp:null});
assert.equal(api.isStepReady(0),true,'KO requires no Korean help choice');
assert.equal(api.preferenceSnapshot().koreanSupport,null,'KO does not fabricate any');
const baseline=execFileSync('git',['show','HEAD:public/booking-modal.js'],{cwd:root,encoding:'utf8'});
for(const name of ['fetchDateAvailability','loadDateAvailability','loadAvailablePartners','derivePartnersForSelectedTime','partnerMatchesCriteria','isInternalBookingTest','canBypassBookingLeadTime','isBookableStart','requiresNoRefundWarning','bookingSlotStartMs','isFutureThirtyMinuteConcreteSlot','getTicketCount','needsTicketTopup','ensureLoggedInForBooking','requestOpen','routeToTicketTopup','persistLearningLanguage']) {
  const rx=new RegExp('(?:async )?function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}');
  assert.ok(source.match(rx),name);
  assert.equal(source.match(rx)[0].replace(/\r\n/g,'\n'),baseline.match(rx)[0],name+' unchanged');
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
    {id:'pending',learner_id:'user-a',status:'pending',created_at:'2099'},
    {id:'other',learner_id:'user-b',status:'confirmed',created_at:'2098'},
    {id:'older',learner_id:'user-a',status:'confirmed',created_at:'2025'},
    {id:'newest',learner_id:'user-a',status:'completed',created_at:'2026'}
  ];
  let uid,statuses;
  const query={
    select(v){calls.push(['select',v]);return this},eq(k,v){calls.push(['eq',k,v]);uid=v;return this},
    in(k,v){calls.push(['in',k,plain(v)]);statuses=v;return this},order(k,v){calls.push(['order',k,plain(v)]);return this},
    limit(n){calls.push(['limit',n]);return Promise.resolve({data:rows.filter(r=>r.learner_id===uid&&statuses.includes(r.status)).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,n),error:null})}
  };
  const recent=await api.readRecentBooking({from(table){assert.equal(table,'bookings');return query}},'user-a');
  assert.equal(recent.id,'newest','only own successful bookings, newest submission first');
  assert.deepEqual(calls[1],['eq','learner_id','user-a']);
  assert.deepEqual(calls[2],['in','status',['confirmed','completed']]);
  await assert.rejects(api.readRecentBooking({from(){return {...query,limit(){return Promise.resolve({error:new Error('RLS fixture')})}}}},'user-a'),/RLS/);
  assert.equal(source,fs.readFileSync(path.join(root,'booking-modal.js'),'utf8'),'public/root synchronized');
  console.log('PASS: recent source isolation, unknown fields, canonical/legacy mapping, copied snapshots, KO, unchanged slot queries/timing, mirrors.');
})().catch(e=>{console.error(e);process.exitCode=1});
