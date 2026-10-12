'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.DAYO_PILOT_ROOT||path.resolve(__dirname,'..');
const {probeConnection}=require(path.join(root,'api/_lib/soniox-pilot-allocation.js'));
(async()=>{
 for(const mode of ['finished','noAudio','auth','model','timeout','unexpectedAudio']){
  let sent=[],closed=false;
  class Socket{constructor(url,protocols){assert.equal(url,'wss://stt-rt.soniox.com/transcribe-websocket');assert.equal(protocols[1],'synthetic-master');setTimeout(()=>this.onopen(),0);}
   send(v){assert.equal(typeof v,'string','probe never sends audio');sent.push(v);if(v==='')setTimeout(()=>{
    if(mode==='timeout')return;
    const m=mode==='finished'?{finished:true,tokens:[],total_audio_proc_ms:0}:mode==='noAudio'?{error_code:400,error_message:'No audio received.'}:mode==='unexpectedAudio'?{tokens:[],total_audio_proc_ms:1}:{error_code:mode==='auth'?401:400,error_message:'private text never returned'};
    this.onmessage({data:JSON.stringify(m)});},0);}
   close(){closed=true;}}
  const p=probeConnection({masterKey:'synthetic-master',Socket,timeoutMs:50});
  if(['finished','noAudio'].includes(mode)){const result=await p;assert.equal(result.audioSentBytes,0);assert.equal(result.audioProcessedMs,0);assert.equal(result.authenticated,true);}
  else await assert.rejects(p,e=>/^probe_/.test(e.code)&&!e.message.includes('private'));
  assert(closed);assert.equal(sent.length,2);assert.equal(sent[1],'');const cfg=JSON.parse(sent[0]);assert.equal(cfg.model,'stt-rt-v5');assert(!cfg.api_key);assert.deepEqual(cfg.language_hints,['en','ko','es']);
 }
 console.log('PASS no-audio probe: authenticated finish/no-audio response; auth/model rejection; bounded timeout; zero binary audio; no credentials returned.');
})().catch(e=>{console.error(e);process.exitCode=1;});
