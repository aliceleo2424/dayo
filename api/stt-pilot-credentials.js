'use strict';
// Existing protected pilot route; no service-role key or canonical writes.
const crypto=require('node:crypto');
const {MAX_SECONDS,START_TTL_SECONDS,BRANCH,OWNERS,UUID,mintCredential,publicAuthConfig,probeConnection}=require('./_lib/soniox-pilot-allocation.js');
function reply(res,status,body) {
  res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Pragma','no-cache');
  res.setHeader('Vary','Origin, Authorization');res.setHeader('Access-Control-Allow-Origin','null');
  res.end(JSON.stringify(body));
}
function config(env) {
  const suppliedUrl=env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
  const auth=suppliedUrl&&env.NEXT_PUBLIC_SUPABASE_ANON_KEY?{url:suppliedUrl,anon:env.NEXT_PUBLIC_SUPABASE_ANON_KEY}:publicAuthConfig();
  return {
  enabled:env.DAYO_SONIOX_TEST_ENABLED==='1',preview:env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===BRANCH,
  host:env.VERCEL_URL,branchHost:env.VERCEL_BRANCH_URL,key:env.SONIOX_API_KEY,booking:env.DAYO_SONIOX_TEST_BOOKING,
  url:String(auth.url).replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,''),
  anon:auth.anon,budget:Number(env.DAYO_SONIOX_PROJECT_BUDGET_USD),
  verifiedAt:Date.parse(env.DAYO_SONIOX_LIMITS_VERIFIED_AT)
};}
function safeOrigin(req,c) {try {const u=new URL(req.headers.origin);return u.protocol==='https:'&&(u.host===c.host||(c.branchHost==='dayo-git-codex-soniox-owner-pilot-aliceleo2424s-projects.vercel.app'&&u.host===c.branchHost))&&/\.vercel\.app$/.test(u.hostname)&&u.hostname!=='dayo-black.vercel.app';}catch(_){return false;}}
function captureWindow(booking,now) {const start=Date.parse(booking&&booking.scheduled_at),end=start+25*60000;return Number.isFinite(start)&&now>=start&&now<end-70000?{end,duration:Math.min(MAX_SECONDS,Math.floor((end-now-70000)/1000))}:null;}
async function request(fetchImpl,url,options) {
  const r=await fetchImpl(url,{...options,signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw new Error('upstream_unavailable');return r.json();
}
function createHandler({env=process.env,fetchImpl=fetch,clock=Date.now,probeImpl=probeConnection}={}) {return async(req,res)=>{
  const c=config(env),now=clock();
  if(req.method!=='POST')return reply(res,405,{error:'post_required'});
  // Hard target/branch gate, independent of feature flags. Production never mints.
  if(!c.preview)return reply(res,403,{error:'exact_protected_preview_required'});
  if(!c.enabled||!c.key||!c.url||!c.anon||!c.host||!UUID.test(c.booking||''))return reply(res,503,{error:'pilot_not_configured'});
  if(!safeOrigin(req,c))return reply(res,403,{error:'protected_test_origin_required'});
  if(!Number.isFinite(c.budget)||c.budget<=0||c.budget>2||!Number.isFinite(c.verifiedAt)||c.verifiedAt>now||now-c.verifiedAt>12*3600000)
    return reply(res,503,{error:'project_budget_unverified'});
  const authorization=String(req.headers.authorization||'');
  if(!/^Bearer\s+\S+$/i.test(authorization))return reply(res,401,{error:'sign_in_required'});
  let body=req.body;
  try {if(typeof body==='string'){if(Buffer.byteLength(body)>2048)return reply(res,413,{error:'request_too_large'});body=JSON.parse(body);}}
  catch(_){return reply(res,400,{error:'invalid_request'});}
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['action','consent','bookingId'].includes(k)))return reply(res,400,{error:'invalid_request'});
  const action=body.action||'start';
  if(!['state','start','probe'].includes(action)||action==='start'&&body.consent!==true)return reply(res,403,{error:'explicit_start_and_consent_required'});
  if(body.bookingId!==undefined&&!UUID.test(body.bookingId||''))return reply(res,400,{error:'invalid_request'});
  if(body.bookingId!==c.booking)return reply(res,403,{error:'allowlisted_test_booking_required'});
  let reservation,headers,reserveAttempted=false;
  const rpc=async args=>request(fetchImpl,c.url+'/rest/v1/rpc/dayo_soniox_pilot_allocation',{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(args)
  });
  try {
    headers={apikey:c.anon,Authorization:authorization};
    const user=await request(fetchImpl,c.url+'/auth/v1/user',{headers}),role=user&&OWNERS[user.id];
    if(!user||user.is_anonymous===true||!role)return reply(res,403,{error:'pilot_owner_required'});
    let captureEndsAt=clock()+MAX_SECONDS*1000,scheduledAt;
    // One explicitly authorized sibling booking only; its normal booking flag is unchanged.
    if(body.bookingId){
      const q=new URLSearchParams({id:'eq.'+body.bookingId,select:'id,learner_id,partner_user_id,status,scheduled_at,is_test_session',limit:'1'});
      const rows=await request(fetchImpl,c.url+'/rest/v1/bookings?'+q,{headers});
      const b=Array.isArray(rows)&&rows.find(x=>x.id===body.bookingId),window=captureWindow(b,clock());
      if(!b||b[role==='partner'?'partner_user_id':'learner_id']!==user.id||b.learner_id!==Object.keys(OWNERS)[0]||b.partner_user_id!==Object.keys(OWNERS)[1]||b.status!=='confirmed'||(action==='start'&&!window))
        return reply(res,409,{error:'outside_authorized_test_window'});
      scheduledAt=b.scheduled_at;
      if(action==='start'){
      const state=await request(fetchImpl,c.url+'/rest/v1/rpc/get_room_session_state',{
        method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_booking_id:body.bookingId})
      });
      if(!state||state.success!==true||state.booking_id!==body.bookingId||state.participant_id!==user.id||state.role!==role||state.session_ended!==false)
        return reply(res,409,{error:'session_not_active'});
      captureEndsAt=window.end;
      }
    }
    // Verify existing provider concurrency guard before consuming a slot.
    const limits=await request(fetchImpl,'https://api.soniox.com/v1/concurrency-limits',{headers:{Authorization:'Bearer '+c.key}});
    if(limits?.project?.limits?.transcribe_concurrent!==2)return reply(res,503,{error:'provider_concurrency_guard_unverified'});
    if(action==='state'){
      const state=await rpc({p_action:'state'});
      if(!state||state.role!==role||typeof state.available!=='boolean')throw new Error('invalid_state');
      return reply(res,200,{...state,model:'stt-rt-v5',singleUse:true,startExpirySeconds:START_TTL_SECONDS,maxSessionSeconds:MAX_SECONDS,bookingId:c.booking,scheduledAt,canonicalPilot:true,providerAuthenticationVerified:true});
    }
    if(action==='probe'){
      // Verify caller's durable owner binding; never reserve or mint.
      const state=await rpc({p_action:'state'});
      if(state?.role!==role)throw new Error('invalid_state');
      try{return reply(res,200,{...await probeImpl({masterKey:c.key}),allocationConsumed:false});}
      catch(error){return reply(res,502,{error:/^probe_[a-z0-9_]+$/.test(error.code||'')?error.code:'probe_unavailable',allocationConsumed:false});}
    }
    const requestId=crypto.randomUUID();
    reserveAttempted=true;
    reservation=await rpc({p_action:'reserve',p_reservation_id:requestId});
    if(reservation?.reserved===false&&reservation.error==='allocation_consumed')return reply(res,409,{error:'allocation_consumed',allocationConsumed:true});
    if(reservation?.reserved!==true)throw new Error('invalid_reservation');
    if(reservation.reservation_id!==requestId||reservation.role!==role)throw new Error('invalid_reservation');
    // The RPC transaction committed before this ONE provider POST. No retries.
    let grant;
    try {grant=await mintCredential({reservation,role,masterKey:c.key,fetchImpl,clock});}
    catch(error){
      const code=['provider_timeout','provider_unavailable','invalid_grant'].includes(error.code)?error.code:'provider_unavailable';
      try{await rpc({p_action:'finish',p_reservation_id:requestId,p_outcome:'failed',p_failure_code:code});}catch(_){}
      return reply(res,502,{error:code,allocationConsumed:true});
    }
    const recorded=await rpc({p_action:'finish',p_reservation_id:requestId,p_outcome:'issued',p_expires_at:grant.expires_at});
    if(recorded?.updated!==true)return reply(res,503,{error:'allocation_confirmation_unavailable',allocationConsumed:true});
    if(Date.parse(grant.expires_at)<=clock())return reply(res,503,{error:'credential_expired',allocationConsumed:true});
    // Runtime response only: never in a build artifact, table, log or cache.
    return reply(res,200,{...grant,role,bookingId:body.bookingId||null,model:'stt-rt-v5',captureEndsAt,
      maxSessionSeconds:MAX_SECONDS,startExpirySeconds:START_TTL_SECONDS,singleUse:true,languages:['en','ko','es']});
  }catch(_){
    // A lost reservation/finish acknowledgment never authorizes another mint.
    return reply(res,502,{error:'pilot_auth_or_allocation_unavailable',allocationConsumed:reservation?.reserved===true?true:reserveAttempted?null:false});
  }
};}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.captureWindow=captureWindow;
