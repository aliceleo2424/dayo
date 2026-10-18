'use strict';
// Real DOM test for the landing "Emma chat" speaking-sense test inside #quizModal.
// Serves public/ locally, blocks all external requests, mocks SpeechRecognition only.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), pub = path.join(root, 'public');
const OUT = process.env.EMMA_SHOTS || '';

for (const f of ['index.html', 'emma-chat-test.js', 'emma-chat-test.css'])
  assert.deepEqual(fs.readFileSync(path.join(root, f)), fs.readFileSync(path.join(pub, f)), f + ' root/public sync');

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(pub, p);
  if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

const MIC_MOCK = `(() => {
  class FakeRec { constructor(){ this.lang=''; }
    start(){ setTimeout(()=>{ this.onstart&&this.onstart();
      setTimeout(()=>{ const seq=window.__micSeq||(window.__micSeq=['I like','I love strawberry cake']);const said=seq.length>1?seq.shift():seq[0];const r=[{0:{transcript:said},isFinal:true,length:1}]; this.onresult&&this.onresult({results:r});
        setTimeout(()=>{ this.onend&&this.onend(); },30); },60); },20); }
    stop(){ this.onend&&this.onend(); } abort(){} }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
})();`;

async function run() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  let cases = 0;
  try {
    for (const locale of ['KO', 'EN']) for (const width of [360, 390, 430, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 780 : 900 } });
      await ctx.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
      await ctx.addInitScript(MIC_MOCK);
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.DayOEmmaChat && typeof window.openQuizModal === 'function');
      await page.evaluate((l) => { window.DayOI18n && window.DayOI18n.setLang(l, false); }, locale);
      await page.evaluate(() => window.openQuizModal());
      const modal = page.locator('#quizModal');
      assert.equal(await page.locator('#quizLangTabs').isVisible(), false, 'language tabs hidden (English only)');
      const title = await page.locator('#quizTitle').textContent();
      assert.ok(locale === 'KO' ? title.includes('Emma') && title.includes('카톡') : title.includes('Emma just texted'), 'title ' + locale + ' ' + title);
      // start (double tap must not start twice)
      const startBtn = modal.locator('[data-emma-start]');
      await startBtn.click(); await startBtn.click({ force: true }).catch(() => {});
      await modal.locator('.emma-chat').waitFor();
      assert.equal(await modal.locator('.emma-chat').count(), 1, 'one chat');
      // turn 1: use Korean help, then choose mac
      const pickMac = async () => {
        await modal.locator('.emma-choice').first().waitFor();
        const texts = await modal.locator('.emma-choice').allTextContents();
        assert.equal(texts.length, 4, '4 replies');
        const mac = texts.find((t) => /I'm fine, thank you|very happy|wait for you patiently|had been|reasonable choice/.test(t));
        assert.ok(mac, 'macaron option present');
        const btn = modal.locator('.emma-choice', { hasText: mac });
        await btn.click(); await btn.click({ force: true, timeout: 300 }).catch(() => {});
      };
      await modal.locator('.emma-ko').waitFor();
      await modal.locator('.emma-ko').click();
      assert.equal(await modal.locator('.emma-ko').isDisabled(), true, 'korean help once');
      await modal.locator('.emma-help').waitFor({ timeout: 4000 });
      await pickMac(); await pickMac();
      // mic turn (mocked recognition)
      await modal.locator('[data-emma-mic]').waitFor({ timeout: 5000 });
      if (width === 360) { await modal.locator('[data-emma-skip]').click(); }
      else {
        await modal.locator('.emma-ko', { hasText: /디저트|dessert/ }).click();
        await modal.locator('[data-emma-mic]').click();
        await modal.locator('.emma-her', { hasText: 'Hmm? I like… what?' }).waitFor({ timeout: 4000 });
        await modal.locator('[data-emma-mic]').waitFor({ timeout: 4000 });
        assert.equal(await modal.locator('.emma-ko', { hasText: /디저트|dessert/ }).count(), 0, 'mic korean help once');
        await modal.locator('[data-emma-mic]').click();
        await modal.locator('.emma-me', { hasText: 'I love strawberry cake' }).waitFor({ timeout: 4000 });
        await modal.locator('.emma-her', { hasText: 'good choice' }).waitFor({ timeout: 4000 });
      }
      await pickMac(); await pickMac(); await pickMac();
      await modal.locator('.emma-dock .quiz-next-btn').waitFor({ timeout: 6000 });
      await modal.locator('.emma-dock .quiz-next-btn').click();
      await modal.locator('.emma-result-head').waitFor();
      const resText = await modal.locator('.quiz-result').textContent();
      assert.ok(resText.includes(locale === 'KO' ? '마카롱' : 'Macaron'), 'all-macaron picks give macaron');
      assert.ok(resText.includes(width === 360 ? (locale === 'KO' ? '한국어 찬스 1번' : 'Asked in Korean 1×') : (locale === 'KO' ? '한국어 찬스 2번' : 'Asked in Korean 2×')), 'korean help counted');
      const order = await page.evaluate(() => { const q = (s) => document.querySelector('#quizModal ' + s); const pos = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); return pos(q('.emma-result-head'), q('.emma-result-details')) && pos(q('.emma-result-details'), q('#quizLeadCard')) && pos(q('#quizLeadCard'), q('.quiz-topic-grid')); });
      assert.ok(order, 'order: type+Emma → tip+phrases → guidebook → topics');
      assert.equal(await modal.locator('#consentReqDetail').isVisible(), false, 'consent details folded');
      await modal.locator('[aria-controls="consentReqDetail"]').click(); assert.ok(await modal.locator('#consentReqDetail').isVisible(), 'details open');
      await modal.locator('[aria-controls="consentReqDetail"]').click(); assert.equal(await modal.locator('#consentReqDetail').isVisible(), false);
      const all = modal.locator('#guidebook-all'), req = modal.locator('#guidebook-consent'), mkt = modal.locator('#guidebook-marketing');
      assert.equal(await all.isChecked(), false); assert.equal(await mkt.isChecked(), false, 'marketing never pre-checked');
      await all.check(); assert.ok(await req.isChecked() && await mkt.isChecked(), 'agree-all checks both');
      await mkt.uncheck(); assert.equal(await all.isChecked(), false, 'agree-all syncs off'); await all.check(); await all.uncheck(); assert.ok(!(await req.isChecked()) && !(await mkt.isChecked()), 'agree-all off clears both');
      assert.ok(resText.includes(width === 360 ? (locale === 'KO' ? '마이크 미확인' : 'Mic not checked') : (locale === 'KO' ? '마이크 확인 ✓' : 'Mic checked ✓')), 'mic state');
      assert.equal(await modal.locator('.emma-phrases li').count(), 5, '5 phrases');
      // protected neighbours: topic CTA, guidebook lead form, retry
      assert.equal(await modal.locator('[data-quiz-preopen-cta][data-quiz-topic="0"]').count(), 1);
      assert.equal(await modal.locator('#quizLeadForm').count(), 1);
      assert.equal(await modal.locator('#guidebook-consent').count(), 1);
      const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('dayo_speaking_sense_history') || '[]')[0]);
      assert.equal(hist.format, 'emma-chat'); assert.equal(hist.dessert_type, 'mac');
      // layout: no horizontal overflow, submit visible after scroll
      const overflow = await page.evaluate(() => {
        const m = document.querySelector('#quizModal .modal'); return { doc: document.documentElement.scrollWidth - innerWidth, modal: m.scrollWidth - m.clientWidth };
      });
      assert.ok(overflow.doc <= 0 && overflow.modal <= 1, 'no horizontal overflow ' + JSON.stringify(overflow));
      await modal.locator('.email-submit').scrollIntoViewIfNeeded(); assert.ok(await modal.locator('.email-submit').isVisible(), 'submit visible');
      if (OUT) {
        await modal.locator('.emma-type-card').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(OUT, `result-${locale}-${width}.png`) });
      }
      // retry returns to intro; close stops chat
      await modal.locator('.quiz-result-retry').click(); await modal.locator('[data-emma-start]').waitFor();
      await modal.locator('[data-emma-start]').click(); await modal.locator('.emma-chat').waitFor();
      if (OUT && width === 390) { await page.waitForTimeout(1600); await page.screenshot({ path: path.join(OUT, `chat-${locale}-${width}.png`) }); }
      await page.locator('#modalClose').click();
      assert.equal(await page.evaluate(() => document.querySelector('#quizModal').classList.contains('active')), false);
      const relevantErrors = errors.filter((e) => /emma|DayOEmmaChat|quiz/i.test(e));
      assert.deepEqual(relevantErrors, [], 'no quiz/emma page errors');
      await ctx.close(); cases++;
    }
  } finally { await browser.close(); server.close(); }
  console.log(`PASS emma chat test: ${cases} real DOM cases KO/EN × 360/390/430/1280; Korean help, double taps, mic (mocked recognition) + skip, macaron result, phrases, lead form/topic CTA/retry/close preserved, no horizontal overflow. Local static server, external requests blocked; no real mic, no Production writes.`);
}
run().catch((e) => { console.error(e); server.close(); process.exit(1); });
