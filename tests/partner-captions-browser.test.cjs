/* Real room DOM, production PeerJS wiring and real RTC transport. Synthetic finals;
 * no actual microphone, booking, authentication, transcript or database writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = process.env.DAYO_CAPTION_ROOT || path.join(__dirname, '..');
const room = fs.readFileSync(path.join(root, 'public/room.html'), 'utf8');
const live = fs.readFileSync(path.join(root, 'public/room-live.js'), 'utf8');
const video = room.slice(room.indexOf('(function initDayOPeerVideo()'), room.indexOf('</script>', room.indexOf('(function initDayOPeerVideo()')));
const push = live.slice(live.indexOf('  function pushTranscript'), live.indexOf('  function localTranscriptSpeaker'));
const result = live.slice(live.indexOf('      recognition.onresult ='), live.indexOf('      recognition.onerror ='));
const panels = room.slice(room.indexOf('    function openChat()'), room.indexOf('    function closeMobileAssistPanels'));
const swap = room.slice(room.indexOf('(function initVideoSwap()'), room.indexOf('    const toast', room.indexOf('(function initVideoSwap()')));
const html = room.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const screenshots = process.env.DAYO_CAPTION_SCREENSHOTS;

async function run() {
  const vendor = await fetch('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js');
  assert.equal(vendor.status, 200, 'Existing official PeerJS client must be accessible');
  const peerjs = await vendor.text();
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    if (!name) return res.end(html);
    if (['partner-captions.js', 'conversation-insights.css'].includes(name)) return res.end(fs.readFileSync(path.join(root, 'public', name)));
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const pages = [];
  try {
    const roomId = 'caption_qa_' + Date.now();
    for (const role of ['partner', 'user']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ content: peerjs });
      await page.addScriptTag({ url: 'http://127.0.0.1:' + server.address().port + '/partner-captions.js' });
      await page.evaluate(({ role, roomId }) => {
        document.body.classList.add('room-access-granted', role === 'partner' ? 'theme-partner' : 'theme-learner');
        window.DayORoomAccess = { allowed: true, role, roomId, bookingId: '11111111-1111-4111-8111-111111111111',
          userId: role === 'partner' ? 'fixture-partner' : 'fixture-user', partnerId: 'fixture-partner', learnerId: 'fixture-user', language: 'en', wordHelpTargetLanguage: 'en' };
        window.DayORoomAccessReady = Promise.resolve(window.DayORoomAccess);
        window.DayOI18n = { t: key => key, getLang: () => document.documentElement.lang.toUpperCase() };
        window.__dayoUsePeerJS = true;
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
        canvas.getContext('2d').fillRect(0, 0, 64, 48);
        const stream = canvas.captureStream(1);
        const audio = new AudioContext(), destination = audio.createMediaStreamDestination(), tone = audio.createOscillator();
        tone.connect(destination); tone.start(); destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        window.localMediaStream = stream; window.fixtureAudio = audio; window.fixtureTone = tone;
        const ActualPeer = window.Peer;
        window.Peer = class extends ActualPeer { constructor(...args) { super(...args); window.fixturePeer = this;
          this.on('connection', conn => { if (conn.label === 'dayo-partner-caption-v1') window.fixtureCaptionConnection = conn; });
        } connect(...args) { const conn = super.connect(...args); if (conn.label === 'dayo-partner-caption-v1') window.fixtureCaptionConnection = conn; return conn; } };
      }, { role, roomId });
      await page.addScriptTag({ content: video });
      await page.waitForFunction(() => window.fixturePeer && window.fixturePeer.open, { timeout: 20000 });
      await page.addScriptTag({ content: `
        var transcriptFinalized=false, transcriptRevision=0, sessionTranscript=[],utteranceSeq=0;
        var recognition={},run={finals:new Set()};
        function uuid(){return 'final-'+(++utteranceSeq)}
        function currentRecognitionRun(){return true}
        function appendTranscriptRowToViewer(){} function backupTranscriptLocal(){}
        function recordSttState(){} function scheduleTranscriptCheckpoint(){} function scheduleCopilot(){}
        function localTranscriptSpeaker(){return window.DayORoomAccess.role==='partner'?'partner':'learner'}
        ${push}\n${result}
        window.fixtureFinal=function(text){var rows=[Object.assign([{transcript:text}],{isFinal:true})];run={finals:new Set()};recognition.onresult({resultIndex:0,results:rows})};
        const mainStage=document.getElementById('mainStage'),chatPanel=document.getElementById('chatPanel'),chatToggle=document.getElementById('chatToggle');
        var talkCardState={updatedAt:0};
        function closeMobileAssistPanels(){} function ensureChatChannel(){} function canControlTalkCards(){return false}
        function markTalkCardVisible(){} function flushTalkCardEvents(){} function isLearnerCardViewer(){return false}
        ${panels}\n${swap}
        chatToggle.onclick=openChat;document.getElementById('btn-talk-cards').onclick=openTalkCardPanel;
      ` });
    }
    const [partner, user] = pages;
    await user.waitForFunction(() => window.fixtureCaptionConnection && window.fixtureCaptionConnection.open, { timeout: 20000 });
    await partner.waitForFunction(() => window.fixtureCaptionConnection && window.fixtureCaptionConnection.open, { timeout: 20000 });
    for (const locale of ['ko', 'en']) {
      await user.evaluate(locale => { document.documentElement.lang = locale; }, locale);
      for (const width of [360, 390, 1280]) {
        await user.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
        const text = `Caption ${locale} ${width}: I enjoy visiting quiet cafés and talking with friends.`;
        await partner.evaluate(text => window.fixtureFinal(text), text);
        await user.waitForFunction(text => document.getElementById('partnerCaptionText').textContent === text, text);
        for (const panel of ['none', 'chat', 'talk', 'none']) {
          if (panel === 'chat') await user.locator('#chatToggle').click();
          else if (panel === 'talk') await user.locator('#btn-talk-cards').click();
          else await user.evaluate(() => { closeChat(); closeTalkCardPanel(); });
          const state = await user.locator('#partnerCaptionText').evaluate(node => {
            const box = node.getBoundingClientRect(), style = getComputedStyle(node);
            return { visible: !node.hidden && !node.parentElement.hidden && style.display !== 'none', clamp: style.webkitLineClamp,
              x: box.x, right: box.right, top: box.top, bottom: box.bottom, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
              exposed: !!document.elementsFromPoint(box.x + 4, box.top + 4).find(el => el === node || el.contains(node)) };
          });
          assert.equal(state.visible, true, `${locale}/${width}/${panel}: visible caption`);
          assert.equal(await user.locator('#partnerCaptionText').isVisible(), true, 'No hidden ancestor/mobile rule');
          assert.equal(state.clamp, '2'); assert.ok(state.height > 0 && state.x >= 0 && state.right <= width && state.top >= 0 && state.bottom <= state.viewportHeight, JSON.stringify(state));
        }
        if (screenshots) { fs.mkdirSync(screenshots, { recursive: true }); await user.screenshot({ path: path.join(screenshots, `caption-${locale}-${width}.png`) }); }
        await user.locator('#partnerCaptionToggle').click();
        assert.equal(await user.locator('#partnerCaptionText').isVisible(), false);
        await partner.evaluate(() => window.fixtureFinal('CC off retains the next final without displaying it.'));
        await user.waitForFunction(() => document.getElementById('partnerCaptionText').textContent === '');
        await user.locator('#partnerCaptionToggle').click();
        await user.waitForFunction(() => document.getElementById('partnerCaptionText').textContent === 'CC off retains the next final without displaying it.');
        await user.evaluate(() => window.fixtureFinal('Learner speech must not replace Partner captions.'));
        assert.equal(await user.locator('#partnerCaptionText').textContent(), 'CC off retains the next final without displaying it.');
      }
    }
    await partner.evaluate(() => window.fixtureFinal('Eight seconds only.'));
    await user.waitForFunction(() => document.getElementById('partnerCaptionText').textContent === 'Eight seconds only.');
    await user.waitForTimeout(8250);
    assert.equal(await user.locator('#partnerCaptionText').isVisible(), false);
    await user.evaluate(() => window.fixtureCaptionConnection.close());
    await user.waitForFunction(() => window.fixtureCaptionConnection.open, { timeout: 12000 });
    await partner.evaluate(() => window.fixtureFinal('The caption channel recovered.'));
    await user.waitForFunction(() => document.getElementById('partnerCaptionText').textContent === 'The caption channel recovered.');
    // Exercise the actual room media-call teardown/retry hooks, not just the helper's channel retry.
    await user.evaluate(() => Object.values(window.fixturePeer.connections).flat().find(conn => conn.type === 'media').close());
    await user.waitForFunction(() => window.fixtureCaptionConnection.open, { timeout: 20000 });
    await partner.waitForFunction(() => window.fixtureCaptionConnection.open, { timeout: 20000 });
    await partner.evaluate(() => window.fixtureFinal('Captions recovered after the room reconnected.'));
    await user.waitForFunction(() => document.getElementById('partnerCaptionText').textContent === 'Captions recovered after the room reconnected.');
    await user.evaluate(() => window.fixturePeer.disconnect());
    await user.waitForFunction(() => window.fixturePeer.open && window.fixtureCaptionConnection.open, { timeout: 20000 });
    await partner.waitForFunction(() => window.fixtureCaptionConnection.open, { timeout: 20000 });
    await partner.evaluate(() => window.fixtureFinal('Signaling reconnect preserves caption delivery.'));
    await user.waitForFunction(() => document.getElementById('partnerCaptionText').textContent === 'Signaling reconnect preserves caption delivery.');
    assert.equal(await user.evaluate(() => window.sessionTranscript.filter(row => row.speaker === 'partner').length), 0);
    await user.evaluate(() => document.dispatchEvent(new CustomEvent('dayo:session-ended')));
    await partner.evaluate(() => window.fixtureFinal('Ended sessions must not show captions.'));
    assert.equal(await user.locator('#partnerCaptionText').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: two browser contexts, real PeerJS media/data signaling; production final → User DOM, role isolation, CC, 8s expiry, reconnect, Cards/Chat and KO/EN 360/390/1280. No DB writes.');
  } finally {
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
