// Render the real room DOM/CSS and Word Help code, without booking, media, STT, or DB writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'public/room.html'), 'utf8');
const helper = room.slice(room.indexOf('/* Bottom sheets */'), room.indexOf('/* Feedback / rating'));
const html = room.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('</body>', `
<div style="position:fixed;top:3px;right:6px;z-index:9999;background:white;font-size:12px;padding:3px">
  Fixture <select id="fixtureLanguage"><option>en</option><option>ko</option><option>es</option><option>fr</option></select>
  <button id="fixtureCard">카드 변경</button><button id="fixtureError">AI 실패 전환</button>
</div>
<script src="/talk-cards-data.js"></script><script src="/word-help-vocabulary.js"></script>
<script>
document.body.classList.add('room-access-granted');
window.DayORoomAccess = {allowed:true,role:'user',bookingId:'fixture-booking',userId:'fixture-user',language:'en'};
window.DayOCurrentTalkCard = window.DayOTalkCards[0];
function closeMobileAssistPanels() {}
function isMobileRoomLayout() { return innerWidth <= 767; }
window.copyHelpText = function() {};
window.logSessionEvent = function(type,payload) { document.body.dataset.lastSource = payload.source; };
var fixtureFail = false;
window.fetch = async function() {
  await new Promise(resolve => setTimeout(resolve, 250));
  return {ok:!fixtureFail,json:async function(){return {words:[{text:'delicious',ko:'맛있는'}],phrases:[{text:'This food is delicious.',ko:'이 음식은 맛있어요.'}]};}};
};
${helper}
document.getElementById('fixtureLanguage').onchange = function() {window.DayORoomAccess.language=this.value;window.syncWordHelpCard();};
document.getElementById('fixtureCard').onclick = function() {window.DayOCurrentTalkCard=window.DayOTalkCards.find(card=>card.category==='culture');window.syncWordHelpCard();};
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
