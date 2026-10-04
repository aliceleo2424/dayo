// Render the real room DOM/CSS and Word Help code, without booking, media, STT, or DB writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'public/room.html'), 'utf8');
const helper = room.slice(room.indexOf('/* Bottom sheets */'), room.indexOf('/* Feedback / rating'));
const timer = room.slice(room.indexOf('/* Session timer'), room.indexOf('(function initVideoSwap()')).replace(/Date.now\(\)/g, 'fixtureNow()').replace('setInterval(tick, 1000)', '(window.fixtureTick = tick, 0)');
const html = room.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('</body>', `
<div style="position:fixed;top:3px;right:6px;z-index:9999;background:white;font-size:12px;padding:3px">
  Fixture <select id="fixtureLanguage"><option>en</option><option>ko</option><option>es</option><option>fr</option></select>
  <button id="fixtureCard">카드 변경</button><select id="fixtureCategory"><option>food</option><option>daily</option><option>taste</option><option>korea-life</option><option>korea-trip</option><option>world-trip</option><option>culture</option></select><button id="fixtureError">AI 실패 전환</button><select id="fixtureRole"><option>user</option><option>partner</option></select><button id="fixtureThree">3분 알림</button><button id="fixtureOne">1분 알림</button><button onclick="this.parentElement.hidden=true">Fixture 숨기기</button>
</div>
<script src="/talk-cards-data.js"></script><script src="/word-help-vocabulary.js"></script>
<script>
document.body.classList.add('room-access-granted');
window.DayORoomAccess = {allowed:true,role:'user',bookingId:'fixture-booking',userId:'fixture-user',language:'en',wordHelpTargetLanguage:'en'};
window.DayOCurrentTalkCard = window.DayOTalkCards[0];
function closeMobileAssistPanels() {}
function isMobileRoomLayout() { return innerWidth <= 767; }
window.copyHelpText = function(text) { document.body.dataset.lastCopy = text; };
document.body.dataset.aiRequests = "0";
window.logSessionEvent = function(type,payload) { document.body.dataset.lastSource = payload.source; };
var fixtureFail = false;
window.fetch = async function() {
  document.body.dataset.aiRequests = String(Number(document.body.dataset.aiRequests) + 1);
  await new Promise(resolve => setTimeout(resolve, 250));
  return {ok:!fixtureFail,json:async function(){return {words:[{text:'delicious',ko:'맛있는'}],phrases:[{text:'This food is delicious.',ko:'이 음식은 맛있어요.'}]};}};
};
var fixtureClock = Date.now();
function fixtureNow() { return fixtureClock; }
window.DayORoomAccess.internalTest = true;
window.DayORoomAccessReady = Promise.resolve(window.DayORoomAccess);
${timer}
${helper}
document.getElementById('fixtureRole').onchange = function(){window.DayORoomAccess.role=this.value;document.body.classList.toggle('theme-partner',this.value==='partner');document.body.classList.toggle('theme-learner',this.value==='user');};
document.getElementById('fixtureThree').onclick = function(){fixtureClock += 22*60*1000;window.fixtureTick();};
document.getElementById('fixtureOne').onclick = function(){fixtureClock += 2*60*1000;window.fixtureTick();};
document.getElementById('fixtureLanguage').onchange = function() {window.DayORoomAccess.language=this.value;window.DayORoomAccess.wordHelpTargetLanguage=this.value;window.syncWordHelpCard();};
document.getElementById('fixtureCard').onclick = function() {window.DayOCurrentTalkCard=window.DayOTalkCards.find(card=>card.category==='culture');window.syncWordHelpCard();};
document.getElementById('fixtureCategory').onchange = function() {window.DayOCurrentTalkCard=window.DayOTalkCards.find(card=>card.category===this.value);window.syncWordHelpCard();};
document.getElementById('fixtureError').onclick = function() {fixtureFail=!fixtureFail;this.textContent=fixtureFail?'AI 실패 모드':'AI 정상 모드';};
</script></body>`);
const assets = new Set(['conversation-insights.css','word-help-vocabulary.js','talk-cards-data.js']);
http.createServer((req,res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (!name) {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if (!assets.has(name)) {res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  res.end(fs.readFileSync(path.join(root,'public',name)));
}).listen(8766,'127.0.0.1',()=>console.log('Word Help browser fixture: http://127.0.0.1:8766'));
