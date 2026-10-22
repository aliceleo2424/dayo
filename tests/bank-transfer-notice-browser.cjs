'use strict';
// Real DOM test for the bank-transfer notice shown when PortOne is not configured.
// Serves public/ locally, blocks all external requests (so window.IMP never loads).
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), pub = path.join(root, 'public');
const OUT = process.env.BANK_SHOTS || '';

for (const f of ['index.html', 'ticket-payment.js'])
  assert.deepEqual(fs.readFileSync(path.join(root, f)), fs.readFileSync(path.join(pub, f)), f + ' root/public sync');

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const file = path.join(pub, p);
  if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

const PRODUCT = { id: 'trial', name: '첫 세션 체험 할인권', price: 9900, tickets: 1 };
const CONTACT = { contact_email: 'learner@example.com', mobile_phone: '010-1234-5678' };

async function run() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  let cases = 0;
  try {
    for (const locale of ['KO', 'EN']) for (const width of [360, 390, 430, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 780 : 900 } });
      await ctx.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.DayOBankTransfer && typeof window.DayOBankTransfer.show === 'function');
      await page.evaluate((l) => { window.DayOI18n && window.DayOI18n.setLang(l, false); }, locale);

      // PortOne SDK is blocked by the route filter → the bank card path must be active.
      assert.equal(await page.evaluate(() => window.DayOBankTransfer.portoneAvailable()), false, 'PortOne unavailable in test');

      await page.evaluate(([p, c]) => window.DayOBankTransfer.show(p, c), [PRODUCT, CONTACT]);
      const card = page.locator('[data-bank-notice] .bk-card');
      await card.waitFor({ state: 'visible' });
      const text = await card.textContent();
      assert.ok(text.includes('카카오뱅크') && text.includes('3333-3852-49984') && text.includes('여승현'), 'account details shown');
      assert.ok(text.includes('₩9,900') && text.includes(PRODUCT.name), 'product + amount shown');
      assert.ok(locale === 'KO' ? text.includes('영업일 기준 12시간 이내') : text.includes('within 12 business hours'), 'confirmation window ' + locale);
      assert.ok(locale === 'KO' ? text.includes('본인 실명') : text.includes('your real name'), 'depositor rule ' + locale);

      // mailto carries product, amount and the collected contact (no account secrets needed).
      const href = await card.locator('a.bk-primary').getAttribute('href');
      assert.ok(href.startsWith('mailto:hello@dayotalk.com?'), 'mailto target');
      const decoded = decodeURIComponent(href);
      assert.ok(decoded.includes(PRODUCT.name) && decoded.includes('₩9,900') && decoded.includes(CONTACT.contact_email) && decoded.includes(CONTACT.mobile_phone), 'mailto prefilled');

      // Layout: no horizontal overflow, controls tappable, card within viewport.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, 'no horizontal overflow @' + width);
      for (const sel of ['a.bk-primary', 'button.bk-copy', 'button.bk-secondary', 'button.bk-close']) {
        const box = await card.locator(sel).boundingBox();
        assert.ok(box && box.height >= 36 && box.width >= 36, sel + ' tappable @' + width);
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, sel + ' inside viewport @' + width);
      }

      // Copy button: clipboard may be denied in headless → prompt fallback must not throw.
      page.once('dialog', (d) => d.dismiss());
      await card.locator('button.bk-copy').click();

      if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `bank-${locale}-${width}.png`), fullPage: false }); }

      // Close via button, re-open, close via Escape, close via backdrop.
      await card.locator('button.bk-secondary').click();
      await page.locator('[data-bank-notice]').waitFor({ state: 'hidden' });
      await page.evaluate(([p, c]) => window.DayOBankTransfer.show(p, c), [PRODUCT, CONTACT]);
      await card.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('[data-bank-notice]').waitFor({ state: 'hidden' });
      await page.evaluate(([p, c]) => window.DayOBankTransfer.show(p, c), [PRODUCT, CONTACT]);
      await card.waitFor({ state: 'visible' });
      await page.mouse.click(5, 5);
      await page.locator('[data-bank-notice]').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('[data-bank-notice]').count(), 1, 'single overlay node reused');

      assert.deepEqual(errors, [], 'no page errors ' + locale + ' ' + width);
      await ctx.close(); cases++;
    }
  } finally { await browser.close(); server.close(); }
  console.log(`bank-transfer notice: ${cases} cases passed`);
}
run().catch((e) => { console.error(e); process.exit(1); });
