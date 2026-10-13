/* Server-only contracts. Verified Workers Free enforcement + atomic local budget. Generation stays disabled. */
const crypto=require('node:crypto');
const BUCKET='dayo-keepsakes', TTL=60, MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const objectPath=v=>typeof v==='string'&&/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/.test(v);
function fail(code){const e=Error(code);e.code=code;return e;}
function requestId({bookingId,actorId,sourceVersion}) {
 const h=crypto.createHash('sha256').update(JSON.stringify([bookingId,actorId,sourceVersion,MODEL])).digest('hex');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
}
async function rpc(db,name,args){const r=await db.rpc(name,args);if(r.error)throw fail('storage_state_unavailable');return r.data;}
// Explicit local/release provisioning step. Never called by request handling.
async function ensurePrivateBucket(db){
 const r=await db.storage.getBucket(BUCKET);
 if(r.error){
  if(String(r.error.statusCode)!=='404')throw fail('bucket_preflight_failed');
  const c=await db.storage.createBucket(BUCKET,{public:false,fileSizeLimit:5242880,allowedMimeTypes:['image/png']});
  if(c.error)throw fail('bucket_creation_failed');
 } else if(r.data.public!==false||Number(r.data.file_size_limit)!==5242880
  ||JSON.stringify(r.data.allowed_mime_types)!=='["image/png"]')throw fail('bucket_configuration_mismatch');
}
// Use a client carrying the VERIFIED participant JWT, never the service-role client.
async function readAsset(participantDb,bookingId,clock=()=>Date.now()){
 if(!uuid(bookingId))throw fail('invalid_request');
 const asset=await rpc(participantDb,'dayo_keepsake_asset',{p_booking_id:bookingId});
 if(!asset)return null;
 if(asset.bucket!==BUCKET||!objectPath(asset.object_path)||!asset.object_path.startsWith(bookingId+'/'))throw fail('invalid_asset');
 const r=await participantDb.storage.from(BUCKET).createSignedUrl(asset.object_path,TTL);
 if(r.error||typeof r.data?.signedUrl!=='string')throw fail('image_access_unavailable');
 const access=new URL(r.data.signedUrl);
 if(access.protocol!=='https:'||!/^[a-z0-9-]+\.supabase\.co$/.test(access.hostname)
   ||decodeURIComponent(access.pathname)!=='/storage/v1/object/sign/'+BUCKET+'/'+asset.object_path)throw fail('image_access_unavailable');
 return {booking_id:bookingId,asset,url:r.data.signedUrl,expires_at:new Date(clock()+TTL*1000).toISOString(),durable:true,firstParty:true};
}
function createContracts({db,participantDb,accountId,verifyFreePlan,clock=()=>Date.now(),manualReview=false}){
 const accountKey=crypto.createHash('sha256').update(String(accountId)).digest('hex');
 const quota={reserve:async data=>{
  if(!/^[a-f0-9]{32}$/.test(String(accountId))||data.model!==MODEL||data.freeOnly!==true
    ||data.maxAttempts!==2||!uuid(data.bookingId)||!uuid(data.actorId))throw fail('quota_unavailable');
  const id=data.requestId||requestId(data);if(!uuid(id))throw fail('invalid_request');
  // Server-only, account-bound dashboard attestation expires after 12 hours.
  // Cloudflare enforces Free exhaustion; this does NOT pretend to know live balance.
  // Missing/stale/paid proof still permits idempotent lookup, never a new attempt.
  let proof=null;try{if(typeof verifyFreePlan==='function')proof=await verifyFreePlan({accountId});}catch(_){ }
  const fresh=proof?.accountId===accountId&&proof.plan==='workers_free'
    &&proof.source==='workers_dashboard'&&proof.enforcedFreeLimit===true
    &&Number.isFinite(Date.parse(proof.verifiedAt))&&Date.parse(proof.verifiedAt)<=clock()
    &&clock()-Date.parse(proof.verifiedAt)<=12*60*60*1000;
  return rpc(db,manualReview?'dayo_keepsake_reserve_review':'dayo_keepsake_reserve',{p_booking_id:data.bookingId,p_actor_id:data.actorId,
   p_request_id:id,p_source_version:data.sourceVersion,p_account_key:accountKey,
   p_plan:fresh?'workers_free':null,p_verified_at:fresh?proof.verifiedAt:null,
   p_proof_day:fresh?new Date(clock()).toISOString().slice(0,10):null,p_remaining_neurons:null});
 },fail:async({token,actorId,code})=>rpc(db,'dayo_keepsake_finish',{
  p_token:token,p_actor_id:actorId,p_failure_code:code})};
 const storage={read:bookingId=>readAsset(participantDb,bookingId,clock),put:async data=>{
  const r=await db.from('keepsake_illustration_attempts').select('id,booking_id,actor_id,state,object_path')
    .eq('id',data.reservationToken).single();const a=r.data;
  if(r.error||!a||a.state!=='reserved'||a.booking_id!==data.bookingId||a.actor_id!==data.actorId
    ||!objectPath(a.object_path)||!a.object_path.startsWith(data.bookingId+'/')
    ||data.contentType!=='image/png'||!Buffer.isBuffer(data.bytes)||!data.bytes.length||data.bytes.length>5242880)throw fail('save_failed');
  const upload=await db.storage.from(BUCKET).upload(a.object_path,data.bytes,{contentType:'image/png',upsert:false,cacheControl:'0'});
  if(upload.error)throw fail('save_failed');
  await rpc(db,'dayo_keepsake_finish',{p_token:a.id,p_actor_id:data.actorId,p_failure_code:null});
  return readAsset(participantDb,data.bookingId,clock);
 }};
 if(manualReview)storage.reviewStatus=async({bookingId,actorId,token})=>{
  const r=await db.from('keepsake_illustration_attempts').select('id,booking_id,actor_id,state,review_state').eq('id',token).single(),a=r.data;
  if(r.error||!a||a.booking_id!==bookingId||a.actor_id!==actorId)throw fail('image_access_unavailable');
  return {booking_id:bookingId,attempt_id:a.id,status:a.review_state==='pending'&&a.state==='ready'?'pending_review':a.review_state==='approved'&&a.state==='ready'?'approved':a.review_state==='rejected'?'rejected':a.review_state==='revoked'?'revoked':a.state==='reserved'?'generation_pending':'failed',url:null};
 };
 if(manualReview)storage.putPending=async data=>{
  const r=await db.from('keepsake_illustration_attempts').select('id,booking_id,actor_id,state,object_path').eq('id',data.reservationToken).single(),a=r.data;
  if(r.error||!a||a.state!=='reserved'||a.booking_id!==data.bookingId||a.actor_id!==data.actorId||!objectPath(a.object_path)||!a.object_path.startsWith(data.bookingId+'/')||data.contentType!=='image/png'||!Buffer.isBuffer(data.bytes)||!data.bytes.length||data.bytes.length>3145728)throw fail('save_failed');
  const uploaded=await db.storage.from(BUCKET).upload(a.object_path,data.bytes,{contentType:'image/png',upsert:false,cacheControl:'0'});
  if(uploaded.error)throw fail('save_failed');
  return rpc(db,'dayo_keepsake_stage',{p_token:a.id,p_actor_id:data.actorId,p_sha256:crypto.createHash('sha256').update(data.bytes).digest('hex')});
 };
 return {quota,storage};
}
// Bounded batches; caller schedules this server-side after rollout approval. Removal
// is through Storage API, NOT SQL deletion of storage.objects metadata.
async function cleanup(db,{limit=20}={}){
 let removed=0;for(let i=0;i<Math.min(20,Math.max(0,limit));i++){
  const job=await rpc(db,'dayo_keepsake_cleanup_claim',{});if(!job)break;
  if(!uuid(job.token)||!objectPath(job.object_path))throw fail('invalid_cleanup_job');
  let r;try{r=await db.storage.from(BUCKET).remove([job.object_path]);}catch(_){break;}
  if(r.error)break; // Tombstone stays queued; no budget/attempt refund.
  await rpc(db,'dayo_keepsake_cleanup_done',{p_token:job.token});removed++;
 }return {removed};
}
function makeClient({env,jwt,service=false,fetchImpl=fetch,signal}){
 const url=String(env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL||'').trim().replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');
 const key=service?env.SUPABASE_SERVICE_ROLE_KEY:env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key||(!service&&!jwt))throw fail('image_access_unavailable');
 const {createClient}=require('@supabase/supabase-js');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:'Bearer '+(service?key:jwt)},fetch:(url,opts)=>fetchImpl(url,{...opts,
   signal:AbortSignal.any([opts?.signal,signal,AbortSignal.timeout(30000)].filter(Boolean))})}});
}
const participantClient=options=>makeClient(options);
const serviceClient=options=>makeClient({...options,service:true});
module.exports={serviceClient,BUCKET,TTL,createContracts,readAsset,cleanup,ensurePrivateBucket,participantClient,requestId};
