'use strict';
// Korean-session recap (2026-10-24): foreign user speaks Korean with a Korean partner.
// Word counts use space-separated words (어절), "expressions I used" are the user's Korean sentences,
// no vocabulary quiz yet, and the English-session recap is unchanged.
const assert = require('assert/strict');
const recap = require('../public/conversation-recap.js');
const B = '44444444-4444-4444-8444-444444444444', L = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222';
const t = s => new Date(Date.UTC(2026, 9, 26, 0, 0, s)).toISOString();
const log = (id, role, pid, lines) => ({ id, booking_id: B, participant_id: pid, participant_role: role, transcript: lines.map((x, i) => ({ id: role[0] + i, speaker: role, text: x[0], timestamp: t(x[1]) })) });
const learnerLog = log('l', 'learner', L, [
  ['안녕하세요.', 0], ['네.', 5], ['저는 지난 주말에 한강에서 치킨을 먹었어요.', 20], ['친구들이랑 같이 갔는데 날씨가 정말 좋았어요.', 40],
  ['다음에는 자전거를 타고 싶어요.', 70], ['음.', 80], ['한국 음식 중에서 떡볶이를 제일 좋아해요. 조금 매워요.', 100]
]);
const partnerLog = log('p', 'partner', P, [
  ['와, 한강에서 치킨 먹었어요? 정말 좋네요. 누구랑 갔어요?', 25], ['자전거 타는 것도 재미있어요. 어디에서 타고 싶어요?', 75],
  ['떡볶이 좋아하는구나. 어느 가게 떡볶이가 제일 맛있었어요?', 105], ['다음에 같이 이야기해요. 오늘 정말 즐거웠어요.', 200]
]);
const r = recap.build({ bookingId: B, language: 'ko', learnerId: L, partnerId: P, learnerLog, partnerLog, history: [], chatMessages: [] });
assert.equal(r.supported, true, 'Korean recap supported');
assert.equal(r.language, 'ko');
const expected = learnerLog.transcript.reduce((n, x) => n + x.text.split(/\s+/).filter(w => /[가-힣A-Za-z0-9]/.test(w)).length, 0);
assert.equal(r.metrics.user_word_count, expected, 'counts 어절');
assert.ok(r.metrics.partner_word_count > 0);
assert.equal(r.metrics.user_utterance_count, 7);
assert.deepEqual(r.questions, [], 'no vocabulary quiz for Korean yet');
const texts = r.expressions.map(e => e.text);
console.log(texts);
assert.ok(texts.length >= 2 && texts.length <= 3);
assert.ok(texts.every(x => /[가-힣]/.test(x) && !/^(안녕하세요|네|음)[.]?$/.test(x)), 'real Korean sentences, no fillers');
assert.ok(texts.some(x => x.includes('한강')), 'story sentence picked');
assert.equal(texts.filter(x => /떡볶이.*조금 매워요/.test(x)).length, 0, 'multi-sentence row split');
for (const locale of ['en', 'ko']) {
  const html = recap.render(r, locale, {});
  assert.doesNotMatch(html, /not supported|지원하지 않아요/, 'not the unsupported message');
  assert.match(html, /한강에서 치킨/, 'expressions shown');
  assert.match(html, locale === 'en' ? /Korean conversation record/ : /한국어 대화 기록이에요/);
  assert.match(html, locale === 'en' ? /saved Korean transcript/ : /어절 수/);
  assert.match(html, new RegExp(String(expected)));
}
// English session: same word rule as before (Latin words only).
const en = recap.build({ bookingId: B, language: 'en', learnerId: L, partnerId: P,
  learnerLog: log('l', 'learner', L, [['I went to the Han River last weekend with my friends.', 0], ['We ate chicken and it was really good.', 10]]),
  partnerLog: log('p', 'partner', P, [['That sounds fun! Who did you go with?', 5]]), history: [], chatMessages: [] });
assert.equal(en.metrics.user_word_count, 19);
assert.ok(en.expressions.length > 0);
console.log('PASS Korean recap: 어절 counts, Korean expressions (fillers out, rows split), no quiz, EN/KO render; English recap unchanged');
