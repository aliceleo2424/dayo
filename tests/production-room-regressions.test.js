const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'public', 'room.html'), 'utf8');
const lifecycle = fs.readFileSync(path.join(root, 'public', 'session-lifecycle.js'), 'utf8');
const memory = fs.readFileSync(path.join(root, 'public', 'memory-game.js'), 'utf8');
const expressions = require('../public/learner-expressions.js');

assert.equal(room, fs.readFileSync(path.join(root, 'room.html'), 'utf8'));
assert.equal(lifecycle, fs.readFileSync(path.join(root, 'session-lifecycle.js'), 'utf8'));
assert.equal(memory, fs.readFileSync(path.join(root, 'memory-game.js'), 'utf8'));

assert.match(room, /id="remoteConnectionState"[\s\S]*상대방과 연결 중이에요[\s\S]*잠시만 기다려 주세요/);
assert.match(room, /function attachRemoteStream\(stream, call\)[\s\S]*hideRemotePending\(\)[\s\S]*bindParticipantCallHealth\(call, stream\)/);
assert.match(room, /track\.addEventListener\('mute'[\s\S]*scheduleRemoteRecovery/);
assert.match(room, /connectionState === 'disconnected'[\s\S]*scheduleRemoteRecovery/);
assert.match(room, /participantCallNeedsRecovery\(call, reason\)/);
assert.match(room, /initial-audio-muted/);
assert.match(room, /visibilitychange[\s\S]*resumeRemotePlayback/);
assert.match(room, /echoCancellation: true, noiseSuppression: true, autoGainControl: true/);

assert.match(room, /\.talk-card-body\s*\{[\s\S]*overflow-y: auto;[\s\S]*-webkit-overflow-scrolling: touch;[\s\S]*touch-action: pan-y;/);
assert.match(room, /@media \(max-width: 767px\)[\s\S]*height: min\(50dvh, 340px\)/);
assert.match(room, /@media \(max-width: 767px\) and \(max-height: 700px\)[\s\S]*height: min\(46dvh, 270px\)/);

const openHelpBlock = room.slice(room.indexOf('window.openWordHelp = function'), room.indexOf('window.openSentenceHelp = function'));
assert.doesNotMatch(openHelpBlock, /logSessionEvent\('word_help_clicked'/);
assert.match(room, /window\.useHelpHint = function[\s\S]*logSessionEvent\('word_help_clicked'[\s\S]*items: \[\{ text: text, ko: meaning \}\]/);

const reportWithoutEvidence = expressions.buildReviewData([], { wordHelp: [] });
assert.deepEqual(reportWithoutEvidence.word_help, []);
assert.deepEqual(reportWithoutEvidence.key_expressions, []);
assert.equal(reportWithoutEvidence.spoken_sentence, null);
assert.equal(reportWithoutEvidence.summary, '이번 대화에서는 저장된 표현이 충분하지 않았어요.');

function verifyBookingScopedWordHelp() {
  const forwarded = [];
  const windowStub = {
    DayORoomAccess: {
      allowed: true,
      role: 'user',
      bookingId: '11111111-1111-4111-8111-111111111111',
      learnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      partnerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    },
    logSessionEvent(type, payload) { forwarded.push({ type, payload }); },
  };
  const context = {
    window: windowStub,
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Array,
    String,
  };
  vm.runInNewContext(lifecycle, context, { filename: 'public/session-lifecycle.js' });
  assert.deepEqual(Array.from(windowStub.__dayoWordHelpHistory), []);
  windowStub.logSessionEvent('word_help_clicked', { items: [{ text: 'recommend', ko: '추천하다' }] });
  assert.equal(windowStub.__dayoWordHelpHistory.length, 1);
  windowStub.DayORoomAccess.bookingId = '22222222-2222-4222-8222-222222222222';
  windowStub.logSessionEvent('word_help_clicked', { items: [{ text: 'beautiful', ko: '아름다운' }] });
  assert.deepEqual(Array.from(windowStub.__dayoWordHelpHistory, (item) => item.text), ['beautiful']);
  assert.equal(forwarded.length, 2);
}

function element() {
  return {
    hidden: false,
    textContent: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: { add() {}, remove() {} },
    appendChild(child) { this.children.push(child); this.lastChild = child; },
    addEventListener(type, handler) { this.handlers = this.handlers || {}; this.handlers[type] = handler; },
  };
}

async function verifyInsufficientQuizHidesClock() {
  const nodes = {};
  ['memory-game-modal', 'memory-game-title', 'game-round-badge', 'review-quiz-timer', 'game-kr-meaning', 'answer-slot-container', 'word-pool-container']
    .forEach((id) => { nodes[id] = element(); });
  const windowStub = {
    DayOLearnerExpressions: expressions,
    DayORoomAccess: { bookingId: '11111111-1111-4111-8111-111111111111' },
    isPartnerRoomMode() { return false; },
    finalizeLearnerQuiz() { return Promise.resolve(true); },
    openQuizModalImmediately() {},
  };
  const context = {
    window: windowStub,
    document: {
      getElementById(id) { return nodes[id] || null; },
      createElement() { return element(); },
    },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
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
  vm.runInNewContext(memory, context, { filename: 'public/memory-game.js' });
  windowStub.startMultiMemoryGame([]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes['review-quiz-timer'].hidden, true);
  assert.equal(nodes['review-quiz-timer'].style.display, 'none');
}

verifyBookingScopedWordHelp();
verifyInsufficientQuizHidesClock().then(() => {
  console.log('Production room regression fixtures passed: connection state, media recovery, mobile Talk Card scroll, evidence-only Word Help, booking isolation, and zero-candidate quiz UX.');
});
