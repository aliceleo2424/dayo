const assert = require('node:assert/strict');
const insights = require('../public/conversation-insights.js');

const start = '2026-09-10T10:00:00+09:00';
function row(minute, text, speaker = 'learner') {
  return { speaker, text, timestamp: new Date(Date.parse(start) + minute * 60 * 1000).toISOString() };
}

// A. One session: learner-only headline, 25-minute rhythm and insight.
const single = insights.analyzeSession([
  row(1, 'I really enjoyed the small neighborhood cafe'),
  row(6, 'The coffee smelled wonderful today'),
  row(11, 'I often visit that place with friends'),
  row(16, 'We talked about music and travel'),
  row(21, 'I want to go there again'),
  row(8, 'This partner sentence must not count', 'partner'),
  row(9, 'Missing speaker must not count', ''),
], start);
assert.equal(single.totalWords, 31);
assert.deepEqual(single.bins, [7, 5, 7, 6, 6]);
assert.equal(single.utteranceCount, 5);
assert.match(insights.sessionCardHtml(single), /오늘 <strong>31단어<\/strong>를 이야기했어요/);
assert.match(insights.sessionCardHtml(single), /10–15분 · 7단어/);

// B. Late decrease stays neutral, never a negative evaluation.
const lateDecrease = insights.analyzeSession([
  row(1, 'I like quiet mornings'),
  row(6, 'We shared many interesting stories about our favorite weekend places'),
  row(11, 'I also explained why I enjoy walking beside the river every Sunday'),
  row(16, 'It was a lovely topic'),
  row(21, 'I agree'),
], start);
assert.match(insights.sessionInsight(lateDecrease), /후반에는 조금 차분한 흐름/);
assert.doesNotMatch(insights.sessionInsight(lateDecrease), /하락|실패|떨어/);

// C. Uneven intervals receive a neutral rhythm observation.
const irregular = insights.analyzeSession([
  row(1, 'I enjoy coffee'),
  row(6, 'We explored a very detailed story about traveling across several beautiful cities together'),
  row(11, 'That sounds nice'),
  row(16, 'Another longer conversation appeared when we discussed music festivals and local food'),
  row(21, 'Yes I agree'),
], start);
assert.match(insights.sessionInsight(irregular), /리듬이 구간마다 조금 달랐어요/);

function session(day, words) {
  return {
    id: String(day),
    date: `2026-09-${String(day).padStart(2, '0')}T10:00:00+09:00`,
    metrics: { totalWords: words, hasLearnerEvidence: true },
  };
}

// D-F. Monthly trends are encouraging/neutral and never fabricate percentages.
const rising = insights.summarizeMonth([session(2, 20), session(8, 24), session(16, 45), session(24, 52)], new Date('2026-09-28T12:00:00+09:00'));
assert.match(rising.insight, /조금 더 많은 이야기/);
const falling = insights.summarizeMonth([session(2, 60), session(8, 50), session(16, 25), session(24, 20)], new Date('2026-09-28T12:00:00+09:00'));
assert.match(falling.insight, /조금 차분한 흐름/);
assert.doesNotMatch(falling.insight, /하락|실패|%/);
const mixed = insights.summarizeMonth([session(2, 30), session(8, 55), session(16, 35), session(24, 48)], new Date('2026-09-28T12:00:00+09:00'));
assert.match(mixed.insight, /경험은 계속 쌓이고/);

// G-H. One session has no trend claim; zero sessions have the empty CTA.
const one = insights.summarizeMonth([session(12, 42)], new Date('2026-09-28T12:00:00+09:00'));
assert.match(one.insight, /조금 더 쌓이면/);
assert.doesNotMatch(one.insight, /더 많은|차분한 흐름/);
const empty = insights.summarizeMonth([], new Date('2026-09-28T12:00:00+09:00'));
assert.match(insights.monthlyHeroHtml(empty), /첫 대화 예약하기/);

// I-J. Exact values are hidden in a tooltip reachable by focus and tap button state.
const html = insights.monthlyHeroHtml(rising);
assert.match(html, /class="dayo-story-tooltip" role="tooltip">9\/24 · 52단어/);
assert.match(html, /<button type="button" class="dayo-story-bar"/);
assert.match(html, /aria-expanded="false"/);
const tapListeners = {};
const tappedClasses = new Set();
const tappedButton = {
  classList: {
    contains(name) { return tappedClasses.has(name); },
    toggle(name, value) { if (value) tappedClasses.add(name); else tappedClasses.delete(name); },
    remove(name) { tappedClasses.delete(name); },
  },
  setAttribute(name, value) { this[name] = value; },
};
const tapContainer = {
  addEventListener(name, handler) { tapListeners[name] = handler; },
  querySelectorAll() { return []; },
};
insights.bindChartInteractions(tapContainer);
tapListeners.click({ target: { closest() { return tappedButton; } } });
assert.equal(tappedClasses.has('is-detail-open'), true);
assert.equal(tappedButton['aria-expanded'], 'true');

// K. Mobile safety is enforced by the <=390px stylesheet contract.
const fs = require('node:fs');
const css = fs.readFileSync(require('node:path').join(__dirname, '..', 'public', 'conversation-insights.css'), 'utf8');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'public', 'conversation-insights.js'), 'utf8');
assert.match(css, /@media \(max-width: 390px\)/);
assert.match(css, /min-height: 44px/);
assert.doesNotMatch(css, /overflow-x:\s*auto/);
assert.match(css, /\.dayo-story-bar:focus-visible \.dayo-story-tooltip/);

// L. Historical report metrics join canonical learner logs to the booking schedule.
assert.match(source, /\.eq\('learner_id', user\.id\)[\s\S]*\.in\('id', reportIds\)/);
assert.match(source, /var booking = bookingsById\[id\]/);
assert.match(source, /analyzeSession\(log\.transcript, booking\.scheduled_at\)/);
assert.doesNotMatch(source, /analyzeSession\(log\.transcript, report\.created_at/);

console.log('conversation insight fixtures: ok');
