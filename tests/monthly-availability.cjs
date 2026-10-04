const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),rules=require('../public/availability-calendar.js');
assert.deepEqual(rules.windowDates(Date.parse('2026-10-03T15:00:00Z')),{start:'2026-10-04',end:'2026-11-02'});
assert(rules.inWindow('2026-11-02',Date.parse('2026-10-04T01:00Z')));assert(!rules.inWindow('2026-11-03',Date.parse('2026-10-04T01:00Z')));
assert.deepEqual(rules.windowDates(Date.parse('2026-12-31T15:00Z')),{start:'2027-01-01',end:'2027-01-30'});
assert.equal((Date.parse(rules.windowDates(Date.parse('2026-10-04T01:00Z')).end)-Date.parse('2026-10-04'))/86400000+1,30);
assert.deepEqual(rules.holidaySupportedYears,[2026,2027]);assert.equal(rules.holiday('2028-01-01',false),'');assert(rules.inWindow('2028-01-01',Date.parse('2028-01-01T01:00Z')));
assert.equal(rules.times.length,30);assert.equal(rules.times[0],'08:30');assert.equal(rules.times.at(-1),'23:00');
assert.equal(rules.holiday('2026-10-09',false),'Hangul Day');assert.equal(rules.holiday('2026-10-05',true),'대체공휴일');assert.equal(rules.holiday('2026-09-28',false),'','no inferred Chuseok substitute');
assert.equal(rules.holiday('2027-02-09',false),'Substitute holiday');assert.equal(rules.holiday('2027-09-15',false),'Chuseok');assert.equal(rules.holidayCoverage.end,'2027-12-31');
assert.equal(rules.slotMs('2026-10-09T10:00:00'),Date.parse('2026-10-09T01:00:00Z'));assert(Number.isNaN(rules.slotMs('weekly:mon|10:00')));
const setupWindow={DayOAvailabilityCalendar:rules};vm.runInNewContext(fs.readFileSync(path.join(root,'public/partner-dashboard.js'),'utf8'),{window:setupWindow,document:{readyState:'loading',addEventListener(){}},Date});
assert(!setupWindow.DayOPartnerSetup.hasFutureSlot([{status:'available',slot_time:'2026-11-03T10:00:00+09:00'}],Date.parse('2026-10-04T01:00Z')),'outside-window slots do not suppress the Sessions alert');
const booking=fs.readFileSync(path.join(root,'public/booking-modal.js'),'utf8'),slots=fs.readFileSync(path.join(root,'public/availability-slots.js'),'utf8');
// Reproduce authprofile -> repeated authchange while the RPC is pending or
// loaded. The old unconditional reset discarded valid responses for this owner.
const monthlyUI=fs.readFileSync(path.join(root,'public/partner-monthly-availability.js'),'utf8');
const authStart=monthlyUI.indexOf("document.addEventListener('dayo:authchange'");
const authEnd=monthlyUI.indexOf("document.addEventListener('dayo:authprofile'",authStart);
let onAuthChange;
const authState={owner:'partner-a',clears:0,document:{addEventListener(name,handler){onAuthChange=handler;}}};
authState.clearOwner=()=>{authState.clears++;authState.owner=null;};
vm.runInNewContext(monthlyUI.slice(authStart,authEnd),authState);
for(const event of ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'])onAuthChange({detail:{loggedIn:true,userId:'partner-a',event}});
assert.equal(authState.clears,0,'same partner keeps pending/loaded schedule on repeated auth events');
onAuthChange({detail:{loggedIn:true,userId:'partner-b'}});assert.equal(authState.clears,1,'different account invalidates previous schedule');
authState.owner='partner-b';onAuthChange({detail:{loggedIn:false,userId:'partner-b'}});assert.equal(authState.clears,2,'sign-out invalidates schedule');
// Fixed integration base keeps core preservation checks meaningful after commit.
const integrationBase='a58b7a0e7df5c028814b1783884c6746fa421cce';
const baseline=cp.execFileSync('git',['show',integrationBase+':public/booking-modal.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
function fn(source,name){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert(start>=0,name);return source.slice(start,source.indexOf('\n  }',start)+4).replace(/\r\n/g,'\n');}
for(const name of ['loadDateAvailability','derivePartnersForSelectedTime','partnerMatchesCriteria','isBookableStart','canBypassBookingLeadTime','getTicketCount','needsTicketTopup','settleConfirmedBooking','readRecentBooking'])assert.equal(fn(booking,name),fn(baseline,name),name+' protected kernel');
assert(!booking.includes('<small class="bk-holiday">'));assert(booking.includes('bk-selected-date'));
const oldSlots=cp.execFileSync('git',['show',integrationBase+':public/availability-slots.js'],{cwd:root,encoding:'utf8'});
for(const name of ['openPartnerBookingPrep','getPartnerBookingBrief','closePartnerBookingPrep','isBookableStart','confirmBookingWindow'])assert.equal(fn(slots,name),fn(oldSlots,name),name+' timing/brief unchanged');
assert(slots.includes('main.addEventListener(\'click\', openPrep)'),'name row retains existing brief handler');
for(const file of ['room.html','public/room.html','room-live.js','public/room-live.js','session-lifecycle.js','public/session-lifecycle.js','api/booking-notifications.js']){
 if(!fs.existsSync(path.join(root,file)))continue;
 assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),cp.execFileSync('git',['show',integrationBase+':'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),file+' unchanged');
}
const clientSource=fs.readFileSync(path.join(root,'public/supabase-client.js'),'utf8').replace(/\r\n/g,'\n');
const clientBase=cp.execFileSync('git',['show',integrationBase+':public/supabase-client.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
assert.equal(clientSource.slice(0,clientSource.indexOf('  function welcomeEmailSentKey')),clientBase.slice(0,clientBase.indexOf('  function welcomeEmailSentKey')),'SDK initialization/query builder unchanged; only audited Security helpers differ');
const hook={},win={DayOAvailabilityCalendar:rules,__DAYO_SMART_BOOKING_TEST__:hook};vm.runInNewContext(booking,{window:win,document:{readyState:'loading',addEventListener(){}},Date,console,setTimeout,clearTimeout});
(async()=>{
 const w=rules.windowDates(),future=rules.addDays(w.start,2)+'T18:00:00+09:00';
 const actual={id:'concrete-1',partner_id:'partner-1',slot_time:future,status:'available'};
 const calls=[];win.supabaseClient={from(){},rpc:async(name,args)=>{calls.push([name,args]);return{data:[actual],error:null}}};
 const rows=await hook.api.fetchDateAvailability(future.slice(0,10),['partner-1']);assert.equal(rows.length,1);assert.equal(rows[0].id,'concrete-1');
 assert.equal(calls[0][0],'get_booking_calendar_slots');assert.equal((await hook.api.fetchDateAvailability(rules.addDays(w.end,1),['partner-1'])).length,0);
 win.supabaseClient={from(){},rpc:async()=>({error:{code:'42501',message:'denied'}})};await assert.rejects(hook.api.loadCalendarSlots(['partner-1']),e=>e.code==='42501','access failure must not fall back');
 let queryCalls=[];const query={select(){return this},eq(){return this},in(){return this},gte(k,v){queryCalls.push(['gte',v]);return this},lt(k,v){queryCalls.push(['lt',v]);return this},order(){return this},range(){return Promise.resolve({data:[actual],error:null})}};
 win.supabaseClient={rpc:async()=>({error:{code:'PGRST202'}}),from:()=>query};assert.equal((await hook.api.loadCalendarSlots(['partner-1']))[0].id,'concrete-1');assert.equal(queryCalls[0][1],w.start);assert.equal(queryCalls[1][1],rules.addDays(w.end,1));
 for(const name of ['availability-calendar.js','availability-calendar.css','partner-monthly-availability.js','availability-slots.js','booking-modal.js','partner-dashboard.js','index.html','mypage.html','partner.html'])assert.deepEqual(fs.readFileSync(path.join(root,'public',name)),fs.readFileSync(path.join(root,name)),name+' mirror');
 console.log('PASS monthly calendar: KST boundaries, real IDs, auth failure closed, missing-RPC fallback, half hours, holiday labels, protected booking/room/ticket/notification kernels and mirrors.');
})().catch(e=>{console.error(e);process.exitCode=1});
