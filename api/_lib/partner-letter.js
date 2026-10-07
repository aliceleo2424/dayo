/* Exact-booking source, approved minimal Gemini draft selection, no report writes. */
const recap=require('../../public/conversation-recap.js');
const {createHash}=require('node:crypto');
const VERSION='dayo_partner_letter_v1';
const provider=require('./partner-letter-gemini.js');
function compose(value,topic,model){return provider.guard(value,topic).map(b=>({...b,source_utterance_id:topic.id,generator:VERSION,model}));}
async function handle({input,read,user,env,signal,draftGenerator,fetchImpl}){
 const allowed=['booking_id','action','topic_id','source_version'];
 if(Object.keys(input).some(k=>!allowed.includes(k))||!['partner_letter_topics','partner_letter_blocks','partner_illustration_status'].includes(input.action))return {status:400,body:{error:'invalid_request'}};
 if(input.topic_id!=null&&(typeof input.topic_id!=='string'||input.topic_id.length>100)||input.source_version!=null&&(typeof input.source_version!=='string'||input.source_version.length>100))return {status:400,body:{error:'invalid_request'}};
 const bookings=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,partner_user_id:'eq.'+user.id,select:'id,learner_id,partner_user_id,status,language',limit:'1'}));
 const b=Array.isArray(bookings)&&bookings[0];
 if(!b||b.id!==input.booking_id||b.partner_user_id!==user.id||!['confirmed','completed'].includes(b.status)||!b.learner_id)return {status:403,body:{error:'not_partner_booking'}};
 const profiles=await read('/rest/v1/profiles?'+new URLSearchParams({id:'eq.'+user.id,select:'id,role',limit:'1'}));
 if(!Array.isArray(profiles)||!profiles.some(p=>p.id===user.id&&p.role==='partner'))return {status:403,body:{error:'not_partner_booking'}};
 const key=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!key)return {status:503,body:{error:'source_unavailable'}};
 if(input.action==='partner_illustration_status'){
  if(Object.keys(input).some(k=>!['booking_id','action'].includes(k)))return {status:400,body:{error:'invalid_request'}};
  const reports=await read('/rest/v1/session_reports?'+new URLSearchParams({booking_id:'eq.'+b.id,select:'booking_id,partner_user_id,partner_comment',limit:'1'}),{apikey:key,Authorization:'Bearer '+key});
  if(!Array.isArray(reports))throw new Error('status_check_failed');
  const report=reports.find(r=>r.booking_id===b.id);
  const letter=report?String(report.partner_comment||'').replace(/\r\n?/g,'\n').trim():'';
  // A mismatched/unattributed existing Letter is not evidence of no Letter.
  if(report&&((report.partner_user_id&&report.partner_user_id!==user.id)||(letter&&report.partner_user_id!==user.id)))throw new Error('status_check_failed');
  return {status:200,body:{exists:!!report,letter_sent:!!letter,letter_digest:letter?createHash('sha256').update(letter,'utf8').digest('hex'):null}};
 }
 const logs=await read('/rest/v1/session_logs?'+new URLSearchParams({booking_id:'eq.'+b.id,participant_id:'eq.'+b.learner_id,participant_role:'eq.learner',select:'id,booking_id,participant_id,participant_role,transcript',limit:'1'}),{apikey:key,Authorization:'Bearer '+key});
 const log=Array.isArray(logs)&&logs[0],rows=recap.rows(log,b.id,b.learner_id,'learner');
 if(!rows||recap.language(b.language)!=='en')return {status:200,body:{topics:[],blocks:[],status:'no_canonical_source'}};
 const topics=recap.letterTopics(rows.slice(0,500)).filter(t=>provider.safeQuote(t.quote)&&provider.nouns(t.quote).length).map(t=>({...t,nouns:provider.nouns(t.quote),words:[...new Set(rows.filter(r=>t.source_utterance_ids.includes(r.id)).flatMap(r=>[...provider.nouns(r.text),...(/\bcrowded\b/i.test(r.text)?['crowded']:[])]))].slice(0,5)})),version=recap.sourceVersion(b.id,log.id,rows);
 if(input.action==='partner_letter_topics')return {status:200,body:{topics,source_version:version,status:topics.length?'available':'no_topics'}};
 if(input.source_version!==version)return {status:409,body:{error:'canonical_revision_changed'}};
 const topic=topics.find(t=>t.id===input.topic_id);if(!topic)return {status:400,body:{error:'invalid_topic'}};
 const apiKey=String(env.GEMINI_API_KEY||'').trim();
 if(typeof draftGenerator!=='function'&&!apiKey)return {status:503,body:{error:'ai_unavailable'}};
 try{
  const model=typeof draftGenerator==='function'?'local-fixture':String(env.GEMINI_MODEL||'gemini-3.6-flash');
  const data={topic:{label:topic.label,quote:topic.quote},signal};
  const value=typeof draftGenerator==='function'?await draftGenerator(data):await provider.generate({...data,apiKey,model,fetchImpl});
  return {status:200,body:{blocks:compose(value,topic,model),source_version:version,status:'blocks_for_review'}};
 }catch(_){return {status:502,body:{error:'suggestions_unavailable'}};}
}
module.exports={handle,compose,VERSION};
