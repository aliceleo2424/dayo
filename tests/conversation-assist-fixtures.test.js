const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'public', 'room.html'), 'utf8');
const roomRoot = fs.readFileSync(path.join(root, 'room.html'), 'utf8');
const lifecycle = fs.readFileSync(path.join(root, 'public', 'session-lifecycle.js'), 'utf8');
const wordHandler = require('../api/word-help.js');
const questionHandler = require('../api/partner-question.js');

assert.equal(room, roomRoot, 'root/public room mirrors must match');
assert.match(room, /한국어로 입력해도 괜찮아요[\s\S]*id="wordHelpInput"/);
assert.match(room, /id="wordHelpSubmit"[^>]*>도움받기</);
assert.doesNotMatch(room, /defaultWordHints|defaultSentenceHints|beautiful<\/|souvenir|dayo-help-hint-modal/);
assert.doesNotMatch(room, /id="sentenceSheetOverlay"/);
assert.match(room, /wordHelpRequestSequence[\s\S]*wordHelpAbortController\.abort\(\)/);
assert.match(room, /if \(requestId !== wordHelpRequestSequence\) return/);
assert.match(room, /지금은 단어 도움을 불러오지 못했어요\.\\n조금 뒤 다시 시도해 주세요/);

const renderHelp = room.slice(room.indexOf('function renderWordHelpResults'), room.indexOf('function setWordHelpStatus'));
assert.doesNotMatch(renderHelp, /logSessionEvent|word_help_clicked/, 'rendering suggestions must not record usage');
const useHelp = room.slice(room.indexOf('window.useHelpHint'), room.indexOf('function wordHelpCard'));
assert.match(useHelp, /word_help_clicked[\s\S]*items: \[\{ text: text, ko: meaning \}\]/);
assert.match(lifecycle, /__dayoWordHelpBookingId !== bookingId[\s\S]*__dayoWordHelpHistory = \[\]/);

assert.equal((room.match(/id="btn-partner-ask"/g) || []).length, 1);
assert.doesNotMatch(room, /id="btn-partner-topic"|다음 꼬리질문 추천|새 대화 주제 전환/);
assert.match(room, /id="partner-question-refresh"[^>]*>다시 추천</);
const partnerBlock = room.slice(room.indexOf('function partnerQuestionPrompter'), room.indexOf('<script src="mobile-nav.js"'));
assert.match(partnerBlock, /talk_card: window\.DayOCurrentTalkCard/);
assert.match(partnerBlock, /brief: window\.DayOConversationBrief/);
assert.match(partnerBlock, /previous_questions: previousQuestions\.slice/);
assert.doesNotMatch(partnerBlock, /sessionTranscript|readTranscript|NEXT_PUBLIC_GEMINI_API_KEY|generativelanguage\.googleapis\.com/);
assert.match(partnerBlock, /fetch\('\/api\/partner-question'/);
assert.match(partnerBlock, /followups_en[\s\S]*followups_ko[\s\S]*slice\(0, 3\)/);
assert.match(partnerBlock, /질문을 불러오지 못했어요[\s\S]*다시 시도해 주세요/);
assert.match(room, /#wordSheet \{ max-height: min\(68dvh, 540px\); \}/);
assert.match(room, /\.sheet-body[\s\S]*overflow-y: auto/);

function geminiPayload(value) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] };
}

async function invoke(handler, body, upstream) {
  let captured = null;
  global.fetch = async function (url, options) {
    captured = { url, options, prompt: JSON.parse(options.body).contents[0].parts[0].text };
    return upstream;
  };
  const req = { method: 'POST', body };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value ? JSON.parse(value) : null; }
  };
  await handler(req, res);
  return { res, captured };
}

async function run() {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fixture-key';
  try {
    const wordUpstream = {
      ok: true, status: 200, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(await wordUpstream.json()),
      json: async () => geminiPayload({
        words: [
          { text: 'beautiful scenery', ko: '아름다운 경치' },
          { text: 'crowded', ko: '붐비는' },
          { text: 'peaceful', ko: '평화로운' },
          { text: 'extra', ko: '제외' }
        ],
        phrases: [
          { text: 'The scenery was beautiful, but it was crowded.', ko: '경치는 아름다웠지만 붐볐어요.' },
          { text: 'extra sentence', ko: '제외 문장' }
        ]
      })
    };
    const korean = await invoke(wordHandler, {
      input: '경치가 아름다웠지만 사람이 많았다',
      language: 'en',
      talk_card: { question_en: 'What places do you like to visit?', question_ko: '어떤 장소를 좋아하나요?' }
    }, wordUpstream);
    assert.equal(korean.res.statusCode, 200);
    assert.equal(korean.res.body.words.length, 3);
    assert.equal(korean.res.body.phrases.length, 1);
    assert.match(korean.captured.prompt, /경치가 아름다웠지만 사람이 많았다/);
    assert.match(korean.captured.prompt, /What places do you like to visit/);
    assert.match(korean.captured.prompt, /Target conversation language: English/);

    const english = await invoke(wordHandler, { input: 'I want to describe my weekend', language: 'en' }, wordUpstream);
    assert.equal(english.res.statusCode, 200);
    assert.match(english.captured.prompt, /I want to describe my weekend/);

    const failure = await invoke(wordHandler, { input: '도와줘', language: 'en' }, {
      ok: false,
      status: 500,
      statusText: 'fixture failure',
      text: async () => '{"error":"failed"}'
    });
    assert.equal(failure.res.statusCode, 502);
    assert.deepEqual(failure.res.body.error, 'generation_failed');
    assert.equal(failure.res.body.words, undefined, 'failure must not return fake words');

    const questionUpstream = {
      ok: true,
      json: async () => geminiPayload({ questions: [
        { en: 'Do you prefer cities or nature?', ko: '도시와 자연 중 어디를 더 좋아하나요?' },
        { en: 'What place do you remember most?', ko: '가장 기억에 남는 장소는 어디인가요?' },
        { en: 'Where would you like to go next?', ko: '다음에는 어디에 가고 싶나요?' }
      ] })
    };
    const partner = await invoke(questionHandler, {
      language: 'en',
      talk_card: {
        question_en: 'What kind of places do you like to visit?',
        question_ko: '어떤 장소를 여행하고 싶나요?',
        followups_en: ['Do you prefer cities or nature?'],
        followups_ko: ['도시와 자연 중 어디를 더 좋아하나요?']
      },
      brief: {
        purposes: ['casual_chat'], interests: ['travel'], chat_style: 'friendly',
        chat_request: 'Please ask short questions.', partner_preference: 'patient'
      },
      previous_questions: ['What country would you visit?'],
      sessionTranscript: 'SECRET_PARTNER_LOCAL_TRANSCRIPT'
    }, questionUpstream);
    assert.equal(partner.res.statusCode, 200);
    assert.equal(partner.res.body.questions.length, 3);
    assert.match(partner.captured.prompt, /What kind of places do you like to visit/);
    assert.match(partner.captured.prompt, /Please ask short questions/);
    assert.match(partner.captured.prompt, /What country would you visit/);
    assert.match(partner.captured.prompt, /target language identified by context\.language/);
    assert.doesNotMatch(partner.captured.prompt, /SECRET_PARTNER_LOCAL_TRANSCRIPT/);
    assert.match(partner.captured.url, /generativelanguage\.googleapis\.com/);

    console.log('Conversation assist fixtures passed: input-first Word Help, evidence-only usage, trusted partner context, fail-closed fallbacks, retries, and mobile-safe panels.');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
