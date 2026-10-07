const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),model=require('../public/conversation-recap.js'),reportUI=require('../public/user-conversation-report.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,'public',f),'utf8');
const B='44444444-4444-4444-8444-444444444444',L='learner',P='partner';
const speech=['The crowded restaurant had delicious food.','We enjoyed a quiet café after our trip.','I find this neighborhood comfortable and friendly.'].map((text,i)=>({id:'u'+i,speaker:'learner',text,timestamp:'2026-10-05T05:01:00Z'}));
const log=(transcript,role)=>({id:role+'-source',booking_id:B,participant_id:role==='learner'?L:P,participant_role:role,transcript});
const recap=model.build({bookingId:B,learnerId:L,partnerId:P,language:'en',learnerLog:log(speech,'learner'),partnerLog:log([{...speech[0],speaker:'partner'}],'partner')});
assert.equal(recap.metrics.user_word_count,21);assert.equal(recap.metrics.user_utterance_count,3);
recap.progress={completed:1,total:3,reason:'skip'};
const report={booking_id:B,language:'en',partner_name:'Alex',feedback:[recap],partner_comment:''};
const room=read('room.html');
assert.match(room,/<button hidden[^>]*id="btn-save-talk-card"/,'recap has no manual save CTA');
for(const locale of ['ko','en']){
 const immediate=new JSDOM(model.render(recap,locale,{interactive:true,hideTitle:true}));
 const archived=new JSDOM(reportUI.renderDetail(report,locale));
 for(const selector of ['.recap-metrics','.recap-interpretation','.recap-section']){
  const text=d=>Array.from(d.window.document.querySelectorAll(selector),n=>n.textContent);
  assert.deepEqual(text(immediate),text(archived),'same model/renderer in room and My Page: '+selector);
 }
 const text=archived.window.document.body.textContent;
 assert(!text.includes('utterances'));assert(!/Quiz result|67%/.test(text));

 assert(!text.includes('%'),'partner participation ratio is not displayed');
 assert(text.includes(locale==='ko'?'21단어말했어요':'21 wordsspoken'));
 assert(!text.includes(locale==='ko'?'3번말했어요':'3 turnsspoken'));
 assert(text.includes(locale==='ko'?'내 대화량':'My conversation volume'));
 assert(!text.includes(locale==='ko'?'단어 넓히기':'Explore your words'));
 assert(text.includes(locale==='ko'?'파트너가 메시지를 준비 중이에요.':'Your partner is preparing a message.'));
 assert(text.includes('1/3'));assert(text.indexOf(model.labels(locale).title)<text.indexOf('Letter from Alex'));
 immediate.window.close();archived.window.close();
}
const partial=model.build({bookingId:B,learnerId:L,language:'en',learnerLog:log(speech,'learner')});
assert(model.render(partial,'ko').includes('이전 기록을 불러오지 못했어요.'));assert(!model.render(partial,'ko').includes('Partner 0%'));
const letter=room.slice(room.indexOf('  <div id="partner-report-popup"'),room.indexOf('<div id="early-exit-modal"'));
const dom=new JSDOM('<html><body>'+letter+'</body></html>',{runScripts:'outside-only',url:'https://fixture.invalid'}),w=dom.window;
w.DayOPartnerReportContract=require('../public/partner-report-contract.js');w.DayOI18n={getLang:()=> 'en'};
w.setTimeout=()=>1;w.clearTimeout=()=>{};
w.eval(read('partner-report.js'));w.DayOPartnerReport.open({language:'en',topic:'Food',transcript:[]});
assert.equal(w.document.getElementById('pr-title').textContent,'Partner Letter');
assert(Array.from(w.document.querySelectorAll('.pr-optional')).every(n=>n.tagName==='DETAILS'&&!n.open),'optional keepsake controls start collapsed');
const note=w.document.getElementById('popup-partner-comment');note.value='I loved hearing your stories. Next time, let’s talk about travel.';note.dispatchEvent(new w.Event('input'));
assert.equal(w.DayOPartnerReport.payload().partnerComment,note.value);
assert.deepEqual(JSON.parse(JSON.stringify(w.DayOPartnerReport.payload())),{partnerComment:note.value,stamp:null,keyword:null,illustUrl:null},'message-only Letter requires no optional fields');
// Unverified/manual image themes cannot create a new illustration.
w.document.getElementById('pr-custom-keyword').value='pottery';w.document.getElementById('pr-use-keyword').click();
const payload=w.DayOPartnerReport.payload();assert.equal(payload.illustUrl,null);
assert.deepEqual(Object.keys(payload).filter(k=>payload[k]!==undefined).sort(),['illustUrl','keyword','partnerComment','stamp']);
const recapBefore=JSON.stringify(recap),afterLetter=reportUI.renderDetail({...report,partner_comment:payload.partnerComment},'ko');
assert(afterLetter.includes('Next time'));assert.equal(JSON.stringify(recap),recapBefore,'letter rendering cannot mutate recap');
assert(afterLetter.includes('1/3'));dom.window.close();
for(const name of ['conversation-recap.js','conversation-recap.css','memory-game.js','session-lifecycle.js','room.html','mypage.html','user-conversation-report.js','partner-report.js'])assert.equal(read(name),fs.readFileSync(path.join(root,name),'utf8'),name+' mirror');
console.log('PASS unified room/My Page metrics, copy and progress; Partner Letter/pending, legacy payload, collapsed optional controls and mirrors');
