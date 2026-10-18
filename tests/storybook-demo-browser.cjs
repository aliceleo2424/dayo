'use strict';
// Original-concept storybook demo (/storybook-demo): 4 scenes, piece ordering, wrong-order feedback, reveal,
// next-conversation question, bookshelf. Static page served from public/; nothing is saved.
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict'), { chromium } = require('playwright');
const root = path.resolve(__dirname, '..', 'public'), out = process.argv[2] || '';
(async () => {
  const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); let f = path.join(root, decodeURIComponent(u.pathname === '/' ? '/storybook-demo.html' : u.pathname));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [360, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 }), errors = [], missing = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) missing.push(r.url()); });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      await page.goto(base + '/storybook-demo.html');
      if (out && width === 390) await page.screenshot({ path: path.join(out, 'sb-intro.png'), fullPage: true });
      await page.click('#start');
      const story = await page.evaluate(() => window.DayOStorybookDemo.story);
      assert.equal(story.scenes.length, 4);
      for (let s = 0; s < 4; s++) {
        const pieces = story.scenes[s].pieces;
        assert.ok(pieces.length >= 5 && pieces.length <= 7, 'scene ' + (s + 1) + ' has 5-7 pieces');
        assert.equal(await page.locator('#pool .chip').count(), pieces.length);
        assert.match(await page.locator('#scene-art').getAttribute('src'), new RegExp('scene-' + (s + 1) + '\\.webp$'));
        if (s === 0) { // wrong order first: place pieces in reversed order
          for (const t of [...pieces].reverse()) await page.locator('#pool .chip', { hasText: t }).first().click();
          await page.waitForFunction(() => document.getElementById('status').textContent.length > 0);
          assert.equal(await page.locator('#reveal').isVisible(), false, 'wrong order does not reveal');
          await page.click('#reset-btn');
        }
        for (const t of pieces) await page.locator('#pool .chip').filter({ hasText: t }).first().click();
        await page.locator('#reveal').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#ko').textContent(), story.scenes[s].ko);
        assert.equal(await page.locator('#answer').evaluate(e => e.classList.contains('ok')), true);
        if (out && width === 390 && (s === 1 || s === 3)) await page.screenshot({ path: path.join(out, 'sb-scene' + (s + 1) + '.png'), fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no overflow ' + width);
        await page.click('#next');
      }
      await page.locator('#done').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#next-q').textContent(), story.question);
      assert.equal(await page.locator('.spine').count(), 4);
      if (out && width === 390) await page.screenshot({ path: path.join(out, 'sb-done.png'), fullPage: true });
      assert.deepEqual(errors, []); assert.deepEqual(missing.filter(u => !/\/fonts\//.test(u)), []);
      await page.close();
    }
    console.log('PASS storybook demo: 4 square scene images, 5-7 pieces, wrong order gives feedback, reveal ko/punchline/idiom, next-conversation question, shelf; 360/390/1280 no overflow, no errors');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
