/* Illustration lifecycle is independent of report/reward. No transcript or Letter telemetry. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root&&root.document){root.DayOPartnerIllustration=api.browser(root);}})(typeof window!=='undefined'?window:null,function(){
'use strict';
var KEY='dayo_partner_illustration_jobs_v1',uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function create(o){
 var jobs=new Map(),listeners=new Set(),events=[],now=o.now||Date.now,soft=o.softTimeout||12000,hard=o.hardTimeout||90000;
 function snapshot(j){return j?{bookingId:j.bookingId,token:j.token,theme:j.theme,status:j.status,url:j.status==='ready'||j.status==='saved'?j.url:null,failure:j.failure||null,retryCount:j.retryCount||0,submitted:!!j.submitted}:null;}
 function persist(){try{o.storage.setItem(KEY,JSON.stringify([...jobs.values()].map(j=>({bookingId:j.bookingId,actorId:j.actorId,token:j.token,theme:j.theme,seed:j.seed,url:j.url,startedAt:j.startedAt,status:j.status,failure:j.failure||null,retryCount:j.retryCount||0,submitted:!!j.submitted}))));}catch(_){} }
 try{events=JSON.parse(o.storage.getItem(KEY+'_stages')||'[]').filter(e=>e&&typeof e.stage==='string'&&Number.isFinite(Date.parse(e.at))).map(e=>cleanEvent(e)).slice(-30);}catch(_){}
 function cleanEvent(e){var v={stage:e.stage,at:e.at};['duration_ms','retry_count','status_code'].forEach(k=>{if(Number.isFinite(e[k])&&e[k]>=0)v[k]=e[k];});if(typeof e.concept_key==='string'&&/^[a-z_]{1,40}$/.test(e.concept_key))v.concept_key=e.concept_key;return v;}
 function stage(j,name,error){var event={stage:name,at:new Date(now()).toISOString()};if(j){event.duration_ms=Math.max(0,now()-j.startedAt);event.retry_count=j.retryCount||0;var key=o.contract.illustrationKey(j.theme);if(key)event.concept_key=key;}if(error&&Number.isInteger(error.statusCode)&&error.statusCode>=100&&error.statusCode<=599)event.status_code=error.statusCode;events.push(cleanEvent(event));events=events.slice(-30);try{o.storage.setItem(KEY+'_stages',JSON.stringify(events));}catch(_){}if(o.observe)o.observe(events[events.length-1]);if(j){persist();listeners.forEach(f=>f(snapshot(j)));}}

 function active(j){return !!j&&jobs.get(j.bookingId)===j;}
 function validURL(j){return o.contract.illustrationUrl(j.theme,j.seed)===j.url&&!!j.url;}
 function cancel(j){if(j&&j.cancel)j.cancel();if(j&&j.timer)o.clearTimeout(j.timer);}
 async function attach(j){
  if(!active(j)||!j.submitted||j.status!=='ready')return false;if(j.saving)return j.saving;
  j.saving=(async()=>{try{var actor=await o.auth();if(!active(j)||!actor||actor.id!==j.actorId)return false;
    if(typeof o.exists!=='function'||!await o.exists(j.bookingId))throw Error('report_missing');if(!active(j))return false;
    // Exactly one mutable content field. RPC enforces current booking Partner ownership.
    var result=await o.save(j.bookingId,{illust_url:j.url});if(!active(j))return false;
    if(!result||result.success!==true)throw Error('save');j.status='saved';j.failure=null;stage(j,'saved');return true;
   }catch(_){if(active(j)){j.failure='save_failed';stage(j,'save_failed');}return false;}finally{j.saving=null;}})();return j.saving;
 }
 async function run(j){
  if(!active(j))return;var remaining=hard-(now()-j.startedAt);if(remaining<=0){j.status='failed';j.failure='timeout';stage(j,'timeout');return;}
  j.status='generating';j.failure=null;stage(j,'generation_pending');
  j.timer=o.setTimeout(()=>{if(active(j)&&j.status==='generating'){j.failure='timeout';stage(j,'timeout');}},Math.max(1,soft-(now()-j.startedAt)));
  try{
   var operation=o.load(j.url,remaining);j.cancel=operation.cancel;
   await operation.promise;if(!active(j))return;o.clearTimeout(j.timer);j.status='ready';j.failure=null;stage(j,'generation_ready');await attach(j);
  }catch(error){if(!active(j))return;o.clearTimeout(j.timer);j.status='failed';j.failure=['timeout','image_load_failed','provider_http_error'].includes(error&&error.stage)?error.stage:'provider_request_failed';stage(j,j.failure,error);}
 }
 async function start(input){
  var theme=o.contract.safeKeyword(input.theme),url=o.contract.illustrationUrl(theme,input.seed),old=jobs.get(input.bookingId);
  if(old){cancel(old);jobs.delete(input.bookingId);persist();}
  if(!theme||!url||!o.contract.illustrationKey(theme)){stage(null,'unsupported_concept');return {status:'failed',failure:'unsupported_concept',bookingId:input.bookingId};}
  if(o.contract.illustrationAvailable===false){stage(null,'provider_request_failed');return {status:'failed',failure:'provider_request_failed',bookingId:input.bookingId};}
  if(!uuid(input.bookingId))return null;
  // Reserve the generation token before auth, so an immediate report save cannot
  // lose its association while getUser is in flight.
  var j={bookingId:input.bookingId,actorId:input.actorId,token:o.token(),theme:theme,seed:input.seed,url:url,startedAt:now(),status:'authorizing',retryCount:old?(old.retryCount||0)+1:0,submitted:false};jobs.set(j.bookingId,j);persist();
  try{var actor=await o.auth(input.bookingId);if(!active(j)||(input.current&&!input.current()))return null;
   if(!actor||!uuid(actor.id)||actor.allowed!==true||input.actorId&&actor.id!==input.actorId){j.status='failed';j.failure='authorization_failure';stage(j,j.failure);return snapshot(j);}
   j.actorId=actor.id;j.status='generating';persist();run(j);return snapshot(j);
  }catch(_){if(active(j)){j.status='failed';j.failure='authorization_failure';stage(j,j.failure);}return snapshot(j);}
 }
 function reportSubmitting(bookingId,token){var j=jobs.get(bookingId);if(j&&j.token===token&&['generating','authorizing'].includes(j.status))stage(j,'report_submitted_while_generating');}
 function reportSaved(bookingId,token){var j=jobs.get(bookingId);if(!j||j.token!==token)return Promise.resolve(false);j.submitted=true;persist();return attach(j);}
 async function resume(){
  var actor=await o.auth();if(!actor)return;var stored=[];try{stored=JSON.parse(o.storage.getItem(KEY)||'[]');}catch(_){}
  (Array.isArray(stored)?stored:[]).slice(-5).forEach(j=>{
   if(!j||j.actorId!==actor.id||!uuid(j.bookingId)||!uuid(j.actorId)||typeof j.token!=='string'||!Number.isFinite(j.startedAt)||now()-j.startedAt>15*60000||j.startedAt>now()+1000||!validURL(j)||jobs.has(j.bookingId))return;
   // Unsaved generation stays resumable; a saved report allows illustration-only attach.
   if(!['authorizing','generating','ready','saved','failed'].includes(j.status))return;
   jobs.set(j.bookingId,j);if(j.status==='ready')attach(j);else if(['generating','authorizing'].includes(j.status))run(j);
  });persist();
 }
 return {start,reportSubmitting,reportSaved,resume,retrySave:id=>{var j=jobs.get(id);if(j)j.retryCount=(j.retryCount||0)+1;return attach(j);},state:id=>snapshot(jobs.get(id)),subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},diagnostics:()=>events.map(e=>({...e}))};
}
function browser(w){
 function failure(stage){var e=Error(stage);e.stage=stage;return e;}
 var manager=create({contract:w.DayOPartnerReportContract,storage:w.sessionStorage,setTimeout:w.setTimeout.bind(w),clearTimeout:w.clearTimeout.bind(w),token:()=>w.crypto.randomUUID(),
  auth:async bookingId=>{var db=w.supabaseClient;if(!db)return null;var res=await db.auth.getUser(),u=res.data&&res.data.user;if(res.error||!u)return null;var a=w.DayORoomAccess||{};return {id:u.id,allowed:!bookingId||a.allowed===true&&!a.adminTest&&a.role==='partner'&&a.bookingId===bookingId&&a.partnerId===u.id};},
  exists:async bookingId=>{var session=await w.supabaseClient.auth.getSession(),token=session.data&&session.data.session&&session.data.session.access_token;if(session.error||!token)return false;var control=new w.AbortController(),timer=w.setTimeout(()=>control.abort(),6500);try{var response=await w.fetch('/api/conversation-recap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'partner_illustration_status',booking_id:bookingId}),signal:control.signal});if(!response.ok)return false;var data=await response.json();return data.exists===true;}finally{w.clearTimeout(timer);}},
  save:async(bookingId,patch)=>{var r=await w.supabaseClient.rpc('merge_partner_session_report',{p_booking_id:bookingId,p_report:patch});if(r.error)throw failure('save_failed');return Array.isArray(r.data)?r.data[0]:r.data;},
  observe:event=>{w.document.dispatchEvent(new w.CustomEvent('dayo:illustration-stage',{detail:event}));},
  load:(url,remaining)=>{var controller=new w.AbortController(),timer,objectURL,image;
   var promise=(async()=>{timer=w.setTimeout(()=>controller.abort(),remaining);try{
    var response;try{response=await w.fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});}catch(_){throw failure(controller.signal.aborted?'timeout':'provider_request_failed');}
    if(!response.ok){var httpError=failure('provider_http_error');httpError.statusCode=response.status;throw httpError;}var blob;try{blob=await response.blob();}catch(_){throw failure(controller.signal.aborted?'timeout':'provider_request_failed');}
    if(!/^image\/(png|jpeg|webp)$/i.test(blob.type)||!blob.size||blob.size>5*1024*1024)throw failure('provider_request_failed');
    objectURL=w.URL.createObjectURL(blob);image=new w.Image();image.src=objectURL;
    try{await Promise.race([image.decode(),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(failure('timeout')),{once:true}))]);if(!image.naturalWidth)throw Error('empty');}catch(error){throw failure(error&&error.stage==='timeout'?'timeout':'image_load_failed');}
   }finally{w.clearTimeout(timer);if(objectURL)w.URL.revokeObjectURL(objectURL);}})();return {promise,cancel:()=>controller.abort()};
  }});
 w.document.addEventListener('dayo:partner-authorized',()=>manager.resume().catch(()=>{}));
 w.document.addEventListener('dayo:authchange',()=>manager.resume().catch(()=>{}));
 if(w.document.readyState==='loading')w.document.addEventListener('DOMContentLoaded',()=>manager.resume().catch(()=>{}));else manager.resume().catch(()=>{});
 return manager;
}
return {create,browser};
});
