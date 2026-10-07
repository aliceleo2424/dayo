const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'public', 'room.html'), 'utf8');
const roomLive = fs.readFileSync(path.join(root, 'public', 'room-live.js'), 'utf8');
const lifecycle = fs.readFileSync(path.join(root, 'public', 'session-lifecycle.js'), 'utf8');
const memory = fs.readFileSync(path.join(root, 'public', 'memory-game.js'), 'utf8');
const expressions = require('../public/learner-expressions.js');

assert.equal(room, fs.readFileSync(path.join(root, 'room.html'), 'utf8'));
assert.equal(roomLive, fs.readFileSync(path.join(root, 'room-live.js'), 'utf8'));
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

const recoveryBlock = room.slice(room.indexOf('function participantCallNeedsRecovery'), room.indexOf('function bindParticipantCallHealth'));
assert.match(recoveryBlock, /return !remoteAudioHealthy\(\)/);
assert.match(recoveryBlock, /setTimeout\(function \(\) \{[\s\S]*participantCallNeedsRecovery\(call, reason\)[\s\S]*3500/);
assert.match(room, /track\.addEventListener\('unmute'[\s\S]*clearTimeout\(remoteHealthTimer\)/);
assert.match(room, /id="remoteReconnectButton"[\s\S]*다시 연결하기/);
assert.match(room, /25000 - pendingFor/);
assert.match(room, /function retryParticipantConnection\(\)[\s\S]*endParticipantCall\(activeCall, 0\)[\s\S]*scheduleHostCall\(0\)/);
assert.match(room, /showRemoteAudioUnlock\(\)[\s\S]*room\.connection\.enableAudio/);
assert.match(room, /function resumeRemotePlayback\(\)[\s\S]*attempt\.then\(hideRemotePending\)\.catch\(function/);

assert.match(roomLive, /recognition\.lang = 'en-US'/);
assert.match(roomLive, /recognition\.continuous = true/);
assert.match(roomLive, /recognition\.interimResults = false/);
['onstart', 'onaudiostart', 'onspeechstart', 'onresult', 'onerror', 'onend'].forEach((handler) => {
  assert.match(roomLive, new RegExp('recognition\\.' + handler + ' = function'));
});
['stt_start', 'stt_audio_start', 'stt_speech_start', 'stt_result_final', 'stt_error', 'stt_end', 'stt_restart'].forEach((eventType) => {
  assert.match(roomLive, new RegExp(eventType));
});
assert.match(roomLive, /dayo_stt_telemetry:/);
assert.match(roomLive, /rows\.slice\(-80\)/);
assert.match(roomLive, /char_count: finalText\.length/);
assert.doesNotMatch(roomLive, /recordSttState\('stt_result_final', \{[^}]*text:/);
assert.match(roomLive, /visibilitychange[\s\S]*scheduleSttRestart\(180, 'foreground'\)/);
assert.match(roomLive, /pagehide[\s\S]*pageshow[\s\S]*scheduleSttRestart\(180, 'pageshow'\)/);
assert.match(roomLive, /mic_track_muted[\s\S]*mic-track-unmuted[\s\S]*mic_track_ended/);

assert.match(room, /id="devicePreflight"[\s\S]*15초 연결 확인/);
assert.match(room, /id="devicePreflightVideo"[\s\S]*Hello, nice to meet you\./);
assert.match(roomLive, /마이크는 연결됐지만 음성 인식이 시작되지 않았어요/);
assert.match(roomLive, /브라우저에서 음성 인식을 사용할 수 없어요/);
assert.match(roomLive, /window\.__dayoPreflightActive === true[\s\S]*if \(!isPreflight\)[\s\S]*pushTranscript/);
assert.match(room, /kakaotalk\|line\|inapp\|naver\|snapchat\|instagram/);
assert.match(room, /window\.__dayoInAppBlocked = true/);
assert.match(room, /외부 브라우저에서 열어주세요/);

assert.match(room, /\.talk-card-body\s*\{[\s\S]*overflow-y: auto;[\s\S]*-webkit-overflow-scrolling: touch;[\s\S]*touch-action: pan-y;/);
assert.match(room, /@media \(max-width: 767px\)[\s\S]*height: min\(calc\(var\(--dayo-visual-height\) \* 0\.42\), 300px\)/);
assert.match(room, /@media \(max-width: 767px\) and \(max-height: 700px\)[\s\S]*height: min\(calc\(var\(--dayo-visual-height\) \* 0\.4\), 240px\)/);

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
      addEventListener() {},
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
  console.log('Production room regression fixtures passed: STT lifecycle/telemetry/preflight, connection retry/audio recovery, mobile Talk Card scroll, evidence-only Word Help, booking isolation, and zero-candidate recap UX.');
});
