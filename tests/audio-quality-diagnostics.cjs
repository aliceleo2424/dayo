'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const diag = require('../public/audio-quality-diagnostics.js');
const bookingId = '416220be-3a96-413f-b6d0-4eed3b24b2e9';
const access = { allowed: true, internalTest: true, bookingId, role: 'user' };
const report = (received=100,lost=0,jitter=.005) => new Map([
  ['audio',{ id:'audio',type:'inbound-rtp',kind:'audio',timestamp:received*100,packetsReceived:received,packetsLost:lost,jitter,concealedSamples:lost*480,packetsDiscarded:lost,codecId:'codec',ssrc:999 }],
  ['codec',{id:'codec',type:'codec',mimeType:'audio/opus'}],
  ['transport',{id:'transport',type:'transport',selectedCandidatePairId:'pair'}],
  ['pair',{id:'pair',type:'candidate-pair',state:'succeeded',localCandidateId:'local',remoteCandidateId:'remote',currentRoundTripTime:.09}],
  ['local',{id:'local',type:'local-candidate',candidateType:'relay',protocol:'udp',address:'PRIVATE-IP',url:'SECRET-TURN'}],
  ['remote',{id:'remote',type:'remote-candidate',candidateType:'host',address:'PRIVATE-IP'}]
]);
class Target {
  constructor(){ this.handlers=new Map(); }
  addEventListener(type,fn){ const a=this.handlers.get(type)||[];a.push(fn);this.handlers.set(type,a); }
  removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)||[]).filter(f=>f!==fn));}
  emit(type,event={}){ for(const fn of [...(this.handlers.get(type)||[])]) fn(event); }
  count(){return [...this.handlers.values()].reduce((n,a)=>n+a.length,0);}
}
class PC extends Target {
  constructor(){super();this.connectionState='connected';this.iceConnectionState='connected';this.stats=report();this.calls=0;this.track=new Target();Object.assign(this.track,{kind:'audio',enabled:true,muted:false,readyState:'live'});}
  getStats(){this.calls++;return Promise.resolve(this.stats);}
  getReceivers(){return [{track:this.track}];}
}
function harness(a=access,optIn=true,shared=new Map(),initialClock=1791330000000){
  let clock=initialClock, writes=0;
  const intervals=new Map(),timeouts=new Map();let next=1;
  const timers={setInterval(fn){const id=next++;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);},setTimeout(fn){const id=next++;timeouts.set(id,fn);return id;},clearTimeout(id){timeouts.delete(id);}};
  const doc=new Target();doc.visibilityState='visible';const page=new Target();
  const storage={getItem:k=>shared.get(k),setItem(k,v){writes++;shared.set(k,v);}};
  const collector=diag.create({access:a,optIn,storage,now:()=>clock,timers,document:doc,page});
  return {collector,shared,doc,page,intervals,timeouts,get clock(){return clock;},get writes(){return writes;},tick(){clock+=5000;for(const fn of intervals.values())fn();}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
  // H: opt-in alone cannot enable diagnostics on an ordinary, outsider or observer room.
  for(const a of [{...access,internalTest:false},{...access,allowed:false},{...access,observer:true},{...access,adminTest:true},{...access,role:'admin'}]){
    const h=harness(a),pc=new PC();h.collector.bind(pc);h.tick();assert.equal(pc.calls,0);assert.equal(h.writes,0);assert.equal(h.intervals.size,0);assert.equal(h.doc.count(),0);assert.equal(h.collector.snapshot(),null);
  }
  assert.equal(harness(access,false).collector.enabled,false);
  // A/B/C: normal samples, loss/jitter/concealment changes, direction and signed late-packet correction.
  const h=harness(),pc=new PC();h.collector.bind(pc);await flush();
  let sample=h.collector.snapshot().samples.at(-1);assert.equal(sample.audio[0].packetsReceived,100);assert.equal(sample.audio[0].receivedDelta,null);assert.equal(sample.selectedPair.localType,'relay');assert.equal(sample.selectedPair.rttSeconds,.09);
  pc.stats=report(200,8,.08);h.tick();await flush();sample=h.collector.snapshot().samples.at(-1);assert.equal(sample.audio[0].lostDelta,8);assert.equal(sample.audio[0].jitter,.08);assert.equal(sample.audio[0].concealedSamples,3840);
  pc.stats=report(220,6);h.tick();await flush();assert.equal(h.collector.snapshot().samples.at(-1).audio[0].lostDelta,-2);
  // D/E: mute/unmute and reconnect segment; no track or connection mutations.
  pc.track.muted=true;pc.track.emit('mute');pc.track.muted=false;pc.track.emit('unmute');
  h.collector.event('recovery','audio-muted');const pc2=new PC();h.collector.bind(pc2);await flush();
  assert.equal(h.collector.snapshot().samples.at(-1).segment,2);assert.equal(h.collector.snapshot().samples.at(-1).audio[0].receivedDelta,null);
  const ev=h.collector.snapshot().events;assert(ev.some(e=>e.type==='track_mute'&&e.audioTrack.muted));assert(ev.some(e=>e.type==='track_unmute'&&!e.audioTrack.muted));assert(ev.some(e=>e.type==='recovery'));assert.equal(pc.track.count(),0);assert.equal(pc.connectionState,'connected');assert.equal(pc2.track.enabled,true);
  // F: unavailable fields are null, not fabricated zero. Empty reports and rejection are safe.
  pc2.stats=new Map([['audio',{id:'audio',type:'inbound-rtp',mediaType:'audio'}]]);h.tick();await flush();sample=h.collector.snapshot().samples.at(-1);for(const field of ['packetsLost','jitter','concealedSamples','packetsDiscarded'])assert.equal(sample.audio[0][field],null);assert.equal(sample.selectedPair,null);
  pc2.getStats=()=>Promise.reject(Error('SECRET provider error'));h.tick();await flush();assert(h.collector.snapshot().events.some(e=>e.type==='stats_unavailable'));
  let hungCalls=0;pc2.getStats=()=>{hungCalls++;return new Promise(()=>{});};h.tick();await flush();h.tick();await flush();assert.equal(hungCalls,1);for(const fn of [...h.timeouts.values()])fn();assert(h.collector.snapshot().events.some(e=>e.type==='stats_slow'));
  const pc3=new PC();h.collector.bind(pc3);await flush();assert.equal(pc3.calls,1); // a hung old segment cannot block a new connection
  // Mobile tab suspension/resume; bounded local records, safe settings and no external payload.
  h.doc.visibilityState='hidden';h.doc.emit('visibilitychange');const n=pc3.calls;h.tick();await flush();assert.equal(pc3.calls,n);
  h.doc.visibilityState='visible';h.doc.emit('visibilitychange');await flush();assert.equal(pc3.calls,n+1);
  h.collector.captureLocal({getAudioTracks:()=>[{getSettings:()=>({echoCancellation:true,noiseSuppression:true,autoGainControl:false,sampleRate:48000,deviceId:'SECRET-DEVICE'})}]});assert.equal(h.collector.snapshot().localAudioSettings[0].autoGainControl,false);
  for(let i=0;i<380;i++){h.tick();await flush();}assert.equal(h.collector.snapshot().samples.length,360);
  const json=JSON.stringify(h.collector.snapshot());for(const secret of ['PRIVATE-IP','SECRET-TURN','SECRET-DEVICE','SECRET provider error','ssrc'])assert(!json.includes(secret));assert(json.length<500000);
  // G: refresh restores bounded history but starts a new segment, without DB or lifecycle calls.
  h.page.emit('pagehide');h.collector.destroy();assert.equal(h.intervals.size,0);assert.equal(h.doc.count(),0);assert.equal(pc3.count(),0);
  const fresh=harness(access,true,h.shared,h.clock);fresh.collector.bind(new PC());await flush();assert.equal(fresh.collector.snapshot().samples.at(-1).segment,4);fresh.collector.destroy();
  const partner=harness({...access,role:'partner'});assert.equal(partner.collector.snapshot().direction,'user_to_partner');partner.collector.destroy();
  // I/J: byte-for-byte existing room code after removal of documented hooks; no diagnostic UI/CSS or media/STT writes.
  const room=fs.readFileSync('public/room.html','utf8');const baseline=cp.execFileSync('git',['show','dbebb61a4b97a271e95fbab847fd991ba16fa489:public/room.html'],{encoding:'utf8'});
  const hooks=[
    '  <script src="audio-quality-diagnostics.js?v=20261008-audio-qa"></script>\n',
    '      let audioDiagnostics = null;\n',
    '        if (audioDiagnostics) audioDiagnostics.bind(call && call.peerConnection);\n',
    "        if (audioDiagnostics) audioDiagnostics.detach('closed');\n",
    "            if (audioDiagnostics) audioDiagnostics.event('recovery', reason);\n",
    "          if (audioDiagnostics) audioDiagnostics.event('playback_blocked');\n",
    "            if (audioDiagnostics) audioDiagnostics.event('playback_retry');\n",
    "        if (!audioDiagnostics && window.DayOAudioQualityDiagnostics) {\n          try {\n            audioDiagnostics = window.DayOAudioQualityDiagnostics.create({\n              access: access, optIn: new URLSearchParams(window.location.search).get('audioDiagnostics') === '1',\n              storage: window.sessionStorage, document: document, page: window\n            });\n            if (audioDiagnostics.enabled) window.DayOAudioDiagnostics = audioDiagnostics;\n          } catch (_) { /* QA diagnostics never block room entry */ }\n        }\n",
    '          if (audioDiagnostics) audioDiagnostics.captureLocal(localStream);\n',
    '        if (audioDiagnostics) audioDiagnostics.destroy();\n'
  ];let unchanged=room.replace(/\r\n/g,'\n');for(const hook of hooks){assert(unchanged.includes(hook),'Missing or changed hook');unchanged=unchanged.replace(hook,'');}assert.equal(unchanged,baseline.replace(/\r\n/g,'\n'));
  assert.equal(fs.readFileSync('room.html','utf8'),room);assert.equal(fs.readFileSync('audio-quality-diagnostics.js','utf8'),fs.readFileSync('public/audio-quality-diagnostics.js','utf8'));
  for(const match of room.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
  assert(!fs.readFileSync('public/audio-quality-diagnostics.js','utf8').match(/\b(fetch|XMLHttpRequest|sendBeacon|setParameters|replaceTrack|addTrack|removeTrack|stop)\s*\(/));
  console.log('PASS AUDIO-01 A–J: inbound metrics, loss/jitter, tracks, reconnect, missing/slow stats, refresh, disabled ordinary users, protected room equivalence and no UI changes. Real mobile audio remains pending.');
})().catch(e=>{console.error(e);process.exitCode=1;});
