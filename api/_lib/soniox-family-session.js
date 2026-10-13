'use strict';
const crypto=require('node:crypto');
const MAX_SECONDS=1500,START_TTL_SECONDS=60,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function fail(code){const e=Error(code);e.code=code;return e;}
async function mint({reservation,key,fetchImpl=fetch,clock=Date.now}){
 if(!reservation?.reserved||!UUID.test(reservation.reservation_id||'')||!['learner','partner'].includes(reservation.role)||!Number.isInteger(reservation.max_seconds)||reservation.max_seconds<1||reservation.max_seconds>MAX_SECONDS||!key)throw fail('invalid_grant');
 const ref=crypto.createHmac('sha256',key).update(reservation.reservation_id).digest('hex').slice(0,24);
 let response;try{response=await fetchImpl('https://api.soniox.com/v1/auth/temporary-api-key',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({usage_type:'transcribe_websocket',single_use:true,expires_in_seconds:START_TTL_SECONDS,max_session_duration_seconds:reservation.max_seconds,client_reference_id:'dayo-session-'+ref}),signal:AbortSignal.timeout(7000)});}catch(error){throw fail(['AbortError','TimeoutError'].includes(error.name)?'provider_timeout':'provider_unavailable');}
 if(!response.ok)throw fail('provider_unavailable');let grant;try{grant=await response.json();}catch(_){throw fail('invalid_grant');}
 const expires=Date.parse(grant?.expires_at);if(typeof grant?.api_key!=='string'||!grant.api_key.startsWith('snx_temp_')||grant.api_key.length>4096||!Number.isFinite(expires)||expires<=clock()||expires>clock()+65000)throw fail('invalid_grant');
 return {api_key:grant.api_key,expires_at:grant.expires_at};
}
module.exports={MAX_SECONDS,START_TTL_SECONDS,UUID,mint};
