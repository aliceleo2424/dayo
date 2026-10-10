const fs=require('fs'),assert=require('node:assert/strict'),vm=require('vm'),cp=require('child_process'),{JSDOM}=require('jsdom');
const model=require('../public/conversation-recap.js'),learner=require('../public/learner-expressions.js'),ui=require('../public/user-conversation-report.js');
const B='44444444-4444-4444-8444-444444444444',L='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const speech=require('./fixtures/recap-hotfix-speech.json');
const log=(role,id,list)=>({id:role+'-source',booking_id:B,participant_id:id,participant_role:role,transcript:list.map((text,i)=>({id:role+'-'+i,text,speaker:role,timestamp:new Date(Date.parse('2026-10-07T05:00:00Z')+i*1000).toISOString()}))});
const build=(a,b)=>model.build({bookingId:B,learnerId:L,partnerId:P,language:'en',learnerLog:log('learner',L,a),partnerLog:b?log('partner',P,b):null});
const short=['I went to a cafe and it was so crowded.','The cafe had delicious coffee and a quiet corner.','My favorite cafe is quiet in the morning.'];
const baseline={module:{exports:{}},require:()=>learner};vm.runInNewContext(cp.execFileSync('git',['show','HEAD:public/conversation-recap.js'],{encoding:'utf8'}),baseline);const prior=baseline.module.exports;
assert.equal(model.renderRatio.toString().replace(/\r/g,''),prior.renderRatio.toString().replace(/\r/g,''));
const captured=build(speech.learner,speech.partner),synthetic=build(short);
assert.equal(captured.metrics.user_word_count,114);assert.equal(captured.metrics.partner_word_count,67);assert.equal(synthetic.metrics.user_word_count,27);
for(const r of [captured,synthetic])for(const lang of ['ko','en'])assert.equal(model.renderRatio(r,lang),prior.renderRatio(r,lang));
assert(model.renderRatio(captured,'ko').includes('63%'));assert(model.renderRatio(captured,'ko').includes('37%'));assert.equal(model.renderRatio(synthetic,'en'),'');
for(const mutate of [r=>r.ratio_quality.eligible=false,r=>r.source.partner_available=false,r=>r.ratio_quality.source_fingerprint='stale',r=>r.metrics.partner_word_count=null]){const r=JSON.parse(JSON.stringify(captured));mutate(r);assert.equal(model.renderRatio(r,'ko'),'');}
function page(locale,done=true,fixture=synthetic){const r=JSON.parse(JSON.stringify(fixture));r.progress={completed:done?r.questions.length:Math.min(2,r.questions.length-1),total:r.questions.length,reason:done?'completed':null};const report={booking_id:B,partner_name:'Jen',__dayoPublicNameVerified:true,partner_comment:'I really enjoyed hearing your stories today.',quiz_score:67,feedback:[r]};
const dom=new JSDOM('<div id="quiz-modal">'+model.renderActions(r,locale)+'</div><div id="memory-game-modal" hidden><h3 id="memory-game-title"></h3><p id="game-round-badge"></p><p id="game-kr-meaning"></p><span id="review-quiz-timer"></span><div id="word-pool-container"></div><button id="quiz-skip-btn"></button></div>',{runScripts:'outside-only',url:'http://localhost/'}),w=dom.window;
let writes=0,clock=null,now=10000;w.Date.now=()=>now;w.setInterval=f=>{clock=f;return 1;};w.clearInterval=()=>{clock=null;};w.DayOI18n={getLang:()=>locale};w.DayOConversationRecap=model;w.DayOLearnerExpressions=learner;w.DayORoomAccess={bookingId:B};w.getLearnerReviewSnapshot=()=>report;w.getCanonicalReviewSource=()=>({recap:r});w.__dayoQuizProgress={...r.progress};w.__dayoQuizScore=67;w.__dayoReviewRevision=7;w.__dayoReviewReportSaved=true;
w.finalizeLearnerQuiz=async()=>{writes++;return true;};w.openQuizModalImmediately=()=>{w.document.querySelector('#quiz-modal').hidden=false;};w.sessionStorage.setItem('dayo_recap_state:'+B,JSON.stringify({fingerprint:'original',completed:6,total:6,ended:true}));w.eval(fs.readFileSync('public/memory-game.js','utf8'));w.document.querySelector('#quiz-skip-btn').onclick=()=>w.skipToRecordCard();
const frozen=JSON.stringify(report),storage=w.sessionStorage.getItem('dayo_recap_state:'+B),globals=JSON.stringify([w.__dayoQuizProgress,w.__dayoQuizScore,w.__dayoReviewRevision,w.__dayoReviewReportSaved]);
return {w,report,r,dom,get writes(){return writes;},tick(){now+=100000;if(clock)clock();},unchanged(){assert.equal(JSON.stringify(report),frozen);assert.equal(w.sessionStorage.getItem('dayo_recap_state:'+B),storage);assert.equal(JSON.stringify([w.__dayoQuizProgress,w.__dayoQuizScore,w.__dayoReviewRevision,w.__dayoReviewReportSaved]),globals);assert.equal(writes,0);}};}
(async()=>{for(const lang of ['ko','en']){
let p=page(lang);p.w.document.querySelector('[data-recap-replay]').click();assert(p.w.document.querySelector('#game-round-badge').textContent.startsWith('0/6'));
for(let i=0;i<6;i++){const buttons=Array.from(p.w.document.querySelectorAll('#word-pool-container button'));buttons.find(b=>b.textContent===p.r.questions[i].answer).click();await Promise.resolve();p.w.document.querySelector('#word-pool-container button.recap-primary').click();}
p.unchanged();assert(p.w.document.querySelector('#memory-game-modal').hidden);assert(!p.w.document.querySelector('#quiz-modal').hidden);p.dom.window.close();
for(const end of ['skip','timeout','recap']){p=page(lang);p.w.startRecapQuestions({practice:true});if(end==='skip')p.w.skipToRecordCard();else if(end==='timeout')p.tick();else await p.w.openQuizModalImmediately();p.unchanged();assert(p.w.document.querySelector('#memory-game-modal').hidden);p.dom.window.close();}
p=page(lang);assert(p.w.document.querySelector('[data-recap-replay]'));assert.equal(p.report.quiz_score,67);assert.equal(p.r.progress.completed,6);p.dom.window.close();
p=page(lang,false);p.w.startRecapQuestions();assert(p.w.document.querySelector('#game-round-badge').textContent.startsWith('2/6'));p.w.document.querySelector('#word-pool-container button').click();await Promise.resolve();assert(p.writes>0);assert.equal(p.w.__dayoQuizProgress.completed,3);await p.w.skipToRecordCard();p.dom.window.close();
}
for(const lang of ['ko','en']){
let p=page(lang,true,captured);assert.equal(p.r.questions.length,2);assert.equal(p.r.progress.completed,2);
p.w.document.querySelector('[data-recap-replay]').click();assert(p.w.document.querySelector('#game-round-badge').textContent.startsWith('0/2'));
for(let i=0;i<2;i++){const buttons=Array.from(p.w.document.querySelectorAll('#word-pool-container button'));buttons.find(b=>b.textContent===p.r.questions[i].answer).click();await Promise.resolve();p.w.document.querySelector('#word-pool-container button.recap-primary').click();}
p.unchanged();assert(p.w.document.querySelector('#memory-game-modal').hidden);assert.equal(p.r.progress.completed,2);assert.equal(p.report.quiz_score,67);p.dom.window.close();
p=page(lang,true,captured);assert.equal(p.r.progress.completed,2);assert.equal(p.report.quiz_score,67);assert(model.render(p.r,lang).includes('114'));assert(model.renderRatio(p.r,lang).includes('63%'));p.unchanged();p.dom.window.close();
}
for(const file of ['conversation-recap.js','conversation-recap.css','user-conversation-report.js','memory-game.js'])assert.equal(fs.readFileSync('public/'+file,'utf8'),fs.readFileSync(file,'utf8'));
console.log('PASS production ratio parity (114/67→63/37; 27/missing Partner fallback), original 2/2 and six-question practice completion/skip/timeout/return/reload, zero save/storage/global writes, original score 67 preserved, normal quiz persistence and mirrors.');})();
