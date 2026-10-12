const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = process.env.DAYO_MOBILE_ROOT || path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'public/room.html'), 'utf8');
const viewport = room.slice(room.indexOf('    const mainStage ='), room.indexOf('    var savedChat ='));
const panels = room.slice(room.indexOf('    function openChat()'), room.indexOf('    /* Talk cards data + UI */'));
const prompter = room.slice(room.indexOf('(function partnerQuestionPrompter()'), room.indexOf('</script>', room.indexOf('(function partnerQuestionPrompter()')));
const html = room.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const baseline = process.argv.includes('--baseline'), shots = process.env.DAYO_MOBILE_SCREENSHOTS;
async function main() {
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    if (!name) return res.end(html);
    if (['i18n.js', 'conversation-insights.css'].includes(name)) return res.end(fs.readFileSync(path.join(root, 'public', name)));
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], measurements = [];
  try {
    for (const role of ['user', 'partner']) for (const locale of ['KO', 'EN']) for (const width of [360, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.addScriptTag({ url: 'http://127.0.0.1:' + server.address().port + '/i18n.js' });
      await page.evaluate(({ role, locale }) => {
        document.body.classList.remove('theme-learner', 'theme-partner');
        document.body.classList.add('room-access-granted', role === 'partner' ? 'theme-partner' : 'theme-learner');
        window.DayOI18n.setLang(locale);
        window.DayORoomAccess = { allowed: true, role, language: 'en', bookingId: 'fixture' };
        const visual = new EventTarget(); Object.assign(visual, { height: 844, offsetTop: 0, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { value: visual, configurable: true });
        window.fixtureViewport = (height, top = 0) => { visual.height = height; visual.offsetTop = top; visual.dispatchEvent(new Event('resize')); visual.dispatchEvent(new Event('scroll')); };
        window.fixtureSends = 0;
        window.fetch = async () => ({ ok: true, json: async () => ({ questions: Array.from({ length: 3 }, (_, i) => ({
          en: `${i + 1}. What did you enjoy about this synthetic conversation topic? ` + 'A long readable question for scrolling. '.repeat(8),
          ko: '이 테스트 주제에서 어떤 점이 좋았나요? '.repeat(10) })) }) });
        document.getElementById('chatMessages').innerHTML = Array.from({ length: 25 }, (_, i) => `<div class="bubble bubble--tutor">Test message ${i + 1}</div>`).join('');
        document.getElementById('talkCardQuestion').textContent = 'A long question for the existing Talk Card layout. '.repeat(8);
        document.getElementById('talkCardFollowups').innerHTML = Array.from({ length: 12 }, () => '<div class="talk-card-followup">A readable follow-up question for scrolling.</div>').join('');
      }, { role, locale });
      await page.addScriptTag({ content: `
        function t(key){return window.DayOI18n.t(key)}
        function closeSheet(){document.getElementById('wordSheetOverlay').classList.remove('active')}
        function ensureChatChannel(){return null}
        function canControlTalkCards(){return false} function isLearnerCardViewer(){return false}
        function markTalkCardVisible(){} function flushTalkCardEvents(){}
        function appendMessageToChatUI(){}
        var chatSending=false,talkCardState={updatedAt:0};
        function canonicalChat(){return {send:async function(text){window.fixtureSends++;window.fixtureSentText=text;return {id:'synthetic',booking_id:'fixture'}}}}
        ${viewport}\n${panels}\n${prompter}
      ` });
      const rects = async () => page.evaluate(() => {
        const result = { height: visualViewport.height, top: visualViewport.offsetTop, font: getComputedStyle(document.getElementById('chatInput')).fontSize,
          keyboard: document.body.classList.contains('dayo-keyboard-open'), overflow: document.documentElement.scrollWidth > innerWidth };
        for (const [name, selector] of Object.entries({ toolbar: '.bottom-bar', timer: '#timer', video: '#videoStage', drawer: '#sideDrawer', chat: '#chatPanel',
          form: '#chatForm', send: '.chat-send', close: '#chatClose', talk: '#talk-card-panel', talkClose: '#talkCardClose', question: '#partner-topic-card', content: '#partner-topic-content', refresh: '#partner-question-refresh', ask: '#btn-partner-ask' })) {
          const node = document.querySelector(selector), r = node.getBoundingClientRect();
          result[name] = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, visible: !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' };
        }
        return result;
      });
      const inside = (r, name, min = 1) => { const x = r[name]; assert.ok(x.visible && x.height >= min && x.top >= r.top - 1 && x.bottom <= r.top + r.height + 1 && x.left >= 0 && x.right <= width + 1, `${role}/${locale}/${width} ${name}: ${JSON.stringify(r)}`); };
      await page.locator('#chatToggle').click();
      let r = await rects(); measurements.push({ role, locale, width, state: 'chat', ...r });
      if (!baseline) { ['toolbar', 'timer', 'video', 'form', 'send', 'close', 'chat'].forEach(name => inside(r, name)); assert.ok(parseFloat(r.font) >= 16); assert.equal(r.overflow, false); }
      await page.locator('#chatMessages').evaluate(node => { node.scrollTop = node.scrollHeight; });
      assert.ok(await page.locator('#chatMessages').evaluate(node => node.scrollTop > 0));
      await page.locator('#chatInput').fill('Keep the existing send behavior.');
      await page.evaluate(() => window.fixtureViewport(400, 55));
      r = await rects(); measurements.push({ role, locale, width, state: 'ios-keyboard', ...r });
      if (!baseline) { ['toolbar', 'timer', 'video', 'form', 'send', 'close'].forEach(name => inside(r, name)); assert.equal(r.keyboard, true); assert.equal(r.overflow, false);
        assert.ok(await page.locator('.chat-send svg').count()); assert.equal(await page.locator('.chat-send').getAttribute('aria-label'), locale === 'KO' ? '전송' : 'Send'); }
      if (!baseline) assert.ok(await page.locator('#chatMessages').evaluate(node => node.clientHeight >= 24), 'Keyboard mode must retain a scrollable message area');
      if (shots && !baseline) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `keyboard-${role}-${locale}-${width}.png`), clip: { x: 0, y: 55, width, height: 400 } }); }
      await page.locator('.chat-send').click();
      await page.waitForFunction(() => window.fixtureSends === 1);
      assert.equal(await page.evaluate(() => window.fixtureSentText), 'Keep the existing send behavior.');
      assert.equal(await page.locator('#chatInput').inputValue(), '');
      await page.locator('#chatInput').focus();
      await page.setViewportSize({ width, height: 400 });
      await page.evaluate(() => window.fixtureViewport(400));
      r = await rects(); if (!baseline) ['toolbar', 'timer', 'video', 'form', 'send', 'close'].forEach(name => inside(r, name));
      await page.locator('#chatClose').click();
      assert.notEqual(await page.evaluate(() => document.activeElement.id), 'chatInput');
      await page.setViewportSize({ width, height: 600 });
      await page.evaluate(() => window.fixtureViewport(600));
      await page.locator('#chatToggle').click();
      r = await rects(); if (!baseline) ['toolbar', 'timer', 'video', 'form', 'send', 'close'].forEach(name => inside(r, name));
      if (!baseline && role === 'partner') inside(r, 'ask');
      await page.locator('#chatClose').click();
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => window.fixtureViewport(844));
      await page.locator('#btn-talk-cards').click();
      assert.equal(await page.locator('#chatPanel').isVisible(), false);
      r = await rects(); if (!baseline) ['toolbar', 'timer', 'video', 'talk', 'talkClose'].forEach(name => inside(r, name));
      if (!baseline) assert.equal(await page.locator('.talk-card-question').evaluate(node => node.scrollHeight <= node.clientHeight + 1), true, 'Long question must not escape its card');
      await page.locator('.talk-card-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
      assert.ok(await page.locator('.talk-card-body').evaluate(node => node.scrollTop > 0));
      if (!baseline) {
        await page.locator('.talk-card-body').evaluate(node => { node.scrollTop = 0; });
        await page.locator('.talk-card-body').hover(); await page.mouse.wheel(0, 500);
        await page.waitForFunction(() => document.querySelector('.talk-card-body').scrollTop > 0);
      }
      await page.locator('#talkCardClose').click();
      assert.equal(await page.locator('#talk-card-panel').isVisible(), false);
      await page.locator('#chatToggle').click(); await page.locator('#chatClose').click();
      assert.equal(await page.locator('#chatPanel').isVisible(), false);
      if (role === 'partner') {
        await page.locator('#btn-partner-ask').click();
        await page.waitForFunction(() => document.querySelectorAll('#partner-topic-content .partner-topic-item').length === 3);
        r = await rects(); measurements.push({ role, locale, width, state: 'next-question', ...r });
        if (!baseline) ['toolbar', 'timer', 'video', 'question', 'refresh'].forEach(name => inside(r, name));
        await page.locator('#partner-topic-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
        assert.ok(await page.locator('#partner-topic-content').evaluate(node => node.scrollTop > 0));
        if (!baseline) {
          r = await rects(); assert.ok(r.content.bottom <= r.refresh.top + 1 && r.question.bottom <= r.toolbar.top + 1);
          inside(r, 'content');
          if (shots) await page.screenshot({ path: path.join(shots, `question-${locale}-${width}.png`) });
          await page.locator('#partner-question-refresh').click(); await page.waitForFunction(() => !document.getElementById('partner-question-refresh').disabled);
          await page.locator('.partner-topic-header button').click(); assert.equal(await page.locator('#partner-topic-card').isVisible(), false);
          await page.locator('#btn-partner-ask').click(); await page.waitForFunction(() => !document.getElementById('btn-partner-ask').disabled);
        }
        await page.locator('#chatToggle').click(); assert.equal(await page.locator('#partner-topic-card').isVisible(), false);
      }
      if (shots && !baseline) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `${role}-${locale}-${width}.png`) }); }
      if (!baseline) {
        await page.setViewportSize({ width: width === 360 ? 390 : 360, height: 600 });
        await page.evaluate(() => { document.activeElement.blur(); window.fixtureViewport(600); });
        assert.equal(await page.evaluate(() => document.body.classList.contains('dayo-keyboard-open')), false, 'Width/orientation change must not become a stuck keyboard state');
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => window.fixtureViewport(900));
        if (!await page.locator('#chatPanel').isVisible()) await page.locator('#chatToggle').click();
        const desktop = await rects();
        for (const name of ['toolbar', 'timer', 'video', 'form', 'send']) { const v = desktop[name]; assert.ok(v.visible && v.left >= 0 && v.right <= 1280 && v.top >= 0 && v.bottom <= 900, `${role}/${locale} desktop ${name}: ${JSON.stringify(v)}`); }
        if (role === 'partner') {
          await page.locator('#chatClose').click();
          await page.evaluate(() => { window.fetch = async () => ({ ok: true, json: async () => ({ questions: [{ en: 'What did you enjoy?', ko: '어떤 점이 좋았나요?' }, { en: 'What would you try next?', ko: '다음에는 무엇을 해볼까요?' }] }) }); });
          await page.locator('#btn-partner-ask').click(); await page.waitForFunction(() => !document.getElementById('btn-partner-ask').disabled);
          assert.equal(await page.locator('#partner-topic-card').evaluate(node => node.style.display), 'block', 'Desktop Next Question retains its original block layout');
        }
      }
      await page.close();
    }
    assert.deepEqual(errors, []);
    if (baseline) console.log(JSON.stringify(measurements.filter(row => row.width === 360 && row.locale === 'EN'), null, 2));
    else console.log('PASS mobile actual DOM: KO/EN, both roles, 360/390, iOS offset/keyboard viewport, Android-size viewports, icon accessibility/send, internal scroll, panel transitions and Next Question. No real sessions or DB writes.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
