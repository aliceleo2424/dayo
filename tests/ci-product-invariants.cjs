'use strict';
// Read-only source baseline; the behavioral browser suites run separately.
const assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
for(const f of ['room.html','room-live.js','memory-game.js','partner-report.js','partner-report-contract.js','partner-report.css','session-lifecycle.js','supabase-client.js','mypage.html']){
 if(fs.existsSync(f)&&fs.existsSync('public/'+f))assert.equal(read(f),read('public/'+f),f+' public/root mirror mismatch');
}
const room=read('public/room.html'),live=read('public/room-live.js'),quiz=read('public/memory-game.js'),feedback=read('public/conversation-partner-feedback.js'),product=read('docs/DAYO_PRODUCT_CONTRACT.md'),agents=read('AGENTS.md');
for(const [label,rx] of [
 ['Partner Letter submission',/id="btn-final-partner-submit"/],
 ['Partner end-of-session popup',/id="partner-report-popup"/],
 ['Customer recap entry',/id="quiz-content-box"/],
 ['Session timer',/id="timer"/],
 ['Caption surface',/caption/i],
 ['Partner controls',/partner-topic-card/],
 ['User feedback gate',/DayOConversationPartnerFeedback\.beforeRecap/]
])assert.match(room,rx,label+' missing from actual live room');
assert.match(live,/recognition\.lang = 'en-US'/,'Current browser STT baseline removed');
assert.match(quiz,/window\.openQuizModalImmediately = openRecap/,'Canonical Recap entry removed');
assert.match(feedback,/beforeRecap\s*:\s*function/,'Feedback-before-Recap gate removed');
assert.match(product,/Partner is the \*\*only required human image reviewer\*\*/,'Partner-only image review contract missing');
assert.match(agents,/No mandatory Admin review/,'No mandatory Admin image review constraint missing');
assert.ok(fs.existsSync('public/partner-captions.js'),'Partner captions implementation missing');
console.log('PASS: DayO contract, source mirrors, Partner Letter, STT, captions, feedback and Recap entry.');
