'use strict';
// Server-only just-in-time mint. Caller must FIRST commit the atomic reservation.
const crypto = require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const MAX_SECONDS = 1500, START_TTL_SECONDS = 60;
const BRANCH = 'codex/soniox-owner-pilot';
const PILOT_BOOKING = 'cfb91da5-991b-48d9-b86f-a7e912cb8ed4';
const OWNERS = Object.freeze({
  'c4552202-cafd-4ab5-bbf9-5a23719edf44':'learner',
  '1bc0eab5-9399-4da8-a90c-145ab0c4409d':'partner'
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let publishedAuth;
function publicAuthConfig(){
  if(publishedAuth)return publishedAuth;
  try{
    // Reuse only the already-published Auth URL/key; no env pull or secret copy.
    const box={window:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../public/supabase-env.js'),'utf8'),box,{timeout:50});
    const e=box.window.__DAYO_ENV__||{};
    publishedAuth={url:e.NEXT_PUBLIC_SUPABASE_URL||'',anon:e.NEXT_PUBLIC_SUPABASE_ANON_KEY||''};
  }catch(_){publishedAuth={url:'',anon:''};}
  return publishedAuth;
}
function failure(code) { const e = new Error(code); e.code = code; return e; }
async function mintCredential({reservation,role,masterKey,fetchImpl=fetch,clock=Date.now}) {
  if (!reservation || reservation.reserved!==true || reservation.role!==role ||
      !UUID.test(reservation.reservation_id||'') || !['learner','partner'].includes(role) || !masterKey)
    throw failure('invalid_grant');
  const reference=crypto.createHmac('sha256',masterKey).update('dayo-soniox-owner-v1:'+reservation.reservation_id).digest('hex').slice(0,24);
  let response;
  try {
    response=await fetchImpl('https://api.soniox.com/v1/auth/temporary-api-key',{
      method:'POST',headers:{Authorization:'Bearer '+masterKey,'Content-Type':'application/json'},
      body:JSON.stringify({usage_type:'transcribe_websocket',single_use:true,
        expires_in_seconds:START_TTL_SECONDS,max_session_duration_seconds:MAX_SECONDS,client_reference_id:'dayo-pilot-'+reference}),
      signal:AbortSignal.timeout(7000)
    });
  } catch (error) { throw failure(error&&['TimeoutError','AbortError'].includes(error.name)?'provider_timeout':'provider_unavailable'); }
  if (!response.ok) throw failure('provider_unavailable');
  let grant;try { grant=await response.json(); } catch (_) { throw failure('invalid_grant'); }
  const expires=grant&&Date.parse(grant.expires_at),now=clock();
  if (!grant || typeof grant.api_key!=='string' || !grant.api_key.startsWith('snx_temp_') ||
      grant.api_key.length>4096 || !Number.isFinite(expires) || expires<=now || expires>now+65000)
    throw failure('invalid_grant');
  // Only transient response memory. No file/env/table/cache/log storage.
  return {api_key:grant.api_key,expires_at:grant.expires_at};
}
// Owner-triggered server-only probe: no temporary credential, allocation or audio.
function probeConnection({masterKey,Socket=WebSocket,timeoutMs=9000}) {
 return new Promise((resolve,reject)=>{
  let socket,done=false,total=0;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);if(socket)socket.close();
   if(error)reject(failure(error));else resolve({authenticated:true,model:'stt-rt-v5',audioSentBytes:0,audioProcessedMs:total});};
  const timer=setTimeout(()=>finish('probe_timeout'),Math.min(timeoutMs,10000));
  try {socket=new Socket('wss://stt-rt.soniox.com/transcribe-websocket',['soniox-api-key',masterKey]);}
  catch(_){finish('probe_connection_failed');return;}
  socket.onopen=()=>{socket.send(JSON.stringify({model:'stt-rt-v5',audio_format:'pcm_s16le',sample_rate:16000,num_channels:1,
   language_hints:['en','ko','es'],enable_language_identification:true,enable_endpoint_detection:true}));socket.send('');};
  socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(_){return finish('probe_invalid_response');}
   total=Math.max(total,Number(m.total_audio_proc_ms)||0);
   if(total>0||(m.tokens||[]).some(t=>t.text&&!/^<.*>$/.test(t.text)))return finish('probe_unexpected_audio');
   if(m.error_code){if(m.error_code===400&&m.error_message==='No audio received.')return finish();return finish('probe_provider_'+Number(m.error_code));}
   if(m.finished)finish();};
  socket.onerror=()=>finish('probe_connection_failed');socket.onclose=()=>{if(!done)finish('probe_closed_unconfirmed');};
 });
}
module.exports={MAX_SECONDS,START_TTL_SECONDS,BRANCH,OWNERS,PILOT_BOOKING,UUID,mintCredential,publicAuthConfig,probeConnection};
