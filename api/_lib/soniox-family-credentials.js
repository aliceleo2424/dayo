'use strict';
const crypto=require('node:crypto');
const {MAX_SECONDS,START_TTL_SECONDS,UUID,mint}=require('./soniox-family-session.js');
function createHandler({env=process.env,fetchImpl=fetch,clock=Date.now}={}){return async(req,res)=>{
 const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Origin, Authorization');res.end(JSON.stringify(data));};
 if(req.method!=='POST')return send(405,{error:'post_required'});
 let body=req.body;try{if(typeof body==='string'){if(Buffer.byteLength(body)>2048)return send(413,{error:'request_too_large'});body=JSON.parse(body);}}catch(_){return send(400,{error:'invalid_request'});}
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!(body.action==='report'?['action','bookingId','reservationId','stopCode','captureMode','audioFrames','nonSilentFrames','messages','finals']:['action','bookingId']).includes(k))||!['state','start','report'].includes(body.action)||!UUID.test(body.bookingId||''))return send(400,{error:'invalid_request'});
 if(body.action==='report'&&(!UUID.test(body.reservationId||'')||!/^[a-z0-9_]{1,80}$/.test(body.stopCode||'')||!['recorder','worklet'].includes(body.captureMode)||['audioFrames','nonSilentFrames','messages','finals'].some(k=>!Number.isSafeInteger(body[k])||body[k]<0)))return send(400,{error:'invalid_request'});
 const BOOKING=body.bookingId;
 const origin=String(req.headers?.origin||''),origins=['https://www.dayotalk.com','https://dayotalk.com'];if(env.VERCEL_URL)origins.push('https://'+env.VERCEL_URL);
 if(origin&&!origins.includes(origin))return send(403,{error:'origin_not_allowed'});
 const url=String(env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL||'').trim().replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');
 const budget=Number(env.SONIOX_PROJECT_BUDGET_USD||2);
 if(env.SONIOX_ENABLED!=='1'||!env.SONIOX_API_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||!env.NEXT_PUBLIC_SUPABASE_ANON_KEY||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!Number.isFinite(budget)||budget<=0||budget>2)return send(503,{error:'soniox_not_configured'});
 const authorization=String(req.headers?.authorization||'');if(!/^Bearer [A-Za-z0-9._-]+$/.test(authorization))return send(401,{error:'sign_in_required'});
 const read=async(path,headers,options={})=>{const r=await fetchImpl(url+path,{...options,headers,signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('backend_unavailable');return r.json();};
 let reservation,reserveAttempted=false;
 try{
  const headers={apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:authorization};const user=await read('/auth/v1/user',headers);
  if(!UUID.test(user?.id||'')||user.is_anonymous)return send(401,{error:'sign_in_required'});
  const query=new URLSearchParams({id:'eq.'+BOOKING,select:'id,learner_id,partner_user_id,status,scheduled_at',limit:'1'});
  const rows=await read('/rest/v1/bookings?'+query,headers),booking=Array.isArray(rows)&&rows.find(b=>b.id===BOOKING);
  if(!booking||![booking.learner_id,booking.partner_user_id].includes(user.id))return send(403,{error:'not_booking_participant'});
  const role=user.id===booking.learner_id?'learner':'partner';
  // Content-free stop report (codes and counters only); allowed after the session window.
  if(body.action==='report'){const reported=await read('/rest/v1/rpc/dayo_soniox_session_allocation',{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},{method:'POST',body:JSON.stringify({p_action:'report',p_booking_id:BOOKING,p_actor_id:user.id,p_request_id:body.reservationId,p_failure_code:body.stopCode,p_outcome:JSON.stringify({mode:body.captureMode,audioFrames:body.audioFrames,nonSilentFrames:body.nonSilentFrames,messages:body.messages,finals:body.finals}),p_budget_usd:budget})});return send(200,{updated:reported?.updated===true});}
  const scheduled=Date.parse(booking.scheduled_at),end=scheduled+MAX_SECONDS*1000;
  if(booking.status!=='confirmed'||!Number.isFinite(scheduled)||clock()>=end)return send(409,{error:'session_not_active'});
  const state=await read('/rest/v1/rpc/get_room_session_state',{...headers,'Content-Type':'application/json'},{method:'POST',body:JSON.stringify({p_booking_id:BOOKING})});
  if(state?.success!==true||state.booking_id!==BOOKING||state.participant_id!==user.id||state.role!==role||state.session_ended!==false)return send(409,{error:'session_not_active'});
  if(body.action==='start'&&clock()<scheduled)return send(409,{error:'session_not_started',allocationConsumed:false});
  // The existing normal-session ledger is reached only after authenticated booking-participant authorization.
  const serviceHeaders={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  const rpc=args=>read('/rest/v1/rpc/dayo_soniox_session_allocation',serviceHeaders,{method:'POST',body:JSON.stringify({p_booking_id:BOOKING,p_actor_id:user.id,p_budget_usd:budget,...args})});
  const limits=await fetchImpl('https://api.soniox.com/v1/concurrency-limits',{headers:{Authorization:'Bearer '+env.SONIOX_API_KEY},signal:AbortSignal.timeout(7000)});if(!limits.ok)return send(503,{error:'provider_auth_unavailable'});
  const metadata=await limits.json();if(metadata?.project?.limits?.transcribe_concurrent!==2)return send(503,{error:'provider_capacity_unverified'});
  if(body.action==='state'){const allocation=await rpc({p_action:'state'});if(allocation?.role!==role||typeof allocation.available!=='boolean')throw Error('invalid_state');return send(200,{...allocation,bookingId:BOOKING,scheduledAt:booking.scheduled_at,model:'stt-rt-v5',maxSessionSeconds:MAX_SECONDS,startExpirySeconds:START_TTL_SECONDS,singleUse:true,canonical:true,providerAuthenticationVerified:true});}
  const requestId=crypto.randomUUID();reserveAttempted=true;reservation=await rpc({p_action:'reserve',p_request_id:requestId});
  if(reservation?.reserved!==true)return send(409,{error:['project_budget_exhausted','allocation_in_progress'].includes(reservation?.error)?reservation.error:'session_allocation_used',allocationConsumed:!['project_budget_exhausted','allocation_in_progress'].includes(reservation?.error)});
  if(reservation.role!==role||reservation.reservation_id!==requestId)throw Error('invalid_reservation');
  let grant;try{grant=await mint({reservation,key:env.SONIOX_API_KEY,fetchImpl,clock});}catch(error){const code=['provider_timeout','invalid_grant'].includes(error.code)?error.code:'provider_unavailable';try{await rpc({p_action:'finish',p_request_id:requestId,p_outcome:'failed',p_failure_code:code});}catch(_){}return send(502,{error:code,allocationConsumed:true});}
  const recorded=await rpc({p_action:'finish',p_request_id:requestId,p_outcome:'issued',p_expires_at:grant.expires_at});if(recorded?.updated!==true||Date.parse(grant.expires_at)<=clock())return send(503,{error:'allocation_confirmation_unavailable',allocationConsumed:true});
  return send(200,{...grant,role,bookingId:BOOKING,reservationId:requestId,model:'stt-rt-v5',captureEndsAt:end,maxSessionSeconds:reservation.max_seconds,startExpirySeconds:START_TTL_SECONDS,singleUse:true,languages:['en','ko','es']});
 }catch(_){return send(502,{error:'soniox_backend_unavailable',allocationConsumed:reservation?.reserved===true?true:reserveAttempted?null:false});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
