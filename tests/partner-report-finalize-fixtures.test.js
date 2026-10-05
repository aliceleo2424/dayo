const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const room=fs.readFileSync('public/room.html','utf8');
const start=room.indexOf('function setPartnerReportSubmitStatus('),end=room.indexOf('function setPartnerReportSubmitBusy(',start);
let status={style:{}};let w={};const context={window:w,document:{getElementById:()=>status}};vm.createContext(context);vm.runInContext(room.slice(start,end),context);
context.setPartnerReportSubmitStatus('room.partnerReport.success',true);assert.equal(status.textContent,'Report submitted successfully!');
w.DayOI18n={t:()=> '리포트 전송 완료'};context.setPartnerReportSubmitStatus('room.partnerReport.success',true);assert.equal(status.textContent,'리포트 전송 완료');
w.DayOI18n={t:k=>k};for(const key of ['success','saving','preview','invalidBooking','rewardUnavailable','unknown']){context.setPartnerReportSubmitStatus('room.partnerReport.'+key,false);assert.doesNotMatch(status.textContent,/room\.partnerReport\./);}
const ui=fs.readFileSync('public/partner-report.js','utf8');assert.match(ui,/context\.topic\|\|\(context\.talkCard&&context\.talkCard\.topic\)/);
assert.doesNotMatch(ui.slice(ui.indexOf('function noteTopic'),ui.indexOf('function chooseKeyword')),/selectedKeyword/);
assert.doesNotMatch(ui.slice(ui.indexOf('function chooseKeyword'),ui.indexOf('function paintSuggestions')),/syncTopicTemplate/);
console.log('PASS: session/card-only Today’s topic, no Step 3 dependency; actual i18n reused, missing translation fallbacks never expose raw keys.');
