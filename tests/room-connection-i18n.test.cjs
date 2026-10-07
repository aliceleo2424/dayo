const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/room.html'), 'utf8');
const live = fs.readFileSync(path.join(root, 'public/room-live.js'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'public/i18n.js'), 'utf8');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const brace = source.indexOf('{', start);
  let depth = 1, end = brace + 1;
  while (depth && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  return source.slice(start, end);
}
const functions = ['setConnectionCopy','waitingDetail','showRemotePending','hideRemotePending','showRemoteAudioUnlock','clearRemotePresentation','endParticipantCall','scheduleRemoteRecovery','retryParticipantConnection'];
const harness = `
var remoteConnectionState = document.getElementById('remoteConnectionState');
var remoteConnectionDetail = document.getElementById('remoteConnectionDetail');
var remoteReconnectButton = document.getElementById('remoteReconnectButton');
var currentRole = 'learner', isObserver = false, remotePendingSince = 0;
var remoteConnectionDelayTimer = 0, remoteRetryActionTimer = 0, remoteHealthTimer = 0;
var activeCall = null, partnerCaptions = null, hostCallConnecting = false, hostCallConnected = false;
var destroyed = false, peer = null, currentRemoteStream = null, remoteVideo = null;
var scheduled = [], peersCreated = 0;
function scheduleHostCall(delay) { scheduled.push(delay); }
function createParticipantPeer() { peersCreated++; }
function participantCallNeedsRecovery() { return true; }
${functions.map(name => extract(html,name)).join('\n')}
${['t','preflightNode','setPreflightConnectionCheck','setPreflightCheck'].map(name=>extract(live,name)).join('\n')}
`;
const fixtureHTML = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
function text(win,id) { return win.document.getElementById(id).textContent; }
async function main() {
  for (const file of ['room.html','room-live.js','i18n.js']) {
    assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'), fs.readFileSync(path.join(root,'public',file),'utf8').replace(/\r\n/g,'\n'), file+' mirror');
  }
  for (const [role, lang] of [['partner','EN'],['learner','KO'],['learner','EN']]) {
    const dom = new JSDOM(fixtureHTML, {url:'https://www.dayotalk.com/room?bookingId=fixture',runScripts:'outside-only'});
    const w = dom.window;
    w.eval(i18n); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); w.DayOI18n.setLang(lang, false);
    const timers = new Map(); let serial=0;
    w.setTimeout = (fn, delay) => { timers.set(++serial,{fn,delay});return serial; };
    w.clearTimeout = id => timers.delete(id);
    w.eval(harness); w.currentRole=role;
    const run = delay => { const pair=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(pair, 'timer '+delay);timers.delete(pair[0]);pair[1].fn(); };
    const expected = key => w.DayOI18n.t('room.connection.'+key,lang);
    w.showRemotePending(w.waitingDetail());
    assert.equal(text(w,'remoteConnectionTitle'),expected('connecting'));
    assert.equal(text(w,'remoteConnectionDetail'),expected(role==='partner'?'waitingOther':'wait'));
    run(12000); run(25000);
    assert.equal(text(w,'remoteConnectionTitle'),expected('delayedTitle'));
    assert.equal(text(w,'remoteConnectionDetail'),expected('delayedBody'));
    assert.equal(text(w,'remoteReconnectButton'),expected('reconnect'));
    assert.equal(w.remoteReconnectButton.hidden,false);
    assert.equal(w.remoteReconnectButton.dataset.action,'reconnect');
    w.DayOI18n.setLang(lang==='EN'?'KO':'EN',false);
    assert.equal(text(w,'remoteConnectionDetail'),w.DayOI18n.t('room.connection.delayedBody'));
    w.DayOI18n.setLang(lang,false);
    let destroyedPeer=0; w.peer={destroy(){destroyedPeer++;}};
    w.retryParticipantConnection();
    assert.equal(text(w,'remoteConnectionDetail'),expected('retrying'));
    if(role==='partner'){ assert.equal(destroyedPeer,1);run(400);assert.equal(w.peersCreated,1); }
    else assert.deepEqual(Array.from(w.scheduled),[0]);
    let closed=0; const call={close(){closed++;}};w.activeCall=call;
    w.scheduleRemoteRecovery(call,'peer-failed');
    assert.equal(text(w,'remoteConnectionDetail'),expected('recovering'));
    run(3500);assert.equal(closed,1);
    assert.equal(text(w,'remoteConnectionDetail'),expected(role==='partner'?'waitingOther':'wait'));
    w.showRemoteAudioUnlock();
    assert.equal(w.remoteReconnectButton.dataset.action,'audio');
    assert.equal(text(w,'remoteReconnectButton'),expected('enableAudio'));
    for(const [id,key] of [['devicePreflightCamera','cameraReady'],['devicePreflightCamera','cameraUnavailable'],['devicePreflightCamera','cameraPermission'],['devicePreflightMic','micReady'],['devicePreflightMic','micUnavailable'],['devicePreflightMic','micDetected'],['devicePreflightMic','micInputUnavailable'],['devicePreflightMic','micPermission']]) {
      w.setPreflightConnectionCheck(id,'room.connection.'+key,'is-warn');
      assert.equal(text(w,id),expected(key));
      w.DayOI18n.setLang(lang==='EN'?'KO':'EN',false);
      assert.equal(text(w,id),w.DayOI18n.t('room.connection.'+key));
      w.DayOI18n.setLang(lang,false);
    }
    w.hideRemotePending();assert.equal(w.remoteConnectionState.hidden,true);
    dom.window.close();
    console.log('PASS '+role+' '+lang+' waiting/delay/retry/recovery/disconnect/audio/media/locale');
  }
  const browser = await chromium.launch({channel:process.env.DAYO_QA_BROWSER_CHANNEL || 'chrome',headless:true});
  try {
    for (const width of [390,1440]) for (const [role,lang] of [['partner','EN'],['learner','KO'],['learner','EN']]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.route('**/*',route=>route.abort());
      await page.setContent(fixtureHTML);
      await page.addScriptTag({content:i18n});
      await page.addScriptTag({content:harness});
      await page.evaluate(({role,lang})=>{
        currentRole=role;document.body.setAttribute('data-dayo-role',role);
        document.body.classList.toggle('partner-mode',role==='partner');
        DayOI18n.setLang(lang,false);showRemotePending(waitingDetail());
        setConnectionCopy(document.getElementById('remoteConnectionTitle'),'room.connection.delayedTitle');
        setConnectionCopy(remoteConnectionDetail,'room.connection.delayedBody');
        remoteReconnectButton.hidden=false;setConnectionCopy(remoteReconnectButton,'room.connection.reconnect');
        document.getElementById('devicePreflight').hidden=true;
      },{role,lang});
      const bounds=await page.locator('#remoteConnectionState').boundingBox();
      assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=width+1,'status fits '+width);
      const button=await page.locator('#remoteReconnectButton').boundingBox();
      assert.ok(button && button.x>=bounds.x && button.x+button.width<=bounds.x+bounds.width+1,'button fits');
      assert.equal(await page.locator('#remoteConnectionState').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'text fits');
      await page.close();console.log('PASS layout '+role+' '+lang+' '+width);
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
