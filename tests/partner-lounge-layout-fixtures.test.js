const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const rootHtml = fs.readFileSync(path.join(root, 'partner.html'), 'utf8');
const publicHtml = fs.readFileSync(path.join(root, 'public', 'partner.html'), 'utf8');
const rootAvailability = fs.readFileSync(path.join(root, 'availability-slots.js'), 'utf8');
const publicAvailability = fs.readFileSync(path.join(root, 'public', 'availability-slots.js'), 'utf8');
const rootI18n = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
const publicI18n = fs.readFileSync(path.join(root, 'public', 'i18n.js'), 'utf8');

for (const html of [rootHtml, publicHtml]) {
  assert.match(html, /grid-template-columns: max-content minmax\(0, 1fr\) max-content/);
  assert.match(html, /\.partner-upcoming-row:only-child \{ flex-basis: 100%; \}/);
  assert.match(html, /\.profile-form \{[\s\S]*grid-template-columns: minmax\(11rem, 0\.7fr\) minmax\(0, 1\.3fr\)/);
  assert.doesNotMatch(html, /\.partner-upcoming-row\.is-next \{ flex-grow:/);
}

const normalizeEol = (value) => value.replace(/\r\n/g, '\n');
assert.strictEqual(normalizeEol(rootAvailability), normalizeEol(publicAvailability), 'availability renderer mirrors must match');
assert.match(rootAvailability, /partner-upcoming-brief-item/);
assert.match(rootAvailability, /partner\.upcoming\.purposes/);
assert.match(rootAvailability, /partner\.upcoming\.interests/);
assert.doesNotMatch(rootAvailability, /prepare\.disabled/, 'conversation prep must stay available before the entry window');

assert.strictEqual(normalizeEol(rootI18n), normalizeEol(publicI18n), 'i18n mirrors must match');
assert.match(rootI18n, /'partner\.brandSub': \{\s*KO: '파트너 라운지', EN: 'PARTNER LOUNGE'/);
assert.match(rootI18n, /'partner\.eyebrow': \{\s*KO: '파트너 라운지', EN: 'PARTNER LOUNGE'/);

console.log('Partner Lounge layout fixtures passed: compact card, one-card sizing, structured briefing, compact profile, and locale heading.');
