const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),window={};
vm.runInNewContext(fs.readFileSync(path.join(root,'public/partner-dashboard.js'),'utf8'),{window,document:{readyState:'loading',addEventListener(){}}});
window.DayOPartnerAvatars=require('../public/partner-avatar-options.js');
const api=window.DayOPartnerSetup;
const profile={completed_at:'2026-10-03',partner_guide_acknowledged_at:'2026-10-03',location_status:'overseas',visa_type:'not_applicable_overseas',korean_level:'basic',weekly_session_capacity:'3-5',native_languages:['English'],session_languages:['English']};
const identity={avatar_url:'/images/partner-avatars/dayo-avatar-01.png',bio:'A warm conversation.'};
const count=(details,p,slots)=>api.checklist(details,p,slots).filter(x=>x.complete===true).length;
assert.equal(count(null,{},false),0);
assert.equal(count(null,{bio:'Hi'},false),1);
assert.equal(count(null,identity,false),2);
assert.equal(count({...profile,completed_at:null},identity,false),3);
assert.equal(count(profile,identity,false),4);
assert.equal(count(profile,identity,true),5);
assert.equal(count(profile,{...identity,avatar_url:'https://api.dicebear.com/7.x/bottts/svg?seed=test'},true),4);
assert.equal(count(profile,{...identity,bio:'  '},true),4);
assert.equal(api.checklist({...profile,native_languages:[]},identity,true)[0].complete,false);
assert.equal(api.checklist({...profile,partner_guide_acknowledged_at:null},identity,true)[3].complete,false);
assert.equal(api.checklist({...profile,partner_guide_acknowledged_at:null},identity,true)[0].complete,false,'reuse existing completion criterion');
assert.equal(api.checklist(undefined,undefined,null).filter(x=>x.complete===null).length,5);
assert.equal(count(profile,{...identity,avatar_url:'https://example.com/own-photo.png'},true),5);
const now=Date.parse('2026-10-04T00:00:00Z');
assert(api.hasFutureSlot([{status:'available',slot_time:'2026-10-04 09:30:00'}],now),'unzoned slots are KST');
assert(!api.hasFutureSlot([{status:'available',slot_time:'2026-10-04 08:30:00'},{status:'booked',slot_time:'2026-10-06T10:00:00+09:00'},{status:'available',slot_time:'weekly:mon|10:00'},{status:'available',slot_time:'invalid'}],now));
assert(api.hasFutureSlot([{status:'available',slot_time:'2026-10-05T10:00:00+09'}],now));
const ui=fs.readFileSync(path.join(root,'public/partner-dashboard.js'),'utf8');
assert(ui.includes("filter(function(x){return x.id!=='availability';})"),'availability is separate from one-time setup');
assert(ui.includes('actionCenter.hidden=done===4'),'four completed setup tasks hide Action Center');
assert(ui.includes('availabilityAlert.hidden=openSlots!==false'),'only confirmed zero slots shows operational alert');
assert(ui.includes('tabsHost.after(actionCenter)'),'setup sits below the tab content');
assert(ui.includes("[past,updates]"),'Sessions shows history/updates rather than earnings count');
assert(ui.includes("[completed,promos,reliability,convert]"),'month count moves to Earnings');
for(const name of ['partner-dashboard.js','partner-dashboard.css'])assert.deepEqual(fs.readFileSync(path.join(root,'public',name)),fs.readFileSync(path.join(root,name)));
for(const name of ['availability-slots.js','public/availability-slots.js','room.html','public/room.html','room-live.js','public/room-live.js','session-lifecycle.js','public/session-lifecycle.js','public/profile-store.js']){
 if(!fs.existsSync(path.join(root,name)))continue;
 let actual=fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n');
 if(name==='public/profile-store.js'){
   // This integration explicitly includes the audited Security Work helper.
   // Preserve an exact whole-file check, rather than weakening it to patterns.
   // Hash verified against the original, untouched profiles-security worktree.
   assert.equal(require('node:crypto').createHash('sha256').update(actual).digest('hex'),
     '4353643e65ab191d0fed00c8b19016e690ccd781ec3b3564b34e1142571bb6a1',
     'audited Security profile helper must remain byte-for-byte unchanged');
   continue;
 }
 if(name.endsWith('availability-slots.js')){
   // New scope permits ONLY the 084 RPC adapter, name aria label and 30-day UI guard.
   // After accounting for those additions, every byte of the old fallback remains checked.
   const start=actual.indexOf('      // 084 provides atomic weekly saves'),end=actual.indexOf('      var slotsToInsert = buildRows(user.id, openSlots);',start);
   assert(start>=0&&end>start);assert(actual.slice(start,end).includes("supabase.rpc('save_partner_weekly_template'"));
   actual=actual.slice(0,start)+actual.slice(end);
   actual=actual.replace("      main.setAttribute('aria-label', 'View conversation brief');\n",'');
   actual=actual.replace("      if(window.DayOAvailabilityCalendar&&!window.DayOAvailabilityCalendar.inWindow(window.DayOAvailabilityCalendar.dateAt(bookingSlotStartMs(raw))))return false;\n",'');
 }
 assert.equal(actual,cp.execFileSync('git',['show','a58b7a0e7df5c028814b1783884c6746fa421cce:'+name],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),name+' protected fallback remains unchanged');
}
console.log('PASS: checklist 0–5, robot/initial vs real image, saved intro, separate guide, unknown state, actual dated/KST slots; mirrors; availability/room/reward source unchanged.');
