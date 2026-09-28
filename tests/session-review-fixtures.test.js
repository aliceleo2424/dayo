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
  startedAt,
  currentIndex: 2,
  completed: 2,
  total: 3,
  ended: false,
}, 3);
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

function element() {
  return {
    hidden: false,
    innerHTML: '',
    innerText: '',
    textContent: '',
    style: {},
    children: [],
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) { this.handlers = this.handlers || {}; this.handlers[type] = handler; },
    appendChild(child) { this.children.push(child); this.lastChild = child; },
  };
}

async function verifyImmediateSaveBeforeTalkRecord() {
  const nodes = {};
  ['memory-game-modal', 'memory-game-title', 'game-round-badge', 'review-quiz-timer', 'game-kr-meaning', 'answer-slot-container', 'word-pool-container']
    .forEach((id) => { nodes[id] = element(); });
  const storage = new Map();
  let saveCalls = 0;
  let talkRecordOpens = 0;
  const windowStub = {
    DayOLearnerExpressions: expressions,
    DayORoomAccess: { bookingId: '11111111-1111-4111-8111-111111111111' },
    isPartnerRoomMode() { return false; },
    openQuizModalImmediately() { talkRecordOpens += 1; },
    finalizeLearnerQuiz() { saveCalls += 1; return Promise.resolve(true); },
  };
  const context = {
    window: windowStub,
    document: {
      getElementById(id) { return nodes[id] || null; },
      createElement() { return element(); },
    },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
    localStorage: { getItem() { return null; } },
    console,
    Date,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'memory-game.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'public/memory-game.js' });
  windowStub.startMultiMemoryGame([]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saveCalls, 1, 'candidate 0 must save the report immediately');
  assert.equal(talkRecordOpens, 0, 'Talk Record must not open before save succeeds');
  const recordButton = nodes['word-pool-container'].lastChild;
  assert.equal(recordButton.textContent, '대화 기록 확인하기');
  recordButton.handlers.click();
  assert.equal(talkRecordOpens, 1);
}

verifyImmediateSaveBeforeTalkRecord().then(() => {
  const lifecycleSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'session-lifecycle.js'), 'utf8');
  const roomSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'room.html'), 'utf8');
  assert.match(lifecycleSource, /window\.__dayoLearnerReportPayload = payload/);
  assert.match(roomSource, /window\.getLearnerReviewSnapshot\(\)/);
  console.log('Session review fixtures passed: learner-only extraction, quality filters, partial scores, refresh state, save-before-record, shared report source.');
});
