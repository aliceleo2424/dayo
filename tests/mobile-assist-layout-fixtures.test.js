const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'room.html'), 'utf8');
const publicRoom = fs.readFileSync(path.join(root, 'public', 'room.html'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'conversation-assist-mobile-fixture.html'), 'utf8');

assert.equal(room, publicRoom, 'root/public room mirrors must match');
assert.match(room, /--dayo-visual-height: 100dvh/);
assert.match(room, /--dayo-video-min-height: clamp\(132px, calc\(var\(--dayo-visual-height\) \* 0\.38\), 320px\)/);
assert.match(room, /height: min\(calc\(var\(--dayo-visual-height\) \* 0\.42\), 300px\)/, 'chat must stay under 42%');
assert.match(room, /#wordSheet \{ max-height: min\(calc\(var\(--dayo-visual-height\) \* 0\.4\), 340px\); \}/);
assert.match(room, /#partner-topic-card[\s\S]*0\.35[\s\S]*#partner-topic-content[\s\S]*overflow-y: auto/);
assert.match(room, /\.chat-input-row[\s\S]*position: sticky[\s\S]*bottom: 0/);
assert.match(room, /#wordHelpResults[\s\S]*overflow-y: auto/);
assert.match(room, /visualViewport\.addEventListener\('resize', syncMobileVisualViewport/);
assert.match(room, /dayo-keyboard-open[\s\S]*#wordHelpResults \{ max-height: 54px; \}/);
assert.match(room, /function closeMobileAssistPanels\(except\)/);
assert.match(room, /chatPanel\.contains\(document\.activeElement\)[\s\S]*document\.activeElement\.blur\(\)/);
assert.match(room, /sheet\.contains\(document\.activeElement\)[\s\S]*document\.activeElement\.blur\(\)/);
['chat', 'talk', 'word', 'partner'].forEach((name) => {
  assert.match(room, new RegExp("closeMobileAssistPanels\\('" + name + "'\\)"), name + ' must close competing panels');
});
assert.match(room, /renderWordHelpResults\(words, phrases\)[\s\S]*inputNode\.blur\(\)/, 'successful Word Help should dismiss mobile keyboard');

['chat', 'word-input', 'word-result', 'partner', 'talk', 'keyboard'].forEach((state) => {
  assert.match(fixture, new RegExp(state.replace('-', '\\-')));
});
assert.match(fixture, /id="remoteVideo"/);
assert.match(fixture, /overflow: hidden/);
assert.doesNotMatch(fixture, /width:\s*[4-9]\d{2}px/, 'fixture must not require a desktop-width panel');

console.log('Mobile assist layout fixtures passed: video priority, compact chat/Word Help/partner/talk panels, keyboard viewport handling, and mutual exclusivity.');
