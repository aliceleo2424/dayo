/* Disabled server-only adapter. No transcript/Letter content reaches the provider.
 * Activation requires approved durable quota reservation and image storage.
 * Neither is replaced by browser/session memory or temporary/data URLs. */
const fs = require('node:fs/promises');
const path = require('node:path');
const letter = require('./partner-letter.js');
const contract = require('../../public/partner-report-contract.js');
const testRuntime = require('./keepsake-test-runtime.js');
const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const REFERENCE = path.join(__dirname, '../_assets/dayo-watercolor-reference-511.png');
const STYLE = 'Use image 0 only for watercolor and colored-pencil technique, textured ivory paper, muted sage, beige and warm brown. Simple adult editorial vignette, softly fading edges and generous ivory space. Do not copy reference subjects or composition. No people, human faces, text, logos, visible watermark, photorealism, cartoon mascot, 3D or neon. Subjects from separate topics are symbolic motifs, not events or objects physically together. ';
function failure(code) { const e = Error(code); e.code = code; return e; }
async function generate({theme, env, fetchImpl=fetch, signal}) {
 if (!contract.illustrationKey(theme)) throw failure('unsupported_concept');
 const account=String(env.CLOUDFLARE_ACCOUNT_ID||'').trim(), token=String(env.CLOUDFLARE_API_TOKEN||'').trim();
 if(!/^[a-f0-9]{32}$/.test(account)||!token)throw failure('provider_unavailable');
 const reference=await fs.readFile(REFERENCE), form=new FormData();
 form.append('prompt',STYLE+contract.illustrationConcept(theme));
 form.append('width','1024');form.append('height','1024');
 form.append('input_image_0',new Blob([reference],{type:'image/png'}),'style-reference.png');
 const timeout=AbortSignal.timeout(30000);
 let response;
 try {response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+MODEL,{method:'POST',headers:{Authorization:'Bearer '+token},body:form,signal:signal?AbortSignal.any([signal,timeout]):timeout});}
 catch(_){throw failure(timeout.aborted||signal?.aborted?'timeout':'provider_request_failed');}
 if(!response.ok)throw failure(response.status===429?'quota_unavailable':'provider_http_error');
 let json;try {json=await response.json();}catch(_){throw failure('invalid_image');}
 const encoded=json?.result?.image;
 if(json.success===false||typeof encoded!=='string'||!encoded.length||encoded.length>7*1024*1024||! /^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw failure('invalid_image');
 const bytes=Buffer.from(encoded,'base64');
 if(!bytes.length||bytes.length>5*1024*1024)throw failure('invalid_image');
 // Decode, validate dimensions/format and strip metadata using the existing sharp dependency.
 const sharp=require('sharp');let metadata,clean;
 try {metadata=await sharp(bytes,{limitInputPixels:1024*1024}).metadata();if(!['png','jpeg','webp'].includes(metadata.format)||metadata.width!==1024||metadata.height!==1024||(metadata.pages||1)!==1)throw Error('format');clean=await sharp(bytes,{limitInputPixels:1024*1024}).png().toBuffer();}catch(_){throw failure('invalid_image');}
 return {bytes:clean,contentType:'image/png',model:MODEL};
}
async function handle({input,read,user,env,signal,fetchImpl, enabled=false, testOnly=true, quota, storage}) {
 // Only the allowlisted server TEST runtime may enable generation. UI remains disabled.
 if(!enabled)return {status:503,body:{error:'generation_disabled'}};
 if(input.request_id!=null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.request_id))return {status:400,body:{error:'invalid_request'}};
 if(input.action!=='partner_illustration_generate'||Object.keys(input).some(k=>!['action','booking_id','topic_id','source_version','request_id'].includes(k)))return {status:400,body:{error:'invalid_request'}};
 const denied=await testRuntime.authorize({input,read,user});if(denied)return denied;
 const source=await letter.handle({input:{action:'partner_letter_topics',booking_id:input.booking_id},read,user,env,signal});
 if(source.status!==200)return source;
 if(testOnly){
  const rows=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,
    partner_user_id:'eq.'+user.id,select:'id,partner_user_id,is_test_session',limit:'1'}));
  if(!Array.isArray(rows)||!rows.some(b=>b.id===input.booking_id&&b.partner_user_id===user.id&&b.is_test_session===true))
    return {status:403,body:{error:'test_booking_required'}};
 }
 if(input.source_version!==source.body.source_version)return {status:409,body:{error:'canonical_revision_changed'}};
 // All motifs come from server-verified exact-booking evidence, never client prompt/theme.
 const themes=contract.storyIllustrations(source.body.topics), theme=themes[0]?.theme;
 if(!theme)return {status:200,body:{status:'insufficient_evidence',url:null}};
 if(!quota||typeof quota.reserve!=='function'||!storage||typeof storage.put!=='function')return {status:503,body:{error:'durable_storage_and_quota_required'}};
 // Required future contract: atomic, persistent per-booking idempotency + at most two
 // attempts, and account-wide free-only budget. A rejected/uncertain claim never calls AI.
 let claim;try {claim=await quota.reserve({bookingId:input.booking_id,actorId:user.id,sourceVersion:source.body.source_version,model:MODEL,requestId:input.request_id,maxAttempts:2,estimatedNeurons:110,freeOnly:true});}catch(_){return {status:503,body:{error:'quota_unavailable'}};}
 if(claim?.reused===true){
  if(claim.state==='ready'&&typeof storage.read==='function'){
   try{const saved=await storage.read(input.booking_id);if(saved)return {status:200,body:{status:'ready',...saved,model:MODEL}};}catch(_){}
   return {status:503,body:{error:'image_access_unavailable'}};
  }
  return {status:409,body:{error:claim.state==='reserved'?'generation_pending':'attempt_already_used'}};
 }
 if(claim?.allowed===false&&claim.error)return {status:409,body:{error:['attempt_limit','generation_pending','free_allowance_unverified','daily_budget_exhausted'].includes(claim.error)?claim.error:'generation_not_reserved'}};
 if(!claim||claim.plan!=='workers_free'||claim.allowed!==true||!Number.isInteger(claim.attempt)||claim.attempt<1||claim.attempt>2||typeof claim.token!=='string'||!claim.token)return {status:409,body:{error:'generation_not_reserved'}};
 try {
  const image=await generate({theme,env,signal,fetchImpl});
  const saved=await storage.put({bookingId:input.booking_id,actorId:user.id,reservationToken:claim.token,...image});
  // Private durable asset reference and short-lived access URL; never persist the signed URL. Adapter never writes Letter/Recap fields.
  if(!saved||saved.durable!==true||saved.firstParty!==true||typeof saved.url!=='string'||!/^https:\/\//.test(saved.url))throw failure('save_failed');
  return {status:200,body:{status:'ready',...saved,model:MODEL}};
 }catch(e){
  const code=['timeout','provider_unavailable','provider_request_failed','quota_unavailable','provider_http_error','invalid_image','save_failed'].includes(e.code)?e.code:'save_failed';
  try{if(typeof quota.fail==='function')await quota.fail({token:claim.token,actorId:user.id,code});}catch(_){/* Reserved attempt remains consumed; cleanup reconciles interrupted saves. */}
  return {status:502,body:{error:code}};
 }
}
module.exports={handle,MODEL,REFERENCE};
