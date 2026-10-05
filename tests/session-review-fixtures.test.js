const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const expressions = require('../public/learner-expressions.js');

const learnerThree = [
  { speaker: 'learner', text: 'I visited Paris last summer.' },
  { speaker: 'learner', text: 'I really enjoy cooking Italian food.' },
  { speaker: 'learner', text: 'We watched a funny movie yesterday.' },
];
assert.equal(expressions.extractExpressions(learnerThree, { limit: 3, quizQuality: true }).length, 3);

const mixed = [
  { speaker: 'partner', text: 'I have lived in Seoul for years.' },
  { speaker: 'learner', text: 'I visited Paris last summer.' },
  { speaker: 'partner', text: 'I really enjoy teaching new people.' },
  { speaker: 'learner', text: 'We watched a funny movie yesterday.' },
  { speaker: 'partner', text: 'I recommend visiting the river tonight.' },
];
assert.deepEqual(
  expressions.extractExpressions(mixed, { limit: 3, quizQuality: true }),
  ['I visited Paris last summer', 'We watched a funny movie yesterday']
);
assert.equal(expressions.extractExpressions(mixed.filter((row) => row.speaker === 'partner'), { limit: 3, quizQuality: true }).length, 0);
assert.equal(expressions.extractExpressions([{ text: 'I visited Paris last summer.' }], { limit: 3, quizQuality: true }).length, 0);

const noisy = [
  { speaker: 'learner', text: 'Um uh yeah okay.' },
  { speaker: 'learner', text: 'I fucking like this place.' },
  { speaker: 'learner', text: 'I really 좋아해 this cafe.' },
  { speaker: 'learner', text: 'I really enjoy this cafe.' },
];
assert.deepEqual(expressions.extractExpressions(noisy, { limit: 3, quizQuality: true }), ['I really enjoy this cafe']);

assert.equal(expressions.quizScore(2, 3), 67);
assert.equal(expressions.quizScore(1, 3), 33);
assert.equal(expressions.quizScore(1, 2), 50);
assert.equal(expressions.quizScore(3, 3), 100);
assert.equal(expressions.quizScore(0, 0), null);

const startedAt = Date.parse('2026-09-28T10:00:00Z');
const recovered = expressions.normalizeQuizState({
  fingerprint: 'fixture',
  startedAt,
  currentIndex: 2,
  completed: 2,
  total: 3,
  ended: false,
}, 3, 'fixture');
assert.equal(recovered.currentIndex, 2);
assert.equal(recovered.completed, 2);
assert.equal(expressions.quizRemainingSeconds(startedAt, startedAt + 60_000, 300), 240);

const reportDetails = {
  quizScore: 67,
  wordHelp: [{ text: 'recommend', ko: '추천하다' }],
  feedback: ['또 만나고 싶어요'],
};
const savedPayload = expressions.buildReviewData(learnerThree, reportDetails);
const talkRecordPayload = expressions.buildReviewData(learnerThree, reportDetails);
assert.deepEqual(talkRecordPayload, savedPayload);
assert.deepEqual(savedPayload.key_expressions, [
  'I visited Paris last summer',
  'I really enjoy cooking Italian food',
  'We watched a funny movie yesterday',
]);

// Replacement UX: exercise real DOM click delegation and the soft 30s clock.
const {JSDOM}=require('jsdom');
const recap=require('../public/conversation-recap.js');
async function verifyRecapDOM(){
 const dom=new JSDOM('<html lang="ko"><body><div id="quiz-modal"><div id="quiz-content-box"></div></div><div id="memory-game-modal" hidden><h3 id="memory-game-title"></h3><div id="game-round-badge"></div><div id="review-quiz-timer" hidden></div><p id="game-kr-meaning"></p><div id="word-pool-container"></div><button id="quiz-skip-btn"></button></div></body></html>',{runScripts:'outside-only',url:'https://fixture.invalid'});
 const w=dom.window,B='11111111-1111-4111-8111-111111111111',L='learner';let clock=Date.now(),tick,opens=0;
 w.Date=class extends Date{static now(){return clock;}};w.setInterval=fn=>{tick=fn;return 1;};w.clearInterval=()=>{};
 w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.DayOLearnerExpressions=expressions;w.DayOConversationRecap=recap;
 const data=recap.build({bookingId:B,learnerId:L,language:'en',learnerLog:{id:'source',booking_id:B,participant_id:L,participant_role:'learner',transcript:[{id:'u1',speaker:'learner',text:'The crowded café was busy.',timestamp:'2026-10-05T05:01:00Z'}]}});
 w.prepareSessionReviewSource=async()=>({available:true,recap:data});w.getCanonicalReviewSource=()=>({available:true,recap:data});
 w.getLearnerReviewSnapshot=()=>({booking_id:B,feedback:[{...data,progress:w.__dayoQuizProgress||data.progress}]});
 w.finalizeLearnerQuiz=async()=>{w.__dayoReviewReportSaved=true;return true;};
 w.openQuizModalImmediately=()=>{opens++;w.document.getElementById('quiz-content-box').innerHTML=recap.render(recap.saved(w.getLearnerReviewSnapshot()),'ko',{interactive:true});};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/memory-game.js'),'utf8'));
 await w.openQuizModalImmediately();assert.equal(opens,1);assert.match(w.document.getElementById('quiz-content-box').textContent,/오늘의 대화 리캡/);
 w.document.querySelector('[data-recap-start]').click();assert.equal(w.document.getElementById('memory-game-modal').hidden,false);assert.match(w.document.getElementById('memory-game-title').textContent,/30초 리캡/);
 assert.equal(w.document.querySelectorAll('.recap-option').length,4);
 w.document.querySelector('.recap-option').click();assert.equal(w.__dayoQuizProgress.completed,1);assert.match(w.document.querySelector('.recap-answer').textContent,/crowded · packed/);
 Array.from(w.document.querySelectorAll('.recap-primary')).find(n=>n.textContent==='계속 보기').click();
 clock+=31000;tick();await new Promise(setImmediate);
 assert.equal(w.document.getElementById('memory-game-modal').hidden,true);assert.equal(w.__dayoQuizProgress.reason,'timeout');assert.equal(w.document.querySelector('[data-recap-start]'),null);
 assert(!/점|100%|퀴즈/.test(w.document.getElementById('quiz-content-box').textContent));dom.window.close();
}
verifyRecapDOM().then(()=>console.log('Session review fixtures passed: legacy JSON helpers, fingerprint compatibility, recap-first DOM, click delegation, answer completion and soft timeout.')).catch(e=>{console.error(e);process.exitCode=1;});
