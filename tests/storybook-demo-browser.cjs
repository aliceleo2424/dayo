'use strict';
// Original-concept storybook demo (/storybook-demo): library with one sample story open without login,
// four more that open when a session exists; each story = 4 scenes of piece ordering with blur-to-reveal art,
// Korean toggle, check button, pink wrong pieces, punchline/idiom, next-conversation question, shelf.
// Static page served from public/; nothing is saved.
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict'), { chromium } = require('playwright');
const root = path.resolve(__dirname, '..', 'public');
async function play(page, story, wrongFirst) {
  await page.click('#start');
  for (let s = 0; s < 4; s++) {
    const pieces = story.scenes[s].pieces;
    assert.ok(pieces.length >= 4 && pieces.length <= 7, story.id + ' scene ' + (s + 1) + ' piece count');
    assert.equal(await page.locator('#pool .chip').count(), pieces.length);
    assert.match(await page.locator('#scene-art').getAttribute('src'), new RegExp(story.id + '/scene-' + (s + 1) + '\\.webp$'));
    assert.equal(await page.locator('#scene-art').evaluate(e => e.classList.contains('blur')), true, 'art blurred before solving');
    assert.equal(await page.locator('#check').isDisabled(), true, 'check disabled until all pieces placed');
    if (wrongFirst && s === 0) {
      await page.click('#ko-btn'); assert.equal(await page.locator('#ko-box').isVisible(), true, 'Korean toggle'); await page.click('#ko-btn');
      for (const t of [...pieces].reverse()) await page.locator('#pool .chip').filter({ hasText: t }).first().click();
      await page.click('#check');
      assert.ok(await page.locator('#answer .chip.wrong').count() > 0, 'wrong pieces marked pink');
      assert.equal(await page.locator('#reveal').isVisible(), false, 'wrong order does not reveal');
      await page.click('#reset-btn');
    }
    for (const t of pieces) await page.locator('#pool .chip').filter({ hasText: t }).first().click();
    await page.click('#check');
    await page.locator('#reveal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ko-box').textContent(), story.scenes[s].ko);
    assert.equal(await page.locator('#scene-art').evaluate(e => e.classList.contains('clear')), true, 'art revealed');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no overflow');
    await page.click('#next');
  }
  await page.locator('#done').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#next-q').textContent(), story.question);
  assert.equal(await page.locator('.spine').count(), 5);
}
(async () => {
  const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); const f = path.join(root, decodeURIComponent(u.pathname));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [width, signed] of [[360, false], [390, false], [1280, false], [390, true]]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 } });
      if (signed) await ctx.addInitScript(() => localStorage.setItem('sb-mmhapsimcngmtefqfrcg-auth-token', JSON.stringify({ access_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u' } })));
      const page = await ctx.newPage(), errors = [], missing = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) missing.push(r.url()); });
      await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      await page.goto(base + '/storybook-demo.html');
      const stories = await page.evaluate(() => window.DayOStorybookDemo.stories);
      assert.equal(stories.length, 5);
      assert.equal(await page.locator('#books .book').count(), 4);
      if (!signed) {
        assert.equal(await page.locator('#books .book.locked').count(), 4, 'other stories locked without login');
        await page.locator('#books .book').first().click();
        assert.equal(await page.locator('#login-box').isVisible(), true, 'locked story asks to log in');
        assert.equal(await page.locator('#intro').isVisible(), false);
        await page.click('#sample-start');
        await play(page, stories[0], width === 390);
      } else {
        assert.equal(await page.locator('#books .book.locked').count(), 0, 'all stories open when signed in');
        for (const s of stories.slice(1)) {
          await page.locator('#books .book[data-story="' + s.id + '"]').click();
          await play(page, s, false);
          await page.locator('#done [data-to-library]').click();
        }
        assert.equal(await page.locator('#books .done-mark').count(), 4, 'finished stories marked');
      }
      assert.deepEqual(errors, []); assert.deepEqual(missing.filter(u => !/\/fonts\//.test(u)), []);
      await ctx.close();
    }
    console.log('PASS storybook demo: sample story open without login, 4 locked until signed in; all 5 stories x 4 scenes play (blur reveal, Korean toggle, check button, pink wrong pieces, punchline, idiom, next question, shelf); 360/390/1280 no overflow, no errors, all images load');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
