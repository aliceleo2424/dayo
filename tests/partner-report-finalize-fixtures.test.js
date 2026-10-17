const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const room=fs.readFileSync('public/room.html','utf8');
const start=room.indexOf('function setPartnerReportSubmitStatus('),end=room.indexOf('function setPartnerReportSubmitBusy(',start);
let status={style:{}};let w={};const localStorage={getItem:()=>null};
const context={window:w,localStorage,document:{getElementById:()=>status}};vm.createContext(context);vm.runInContext(room.slice(start,end),context);
// The current confirmed Letter contract uses stable local status codes, not retired i18n keys.
context.setPartnerReportSubmitStatus('sent',true);assert.equal(status.textContent,'Letter sent.');
assert.equal(status.hidden,false);
w.DayOI18n={getLang:()=> 'KO'};localStorage.getItem=()=> 'KO';
context.setPartnerReportSubmitStatus('sent',true);assert.equal(status.textContent,'레터를 보냈어요.');
context.setPartnerReportSubmitStatus('letter_save_failed',false);assert.match(status.textContent,/레터를 보내지 못했습니다/);assert.equal(status.style.color,'#BE123C');
localStorage.getItem=()=> 'EN';w.DayOI18n={getLang:()=> 'EN'};
for(const key of ['checking','sending','preview','invalid_booking','reward_status_unavailable','status_check_failed','room.partnerReport.success']){
 context.setPartnerReportSubmitStatus(key,false);assert.ok(status.textContent);assert.doesNotMatch(status.textContent,/room\.partnerReport\./);
}
const ui=fs.readFileSync('public/partner-report.js','utf8');assert.match(ui,/context\.topic\|\|\(context\.talkCard&&context\.talkCard\.topic\)/);
assert.doesNotMatch(ui.slice(ui.indexOf('function noteTopic'),ui.indexOf('function chooseKeyword')),/selectedKeyword/);
assert.doesNotMatch(ui.slice(ui.indexOf('function chooseKeyword'),ui.indexOf('function paintSuggestions')),/syncTopicTemplate/);
console.log('PASS: session/card-only Today’s topic, no Step 3 dependency; current Letter status-code mapping, KO/EN choice and missing translation fallbacks never expose raw keys.');
