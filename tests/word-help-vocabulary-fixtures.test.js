const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const vocabulary = require('../public/word-help-vocabulary.js');
const cardsContext = { window: {} };
vm.runInNewContext(fs.readFileSync('public/talk-cards-data.js', 'utf8'), cardsContext);
const cards = cardsContext.window.DayOTalkCards;
assert.equal(cards.length, 158);
assert.equal(fs.readFileSync('public/word-help-vocabulary.js', 'utf8'), fs.readFileSync('word-help-vocabulary.js', 'utf8'));
for (const card of cards) {
  for (const language of ['en', 'ko']) {
    const sets = vocabulary.sets(card, language);
    assert.ok(sets.length >= 2);
    for (const set of sets) {
      assert.equal(set.length, 4);
      assert.ok(set.every(item => item.text && item.meaning && item.pronunciation && item.example && item.language === language));
      assert.equal(new Set(set.map(item => item.text)).size, 4);
      if (language === 'en') assert.ok(set.every(item => /[가-힣]/.test(item.meaning) && /[가-힣]/.test(item.pronunciation) && /[a-z]/i.test(item.example)));
      if (language === 'ko') assert.ok(set.every(item => /[a-z]/i.test(item.meaning) && /^[a-z -]+$/.test(item.pronunciation) && /[가-힣]/.test(item.example)));
      if (language === 'ko') assert.ok(set.every(item => /[가-힣]/.test(item.text) && !/[a-z]/i.test(item.text)));
    }
    for (let i = 0; i < sets.length; i++) {
      const next = sets[(i+1) % sets.length];
      assert.ok(sets[i].every(item => !next.some(other => other.text === item.text)), 'consecutive sets including wrap must not overlap');
    }
  }
  for (const language of ['es', 'fr', 'unknown']) assert.deepEqual(vocabulary.sets(card, language), []);
}
const room = fs.readFileSync('public/room.html', 'utf8');
assert.match(room, /category: String\(card\.category/);
assert.match(room, /DayOCurrentTalkCard = \{[\s\S]*window\.syncWordHelpCard\(\)/);
assert.match(room, /body\.theme-partner #wordHelpBtn/);
assert.doesNotMatch(room, /대화 구조대/);
assert.match(room, /id="wordVocabularyTitle" class="word-section-title">이런 단어가 필요하신가요\?/);
assert.match(room, /wordHelpTargetLanguage: String\(booking.language/);
assert.match(room, /✨ AI 표현 도움/);
const block = room.slice(room.indexOf('/* Word Help —'), room.indexOf('/* Feedback / rating'));
const elements = {};
function element(id) {
  if (elements[id]) return elements[id];
  const classes = new Set();
  return elements[id] = { value: '', innerHTML: '', textContent: '', hidden: id === 'wordHelpAiSection', attributes: {},
    classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, on) { if (on) classes.add(x); else classes.delete(x); } },
    getAttribute(k) { return this.attributes[k] || ''; }, setAttribute(k, v) { this.attributes[k] = v; }, replaceChildren() { this.innerHTML = ''; },
    focus() { this.focusCount = (this.focusCount || 0) + 1; }, blur() {}, addEventListener(type, fn) { this[type] = fn; } };
}
const requests = [], events = [], copies = [];
let timer = 0;
const context = { window: { DayOWordVocabulary: vocabulary,
  DayORoomAccess: { role: 'user', bookingId: 'session-a', userId: 'user-a', language: 'en' }, DayOCurrentTalkCard: cards[0],
  logSessionEvent: (...args) => events.push(args), copyHelpText(text) { copies.push(text); } },
  document: { getElementById: element, querySelectorAll: () => [element('vocab-toggle-0'), element('vocab-toggle-1')] }, AbortController, setTimeout: () => ++timer, clearTimeout() {},
  isMobileRoomLayout: () => true, openSheet: () => element('wordSheetOverlay').classList.add('active'),
  fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) };
vm.createContext(context); vm.runInContext(block, context);
const tick = () => new Promise(resolve => setImmediate(resolve));
const submit = () => elements.wordHelpForm.submit({ preventDefault() {} });
const oneWord = { words: [{ text: 'flavor', ko: '맛' }], phrases: [{ text: 'I like this flavor.', ko: '이 맛이 좋아요.' }] };
const countWords = () => (element('wordVocabularyResults').innerHTML.match(/class="word-card word-vocab-toggle"/g) || []).length;
(async () => {
  context.window.openWordHelp();
  assert.equal(countWords(), 4);
  assert.equal(requests.length, 0);
  assert.equal(element('wordHelpInput').focusCount || 0, 0, 'opening basic help must not open mobile keyboard');
  const first = element('wordVocabularyResults').innerHTML;
  element('wordVocabularyNext').click();
  assert.notEqual(element('wordVocabularyResults').innerHTML, first);
  element('wordVocabularyNext').click();
  element('wordVocabularyNext').click();
  assert.equal(element('wordVocabularyResults').innerHTML, first);
  const toggle0 = element('vocab-toggle-0'), toggle1 = element('vocab-toggle-1');
  toggle0.setAttribute('aria-controls', 'wordVocabularyExample-0');
  toggle1.setAttribute('aria-controls', 'wordVocabularyExample-1');
  element('wordVocabularyExample-0').hidden = true;
  context.window.toggleVocabularyExample(toggle0);
  assert.equal(element('wordVocabularyExample-0').hidden, false);
  context.window.toggleVocabularyExample(toggle1);
  assert.equal(element('wordVocabularyExample-0').hidden, true, 'only one example expands at a time');
  context.window.toggleVocabularyExample(toggle1);
  assert.equal(element('wordVocabularyExample-1').hidden, true, 'second tap collapses');
  context.window.copyVocabularyExample({ getAttribute: () => 'I like savory food.' });
  assert.equal(copies[0], 'I like savory food.');
  assert.equal(requests.length, 0, 'opening/copying an example must not call AI');
  context.window.DayORoomAccess.wordHelpTargetLanguage = 'ko';
  context.window.syncWordHelpCard();
  assert.match(element('wordVocabularyResults').innerHTML, /word-vocab-pronunciation">go-so-ha-da<\/span>[\s\S]*word-card-meaning">nutty \/ savory/);
  context.window.DayORoomAccess.wordHelpTargetLanguage = '';
  context.window.syncWordHelpCard();
  assert.equal(countWords(), 0, 'missing raw booking language must not use inherited English default');
  element('wordHelpInput').value = 'test'; submit(); assert.equal(requests.length, 0);
  delete context.window.DayORoomAccess.wordHelpTargetLanguage;
  context.window.DayORoomAccess.role = 'partner'; context.window.syncWordHelpCard();
  assert.equal(countWords(), 0, 'partner must not receive learner vocabulary');
  context.window.DayORoomAccess.role = 'user'; context.window.syncWordHelpCard();
  context.window.DayOCurrentTalkCard = cards.find(c => c.category === 'culture'); context.window.syncWordHelpCard();
  assert.notEqual(element('wordVocabularyResults').innerHTML, first);
  context.window.DayORoomAccess.language = 'ko'; context.window.syncWordHelpCard();
  assert.match(element('wordVocabularyResults').innerHTML, /전통/);
  assert.doesNotMatch(element('wordVocabularyResults').innerHTML, /a tradition/);
  context.window.DayORoomAccess.language = 'fr'; context.window.syncWordHelpCard();
  assert.equal(countWords(), 0); assert.match(element('wordVocabularyStatus').textContent, /준비 중/);
  context.window.DayORoomAccess.language = 'en'; context.window.syncWordHelpCard();
  element('wordHelpAiToggle').click.call(element('wordHelpAiToggle'));
  assert.equal(element('wordHelpInput').focusCount, 1);
  submit(); assert.equal(requests.length, 0);
  element('wordHelpInput').value = 'I want to describe food'; submit(); submit(); assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].options.body).talk_card.category, 'culture');
  requests[0].resolve({ ok: true, json: async () => oneWord }); await tick();
  const ai = element('wordHelpResults').innerHTML; assert.match(ai, /I like this flavor/);
  element('wordSheetOverlay').classList.remove('active'); context.window.openWordHelp();
  assert.equal(element('wordHelpResults').innerHTML, ai);
  element('wordHelpInput').value = 'second request'; submit(); element('wordSheetOverlay').classList.remove('active');
  requests[1].resolve({ ok: true, json: async () => oneWord }); await tick();
  assert.equal(element('wordHelpBtn').classList.contains('has-word-help-update'), true);
  context.window.openWordHelp(); assert.equal(element('wordHelpBtn').classList.contains('has-word-help-update'), false);
  element('wordHelpInput').value = 'failed request'; submit(); requests[2].resolve({ ok: false }); await tick();
  assert.equal(element('wordHelpResults').innerHTML, ai, 'failure retains last successful AI result');
  assert.ok(countWords() >= 4);
  context.window.useHelpHint({ getAttribute: name => ({ 'data-text': 'flavor', 'data-help-meaning': '맛', 'data-help-source': 'ai' }[name] || '') });
  assert.equal(events[0][0], 'word_help_clicked'); assert.equal(events[0][1].source, 'ai');
  context.window.useHelpHint({ getAttribute: name => ({ 'data-text': 'tradition', 'data-help-meaning': '전통', 'data-help-source': 'card-vocabulary' }[name] || '') });
  assert.equal(events.length, 1, 'deterministic selection must not mislabel itself as AI/fallback in DB');
  element('wordHelpInput').value = 'stale request'; submit();
  context.window.DayOCurrentTalkCard = cards[0]; context.window.syncWordHelpCard();
  assert.equal(requests[3].options.signal.aborted, true);
  requests[3].resolve({ ok: true, json: async () => oneWord }); await tick();
  assert.equal(element('wordHelpResults').innerHTML, '', 'changed card ignores previous card response');
  context.window.DayORoomAccess.bookingId = 'session-b'; context.window.syncWordHelpCard();
  assert.equal(element('wordHelpInput').value, '');
  assert.ok(context.window.__dayoWordHelpTelemetry.every(event => !('text' in event) && !('input' in event)));
  console.log('Word Help vocabulary/UI fixtures passed: 158 cards, language direction, set rotation, optional keyboard, AI retention/failure, canonical source, and session/card race isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
