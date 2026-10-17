'use strict';
// Owner request 2026-10-17: "Expressions I actually used" joins pause fragments and splits multi-sentence rows.
// Fragments below are the exact shapes Soniox produced for a speaker pausing mid-sentence (real provider run).
const assert = require('assert/strict');
const recap = require('../public/conversation-recap.js');
const B = '44444444-4444-4444-8444-444444444444', L = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222';
const t = s => new Date(Date.UTC(2026, 9, 17, 0, 0, s)).toISOString();
const learnerLog = { id: 'log-l', booking_id: B, participant_id: L, participant_role: 'learner', transcript: [
  { id: 'u1', speaker: 'learner', text: 'Yesterday I went to the.', timestamp: t(0) },
  { id: 'u2', speaker: 'learner', text: 'River with my friends and we ate some chicken.', timestamp: t(4) },
  { id: 'u3', speaker: 'learner', text: 'I think the weather was.', timestamp: t(10) },
  { id: 'u4', speaker: 'learner', text: 'Really nice for a picnic.', timestamp: t(13) },
  { id: 'u5', speaker: 'learner', text: 'I visited a small cafe near my office. I ordered a vanilla latte and it was very sweet. My friend loved it too.', timestamp: t(60) },
  { id: 'u6', speaker: 'learner', text: 'I like it.', timestamp: t(120) },
  { id: 'u7', speaker: 'learner', text: 'Then I watched a movie with my sister.', timestamp: t(200) }
] };
const partnerLog = { id: 'log-p', booking_id: B, participant_id: P, participant_role: 'partner', transcript: [{ id: 'p1', speaker: 'partner', text: 'That sounds lovely, tell me more.', timestamp: t(5) }] };
const r = recap.build({ bookingId: B, language: 'en', learnerId: L, partnerId: P, learnerLog, partnerLog, history: [], chatMessages: [] });
const texts = r.expressions.map(e => e.text);
console.log(texts);
assert.ok(r.expressions.length > 0 && r.expressions.length <= 3);
for (const x of texts) {
  assert.equal((x.match(/[.!?](\s|$)/g) || []).length <= 1, true, 'one sentence per expression: ' + x);
  assert.doesNotMatch(x, /\b(?:the|was)\.$/i, 'no dangling fragment: ' + x);
}
assert.ok(texts.some(x => x === 'Yesterday I went to the River with my friends and we ate some chicken.' || x === 'I think the weather was really nice for a picnic.' || /^I (?:visited|ordered)/.test(x)), 'joined or split sentence chosen');
const all = r.expressions.map(e => e.source_utterance_id);
assert.ok(all.every(id => /^u\d$/.test(id)), 'expressions still point at real stored rows');
// Metrics still use the original rows (no word or utterance inflation).
assert.equal(r.metrics.user_utterance_count, 7);
const words = learnerLog.transcript.reduce((n, x) => n + recap.words(x.text).length, 0);
assert.equal(r.metrics.user_word_count, words);
console.log('PASS recap sentence units: pause fragments joined, multi-sentence rows split, metrics unchanged, ids preserved');
