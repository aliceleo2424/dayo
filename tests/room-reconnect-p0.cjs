// Deterministic error-path reproduction using the actual room functions; no live calls.
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),assert=require('node:assert/strict');
const {functions}=require('./room-recap-ui-fixture.cjs');
const current=fs.readFileSync('public/room.html','utf8'),old=cp.execFileSync('git',['show','168bfbd:public/room.html'],{encoding:'utf8'});
class E {constructor(){this.handlers={};}on(k,f){(this.handlers[k]||=[]).push(f);}addEventListener(k,f){this.on(k,f);}emit(k,v){for(const f of this.handlers[k]||[])f(v);}}
function setup(source){let now=0,serial=0;const tasks=new Map(),calls=[],ids=[];
 class Peer extends E{constructor(){super();this.open=true;}call(){const c=new E();c.peer='partner-peer';c.peerConnection=new E();c.peerConnection.connectionState='connecting';c.close=()=>c.emit('close');calls.push(c);return c;}destroy(){}reconnect(){}}
 const ctx={console:{log(){},warn(){}},setTimeout(f,ms){tasks.set(++serial,{f,at:now+ms});return serial;},clearTimeout(id){tasks.delete(id);},Peer,
 currentRole:'user',isObserver:false,destroyed:false,peer:null,localStream:{},activeCall:null,hostCallConnecting:false,hostCallConnected:false,hostCallTimer:0,hostCallAttempts:0,
 participantPeerId:'user-peer',participantPeerRetryAttempts:0,participantPeerRetryTimer:0,remoteHealthTimer:0,remoteConnectTimer:0,currentRemoteStream:null,boundRemoteTracks:new WeakSet(),audioDiagnostics:null,
 HOST_ID:'partner-peer',window:{},partnerCaptions:{bindPeer(){},setRemotePeer(id){ids.push(id);}},bindSessionPeerHelpers(){},peerOptions(){return{}},bindCallIceTelemetry(){},
 showRemotePending(){},hideRemotePending(){},waitingDetail(){return 'wait'},clearRemotePresentation(){ctx.currentRemoteStream=null;},resumeRemotePlayback(){},schedulePartnerPeerRetry(){}};
 const names=['remoteAudioHealthy','participantCallNeedsRecovery','endParticipantCall','scheduleRemoteRecovery','bindParticipantCallHealth','callHostPeer','scheduleHostCall','createParticipantPeer'];
 if(source.includes('function watchParticipantConnect('))names.push('watchParticipantConnect');vm.createContext(ctx);vm.runInContext(functions(Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),m=>m[1]).join('\n'),names),ctx);ctx.createParticipantPeer();ctx.callHostPeer('partner-peer');
 return {ctx,calls,ids,advance(ms){const end=now+ms;let n=0;while(true){const due=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(++n>100)throw Error('timer loop');now=due[1].at;tasks.delete(due[0]);due[1].f();}now=end;}};
}
for(const [source,fixed]of[[old,false],[current,true]]){
 let h=setup(source);h.ctx.peer.emit('error',{type:'peer-unavailable'});h.advance(2000);assert.equal(h.calls.length,fixed?2:1,'peer-unavailable unlocks active call');
 h=setup(source);h.advance(13000);assert.equal(h.calls.length,fixed?2:1,'no-stream call expires and retries');
 if(fixed){
  assert.equal(h.ids[0],'partner-peer','captions connect before media stream');
  h=setup(source);const first=h.ctx.activeCall;first.peerConnection.connectionState='failed';first.peerConnection.emit('connectionstatechange');h.advance(4400);assert.equal(h.calls.length,2,'failed ICE recovered before first stream');
  h=setup(source);h.ctx.activeCall.__dayoRemoteStreamSeen=true;h.ctx.currentRemoteStream={getAudioTracks:()=>[{readyState:'live',muted:false}]};h.advance(13000);assert.equal(h.calls.length,1,'healthy media is untouched by timeout');
  h=setup(source);h.ctx.destroyed=true;h.advance(20000);assert.equal(h.calls.length,1,'no retry after session teardown');
 }
}
console.log('PASS confirmed baseline deadlock reproduction and fixed peer-unavailable/no-stream/failed ICE retries; caption channel before stream; healthy calls and ended sessions unchanged. Virtual network/clock, no real-session success claimed.');
