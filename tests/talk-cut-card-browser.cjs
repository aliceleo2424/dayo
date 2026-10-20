'use strict';
// "대화 한 컷" recap card (public/story-bonus.js): new name/copy and the shared friend picture chosen by topic.
// Real story-bonus.js + story-scenes-data.js; Supabase reads are stubbed; nothing is saved.
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict'), { chromium } = require('playwright');
const root = path.resolve(__dirname, '..', 'public'), out = process.argv[2] || '';
const page = interest => '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
  '<div id="quiz-content-box"></div><script>' +
  'window.openQuizModalImmediately=function(){document.getElementById("quiz-content-box").innerHTML="<p>recap</p>";};' +
  'window.DayORoomAccess={allowed:true,role:"user",bookingId:"b1",userId:"u1",language:"en"};' +
  'function q(data){var o={select:function(){return o;},eq:function(){return o;},maybeSingle:function(){return Promise.resolve({data:data.single});},then:function(r,j){return Promise.resolve({data:data.list}).then(r,j);}};return o;}' +
  'window.supabaseClient={auth:{},from:function(t){return t==="bookings"?q({single:{conversation_brief:{interests:["' + interest + '"]}}}):q({list:[]});}};' +
  '</script><script src="/story-scenes-data.js"></script><script src="/story-bonus.js"></script></body></html>';
(async () => {
  const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(page(u.searchParams.get('i'))); }
    const f = path.join(root, decodeURIComponent(u.pathname)); if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', { '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [interest, pic] of [['travel', 'street'], ['food_cafe', 'cafe'], ['exercise', 'park'], ['drama', 'home']]) {
      const p = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [], missing = [];
      p.on('pageerror', e => errors.push(e.message)); p.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
      await p.goto(base + '/?i=' + interest);
      await p.evaluate(() => window.openQuizModalImmediately());
      const entry = p.locator('[data-story-entry]'); await entry.waitFor();
      assert.match(await entry.locator('h4').textContent(), /대화 한 컷/);
      assert.doesNotMatch(await entry.textContent(), /책장/, 'card no longer mentions the bookshelf');
      await p.click('[data-story-start]');
      const img = p.locator('.dsb-img'); await img.waitFor();
      assert.match(await img.getAttribute('src'), new RegExp('images/talk-cut/' + pic + '\\.webp$'), interest + ' -> ' + pic);
      await p.waitForFunction(() => { const i = document.querySelector('.dsb-img'); return i && i.complete && i.naturalWidth > 0; });
      if (out && interest === 'travel') await p.screenshot({ path: path.join(out, 'talkcut-card.png') });
      assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      await p.close();
    }
    console.log('PASS 대화 한 컷 card: renamed copy without bookshelf wording; topic picture travel->street, food_cafe->cafe, exercise->park, other->home; images load; no errors');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
