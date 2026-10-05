/* POST /api/learner-language-recap. Own JWT/RLS reads only; existing learner RPC
 * remains the sole report write path. No service-role key, schema or grants. */
const contract=require('../public/learner-language-recap-contract.js');
const provider=require('./_lib/learner-language-recap.js');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
async function body(req){if(req.body&&typeof req.body==='object')return req.body;if(typeof req.body==='string'){if(req.body.length>1024)throw Error('body');return JSON.parse(req.body);}let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1024)throw Error('body');}return JSON.parse(raw||'{}');}
function createHandler({env=process.env,fetchImpl=fetch}={}){return async function handler(req,res){
  if(req.method!=='POST'){json(res,405,{error:'method_not_allowed'});return;}
  const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers&&req.headers.authorization||''));
  if(!token){json(res,401,{error:'auth_required'});return;}
  let input;try{input=await body(req);}catch(_){json(res,400,{error:'invalid_request'});return;}
  if(!input||typeof input!=='object'||Array.isArray(input)||!uuid(input.booking_id)){json(res,400,{error:'invalid_booking_id'});return;}
  // A caller may not supply transcript, language, identity or Partner fields.
  if(Object.keys(input).some(k=>!['booking_id','locale'].includes(k))){json(res,400,{error:'unexpected_fields'});return;}
  const url=String(env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL||'').replace(/\/+$/,''),anon=String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'').trim();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!anon){json(res,503,{error:'recap_unavailable'});return;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
  const headers={apikey:anon,Authorization:'Bearer '+token[1]};
  async function read(route){const r=await fetchImpl(url+route,{headers,signal:controller.signal});if(!r.ok)throw Error('source_unavailable');return r.json();}
  try{
    const auth=await fetchImpl(url+'/auth/v1/user',{headers,signal:controller.signal});
    if(!auth.ok){json(res,401,{error:'auth_required'});return;}
    const user=await auth.json();if(!uuid(user.id)){json(res,401,{error:'auth_required'});return;}
    const bookings=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,learner_id:'eq.'+user.id,select:'id,learner_id,language,status',limit:'1'}));
    const booking=Array.isArray(bookings)&&bookings[0];
    if(!booking||booking.learner_id!==user.id||!['confirmed','completed'].includes(booking.status)){json(res,403,{error:'not_learner_booking'});return;}
    const language=contract.language(booking.language);
    const logs=await read('/rest/v1/session_logs?'+new URLSearchParams({booking_id:'eq.'+booking.id,participant_id:'eq.'+user.id,participant_role:'eq.learner',select:'id,booking_id,participant_id,participant_role,transcript',limit:'1'}));
    const log=Array.isArray(logs)&&logs[0];
    if(!log||!uuid(log.id)||log.booking_id!==booking.id||log.participant_id!==user.id||log.participant_role!=='learner'){json(res,200,{corrections:[],status:'no_learner_source'});return;}
    const candidates=contract.candidates(log,language);
    const locale=input.locale==='ko'?'ko':'en',model=String(env.GEMINI_MODEL||'gemini-3.6-flash');
    const sourceDigest=provider.digest(candidates,language,locale,model);
    const reports=await read('/rest/v1/session_reports?'+new URLSearchParams({booking_id:'eq.'+booking.id,learner_id:'eq.'+user.id,select:'feedback',limit:'1'}));
    const feedback=Array.isArray(reports)&&reports[0]&&Array.isArray(reports[0].feedback)?reports[0].feedback:[];
    const marker=feedback.find(x=>x&&x.generator===contract.VERSION&&x.kind==='learner_recap_generation'&&x.source_digest===sourceDigest&&x.status==='complete');
    const cached=contract.validate(feedback.filter(x=>x&&x.generator===contract.VERSION&&x.source_digest===sourceDigest),candidates,language);
    if(marker&&marker.schema_version===1&&marker.correction_count===cached.length){json(res,200,{corrections:cached.map(x=>({...x,source_digest:sourceDigest,model,generated_at:marker.generated_at})),metadata:marker,status:'cached'});return;}
    if(!candidates.length){json(res,200,{corrections:[],status:'no_candidates'});return;}
    if(!String(env.GEMINI_API_KEY||'').trim()){json(res,503,{error:'ai_unavailable'});return;}
    const corrections=await provider.generate({candidates,language,locale,apiKey:env.GEMINI_API_KEY,model,fetchImpl,signal:controller.signal});
    const generatedAt=new Date().toISOString();
    const stored=corrections.map(x=>({...x,source_digest:sourceDigest,model,generated_at:generatedAt}));
    const metadata={schema_version:1,generator:contract.VERSION,kind:'learner_recap_generation',status:'complete',source_digest:sourceDigest,correction_count:stored.length,model,generated_at:generatedAt};
    json(res,200,{corrections:stored,metadata,status:'generated'});
  }catch(_){json(res,502,{error:controller.signal.aborted?'recap_timeout':'recap_failed'});}
  finally{clearTimeout(timer);}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;