// Local browser fixture: actual room guard, telemetry, styles and Guide.
// All identities are fake; no production credentials, media or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const room = read('public/room.html');
const scripts = Array.from(room.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g), m => m[1]);
const guard = scripts.find(s => s.includes('window.DayORoomAccessReady ='));
const telemetry = scripts.find(s => s.includes('window.logSessionEvent ='));
const B = '44444444-4444-4444-8444-444444444444';
const L = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const TL = '131a43d2-8a90-41bb-a17a-2217b1ef283f';
const TP = '1bc0eab5-9399-4da8-a90c-145ab0c4409d';
const BASE = 'bcaf16d718217e02d7a8516b32f77e3936adb967';
const normalize = text => text.replace(/\r/g, '');
const baseline = name => normalize(cp.execFileSync('git', ['show', BASE + ':' + name], { cwd: root, encoding: 'utf8' }));
for (const name of ['room.html','partner-guide.html','partner-pre-session.js','partner-pre-session.css']) {
  assert.deepEqual(fs.readFileSync(path.join(root, 'public', name)), fs.readFileSync(path.join(root, name)), name + ' mirror');
}
// Prove the entire room file has only the approved hook and two asset references.
const withoutHook = normalize(room)
  .replace('  <link rel="stylesheet" href="partner-pre-session.css?v=20261007">\n', '')
  .replace('  <script src="partner-pre-session.js?v=20261007"></script>\n', '')
  .replace(/      function showAccess\(state\) \{\n        if \(state.allowed[\s\S]*?      function publishAccess\(state\) \{/, '      function showAccess(state) {');
assert.equal(withoutHook, baseline('public/room.html'), 'all room code beyond the small gate stays byte-identical');
for (const name of ['public/room-live.js','public/session-lifecycle.js','public/partner-report.js',
  'public/partner-reward.js','public/partner-dashboard.js','public/partner-profile-completion.js',
  'public/conversation-recap.js','public/memory-game.js','public/booking-modal.js','public/ticket-payment.js',
  'public/supabase-client.js','public/profile-store.js']) assert.equal(normalize(read(name)), baseline(name), name + ' unchanged');
const changed = cp.execFileSync('git', ['diff', '--name-only', BASE], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
assert(changed.every(name => /^(public\/)?(room|partner-guide)\.html$/.test(name) || /^(public\/)?partner-pre-session\.(js|css)$/.test(name) || name === 'tests/partner-pre-session-fixtures.cjs'));
for (const script of scripts) if (script.trim()) new Function(script);
new Function(read('public/partner-pre-session.js'));

function fixture() {
  const css = Array.from(room.matchAll(/<style>([\s\S]*?)<\/style>/g), m => '<style>' + m[1] + '</style>').join('');
  const stylesheets = Array.from(room.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g), m => m[0]).filter(tag => !tag.includes('https://')).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}${stylesheets}
    <script>
      const mode=new URLSearchParams(location.search).get('scenario')||'partner';
      const test=mode.startsWith('internal-'), learner=mode==='user'||mode==='internal-user', admin=mode.startsWith('admin-')||mode==='observer';
      const learnerId=test?'${TL}':'${L}',partnerId=test?'${TP}':'${P}';
      const user={id:learner?learnerId:partnerId};
      window.qa={reads:[],rpc:[],ready:0,events:[],storageBefore:null};
      localStorage.setItem('qa-guide-completed-at','2026-10-01T00:00:00Z');
      window.qa.storageBefore=JSON.stringify({...localStorage});
      document.addEventListener('partner_pre_session_checklist_completed',event=>qa.events.push(event.detail));
      window.supabaseClient={auth:{getUser:async()=>({data:{user}})},
        from(table){qa.reads.push(table);return{select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='profiles'?{role:admin?'admin':learner?'user':'partner'}:
          {id:'${B}',learner_id:mode==='outsider'?'unrelated':learnerId,partner_user_id:mode==='outsider'?'unrelated':partnerId,partner_id:partnerId,status:mode==='denied'?'cancelled':'confirmed',language:'en',scheduled_at:new Date(Date.now()-60000).toISOString()}})}},
        rpc:async(name,args)=>{qa.rpc.push({name,args});if(name==='list_public_partner_profiles')return{data:[]};if(name==='log_session_event')return{data:{success:true,inserted:true}};throw Error('Unexpected mutation '+name);}};
    </script><script src="/partner-pre-session.js"></script><script>${guard}</script><script>${telemetry}</script>
    <script>DayORoomAccessReady.then(access=>{qa.resolved=access;if(access.allowed)qa.ready++;});</script>
    </head><body><div id="room-access-screen"><div class="room-access-box"><h1 id="room-access-title">Checking entry</h1><p id="room-access-message"></p><a href="/">Home</a></div></div><div class="studio">Room starts after entry</div></body></html>`;
}
const server = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (url.pathname === '/fixture') return res.end(fixture());
  const file = path.resolve(root, 'public', '.' + url.pathname);
  if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.html':'text/html; charset=utf-8', '.png':'image/png' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true, ...(process.env.DAYO_QA_BROWSER_CHANNEL ? {channel:process.env.DAYO_QA_BROWSER_CHANNEL} : {})});
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors=[]; page.on('pageerror', error => errors.push(error.message));
    async function go(mode, role='') {
      await page.goto(base + '/fixture?scenario=' + mode + '&bookingId=' + B + '&role=' + role);
    }
    async function pending() {
      await page.locator('dialog[open]').waitFor();
      assert.equal(await page.locator('input[type=checkbox]').count(),5);
      assert.equal(await page.locator('[data-enter]').isDisabled(),true);
      assert.deepEqual(await page.evaluate(()=>[DayORoomAccess.allowed,qa.ready,qa.events.length,qa.rpc.filter(x=>x.name==='log_session_event').length]),[false,0,0,0]);
    }
    async function complete(failTracking=false) {
      const url=page.url();
      for(let i=0;i<5;i++)await page.locator('input[type=checkbox]').nth(i).check();
      assert.equal(await page.locator('[data-enter]').isEnabled(),true);
      await page.locator('input[type=checkbox]').nth(4).uncheck();
      assert.equal(await page.locator('[data-enter]').isDisabled(),true);
      await page.locator('input[type=checkbox]').nth(4).check();
      if(failTracking)await page.evaluate(()=>{const emit=document.dispatchEvent.bind(document);document.dispatchEvent=event=>{if(event.type==='partner_pre_session_checklist_completed')throw Error('fixture analytics failure');return emit(event);};});
      await page.locator('[data-enter]').click();
      await page.waitForFunction(()=>qa.ready===1);
      assert.equal(page.url(),url,'URL unchanged');
      assert.equal(await page.locator('dialog').count(),0);
      assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})===qa.storageBefore),true,'guide completion and other storage preserved');
      const state=await page.evaluate(()=>qa.resolved);
      assert.equal(state.allowed,true);
      if(!state.adminTest){assert.equal(state.bookingId,B);assert.equal(state.roomId,B.replace(/[^a-zA-Z0-9_-]/g,''));}
      if(!failTracking){const events=await page.evaluate(()=>qa.events);assert.equal(events.length,1);assert.equal(events[0].booking_id,state.bookingId||null);assert.equal(events[0].partner_user_id,state.userId);assert(Number.isFinite(Date.parse(events[0].completed_at)));}
      const rpc=await page.evaluate(()=>qa.rpc);
      assert(rpc.every(call=>['list_public_partner_profiles','log_session_event'].includes(call.name)));
      assert(!rpc.some(call=>call.name==='log_session_event'&&call.args.p_event_type==='partner_pre_session_checklist_completed'),'unsupported schema event never written');
    }
    async function layout() {
      const dimensions=await page.evaluate(()=>{const d=document.querySelector('dialog'),b=d.getBoundingClientRect(),enter=d.querySelector('[data-enter]').getBoundingClientRect();return{width:innerWidth,height:innerHeight,left:b.left,right:b.right,bottom:b.bottom,ctaBottom:enter.bottom,ctaTop:enter.top,scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,font:parseFloat(getComputedStyle(d.querySelector('label')).fontSize)};});
      assert(dimensions.left>=0&&dimensions.right<=dimensions.width&&dimensions.bottom<=dimensions.height);
      assert(dimensions.ctaTop>=0&&dimensions.ctaBottom<=dimensions.height,'CTA stays reachable without scrolling the page');
      assert(dimensions.scrollWidth<=dimensions.clientWidth,'no horizontal overflow');assert(dimensions.font>=16);
    }
    for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:390,height:400}]) {
      await page.setViewportSize(viewport);await go('partner');await pending();await layout();
      // Forged submit without completion must remain blocked.
      await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(await page.evaluate(()=>qa.ready),0);
      const output=process.env.DAYO_QA_OUTPUT;
      if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`checklist-${viewport.width}x${viewport.height}.png`)});}
      await complete();
      await page.reload();await pending();await page.locator('[data-cancel]').click();
      await page.waitForFunction(()=>qa.resolved&&qa.resolved.allowed===false);
      assert.deepEqual(await page.evaluate(()=>[qa.ready,qa.events.length,document.querySelectorAll('dialog').length]),[0,0,0]);
      assert.equal(await page.evaluate(()=>document.body.classList.contains('room-access-granted')),false);
      await page.reload();await pending();await page.keyboard.press('Escape');
      await page.waitForFunction(()=>qa.resolved&&qa.resolved.allowed===false);assert.equal(await page.evaluate(()=>qa.ready),0);
    }
    await page.setViewportSize({width:390,height:844});
    for(const mode of ['user','internal-user','admin-user','observer','denied','outsider']) {
      await go(mode,mode==='observer'?'observer':'');await page.waitForFunction(()=>qa.resolved);
      assert.equal(await page.locator('dialog').count(),0,mode+' does not see partner reminder');
      assert.equal(await page.evaluate(()=>qa.events.length),0);
      assert.equal(await page.evaluate(()=>qa.ready),['denied','outsider'].includes(mode)?0:1);
    }
    await go('user','partner');await page.waitForFunction(()=>qa.resolved);
    assert.equal(await page.locator('dialog').count(),0,'partner URL parameter cannot change the verified learner role');
    for(const [mode,role] of [['internal-partner',''],['admin-partner','partner']]) {await go(mode,role);await pending();await complete();}
    await go('partner');await pending();await complete(true);
    // Modal uses the browser's top layer and traps focus.
    await go('partner');await pending();
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true);}
    await page.keyboard.press('Escape');
    await context.route('**/partner-pre-session.js',route=>route.abort());
    await go('partner');await page.waitForFunction(()=>qa.resolved);
    assert.equal(await page.evaluate(()=>qa.ready),0,'missing checklist asset fails closed');
    assert.equal(await page.evaluate(()=>DayORoomAccess.allowed),false);
    await context.unroute('**/partner-pre-session.js');
    for(const viewport of [{width:390,height:844},{width:1280,height:800}]) {
      await page.setViewportSize(viewport);await page.goto(base+'/partner-guide.html');
      for(const id of ['mistakes-title','partner-letter-title','before-conversation-title'])await page.locator('#'+id).scrollIntoViewIfNeeded();
      const text=await page.locator('main').innerText();
      for(const phrase of ['I no have dog.','Yesterday I go shopping.','She very kind.','I like travel Korea.',
        'Wait → Hint → Example','I like cooking.','café near your house','Busan this winter','Train to Busan',
        '2–4 short sentences','Do not copy a starter','Business conversation content must never be shared outside DayO.'])assert(text.includes(phrase),phrase+' rendered');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Guide no horizontal overflow');
      const output=process.env.DAYO_QA_OUTPUT;
      if(output){await page.locator('#mistakes').screenshot({path:path.join(output,`guide-correction-${viewport.width}.png`)});await page.locator('#partner-letter').screenshot({path:path.join(output,`guide-letter-${viewport.width}.png`)});}
    }
    assert.deepEqual(errors,[],'no fixture browser errors');
    await context.close();
    console.log('PASS: partner gate, learners/observers, denied/outsider, admin/TEST roles, all five, forged submit/role, cancellation/Escape, fresh re-entry, unchanged identity/storage, analytics/asset failure, keyboard focus, desktop/390px/short screen, rendered Guide and exact protected-source baseline.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
