/* Owner decision 2026-10-14: the keepsake illustrates concrete things the learner actually said.
 * The exact booking's saved LEARNER speech/chat is read first; when it yields nothing drawable, the
 * same booking's saved PARTNER speech is used instead (owner decision 2026-10-14, evening). Contact details are masked before the
 * Cloudflare text model sees it, and only server-signed keywords can reach the image prompt. */
const crypto=require('node:crypto');
const recap=require('../../public/conversation-recap.js');
const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_RETURNED=8; // Partner sees a few at a time and can rotate to the rest.
const MAX_PICK=2;     // One illustration combines at most two keywords.
// Owner report 2026-10-20: mochi/tanghulu came late in a 25-minute session (~7,000 chars of User speech) and the
// picture fell back to a generic "Food" theme. Read the whole session and leave room for the full answer.
const MAX_INPUT=12000;
const MAX_TOKENS=1400;
const CONTACT=/[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+|www\.\S+|@[A-Za-z0-9_.]{2,}|\+?\d[\d\s().-]{6,}\d/g;
// Visual phrases must stay drawable objects/places: no people, writing or unsafe subjects.
const BLOCKED=/\b(?:person|people|man|men|woman|women|girl|boy|child|children|kid|baby|face|portrait|selfie|student|teacher|friend|family|couple|human|body|nude|naked|sex\w*|blood|gun|weapon|knife|drug|cigarette|text|word|letter|writing|sign|logo|brand|label|poster|book\s+cover|screen|number)s?\b/i;
// The illustration should keep the learner's concrete moment (place, weather, light, mood), not a generic symbol.
const SYSTEM='From what a language learner said in a casual 1:1 conversation, pick up to 8 concrete things that could be painted as a small watercolor scene: places, objects, clothes, food, drinks, animals, plants, weather, or activities shown only through objects. Good examples: an amusement park, a carousel, a blue blanket, a red hat, a two-story house, a glass of wine, a small bookshop. For each one, write the visual as the specific moment the learner described around it, keeping the setting, weather, time of day, colors and mood they mentioned. Example: if they said they got lost in the rain on Jeju and found a small bookshop, the visual for the bookshop is "a small bookshop in a rainy island alley with warm light glowing from the window". Never invent details the learner did not mention. Skip people and names of people, contact details, numbers, school/company/department names, abstract ideas, feelings without an object, and sensitive topics (health, religion, politics, sexuality, violence, drugs). Return JSON only: {"keywords":[{"source":"the exact words as they appear in the text","label":"a short noun phrase of at most 4 words in the language the learner used","label_en":"the same short noun phrase in English, at most 4 words, for a partner who reads English","visual":"an English scene description of at most 20 words, with no people, no text, no signs, no logos and no brand or proper place names"}]}';
function failure(code){const e=Error(code);e.code=code;return e;}
function mask(text){return String(text||'').replace(CONTACT,' ');}
function norm(text){return String(text||'').toLowerCase().replace(/\s+/g,' ').trim();}
// Letters/digits only, so "2층집." or extra spaces still match what was actually said.
function matchKey(text){return String(text||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');}
function cleanVisual(text){return String(text||'').replace(/[‘’`]/g,"'").replace(/[^A-Za-z ,'-]+/g,' ').replace(/\s+/g,' ').replace(/ ,/g,',').trim().replace(/^[^A-Za-z]+/,'').replace(/[ ,'-]+$/,'');}
function cleanLabel(text){return String(text||'').replace(/\s+/g,' ').trim().replace(/^["'“”‘’(\[]+|["'“”‘’)\].,!?;:]+$/g,'').trim();}
function secret(env){const key=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!key)throw failure('source_unavailable');return crypto.createHash('sha256').update('dayo-keepsake-keyword-v1:'+key).digest();}
function b64(value){return Buffer.from(value).toString('base64url');}
function sign(env,payload){const body=b64(JSON.stringify(payload));return body+'.'+crypto.createHmac('sha256',secret(env)).update(body).digest('base64url');}
function verify(env,token){
 if(typeof token!=='string'||token.length>800||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return null;
 const [body,mac]=token.split('.'),expected=crypto.createHmac('sha256',secret(env)).update(body).digest('base64url');
 if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;
 try{return JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch(_){return null;}
}
// Exact booking (already Partner-authorized by the caller): learner speech + learner chat, plus partner speech as fallback.
async function learnerSource({input,read,user,env}){
 const rows=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,partner_user_id:'eq.'+user.id,select:'id,learner_id,partner_user_id,status',limit:'1'}));
 const b=Array.isArray(rows)&&rows.find(x=>x.id===input.booking_id&&x.partner_user_id===user.id);
 if(!b||!b.learner_id)throw failure('not_booking_partner');
 const key=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!key)throw failure('source_unavailable');
 const logs=await read('/rest/v1/session_logs?'+new URLSearchParams({booking_id:'eq.'+b.id,participant_id:'eq.'+b.learner_id,participant_role:'eq.learner',select:'id,booking_id,participant_id,participant_role,transcript',limit:'1'}),{apikey:key,Authorization:'Bearer '+key});
 const log=Array.isArray(logs)&&logs[0],speech=recap.rows(log,b.id,b.learner_id,'learner')||[];
 let chat=[];
 try{const messages=await read('/rest/v1/booking_chat_messages?'+new URLSearchParams({booking_id:'eq.'+b.id,sender_id:'eq.'+b.learner_id,sender_role:'eq.learner',select:'booking_id,id,sender_id,sender_role,text,created_at',order:'created_at.asc,id.asc',limit:'500'}));
  chat=recap.chatEvidence(messages,b.id,b.learner_id,b.partner_user_id).filter(r=>r.speaker==='learner');}catch(_){/* Optional chat never removes speech. */}
 const all=[...speech.slice(0,500),...chat];
 let partnerRows=[];
 if(b.partner_user_id){try{const plogs=await read('/rest/v1/session_logs?'+new URLSearchParams({booking_id:'eq.'+b.id,participant_id:'eq.'+b.partner_user_id,participant_role:'eq.partner',select:'id,booking_id,participant_id,participant_role,transcript',limit:'1'}),{apikey:key,Authorization:'Bearer '+key});
  partnerRows=(recap.rows(Array.isArray(plogs)&&plogs[0],b.id,b.partner_user_id,'partner')||[]).slice(0,500);}catch(_){/* Partner fallback is optional. */}}
 return {booking:b,rows:all,partnerRows,version:recap.sourceVersion(b.id,(log&&log.id)||'saved-chat',all.concat(partnerRows))};
}
// A reply cut off at the token limit still keeps every complete keyword object before the cut.
function salvage(text){const out=[],at=text.indexOf('[');if(at<0)return out;for(const m of text.slice(at).matchAll(/\{[^{}]*\}/g)){try{out.push(JSON.parse(m[0]));}catch(_){}}return out;}
function parse(result){
 let value=result&&result.response;
 if(typeof value==='string'){const start=value.indexOf('{'),end=value.lastIndexOf('}');if(start<0)return [];try{if(end<start)throw 0;value=JSON.parse(value.slice(start,end+1));}catch(_){return salvage(value.slice(start));}}
 return value&&Array.isArray(value.keywords)?value.keywords:[];
}
// Keep only keywords the learner really said, drawable and free of contact details.
function validate(items,rows){
 const said=matchKey(rows.map(r=>r.text).join('\n')),out=[],seen=new Set();
 for(const item of Array.isArray(items)?items:[]){
  const source=cleanLabel(item&&item.source),label=cleanLabel(item&&item.label),labelEn=cleanLabel(item&&item.label_en),visual=cleanVisual(item&&item.visual);
  if(!source||source.length>40||!matchKey(source)||!said.includes(matchKey(source)))continue;
  if(!label||label.length>24||/[<>{}\[\]\\/@]/.test(label)||mask(label)!==label||mask(source)!==source)continue;
  if(!/^[A-Za-z][A-Za-z ,'-]{2,159}$/.test(visual)||visual.split(' ').length>22||BLOCKED.test(visual))continue;
  const key=norm(label);if(seen.has(key))continue;seen.add(key);
  // English chip text for English-mode Partners; falls back to the learner's own words.
  out.push({label,labelEn:/^[A-Za-z][A-Za-z '-]{1,40}$/.test(labelEn)&&!BLOCKED.test(labelEn)?labelEn:'',visual:visual.toLowerCase()});if(out.length>=MAX_RETURNED)break;
 }
 return out;
}
async function extract({rows,env,fetchImpl=fetch,signal}){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID||'').trim(),token=String(env.CLOUDFLARE_API_TOKEN||'').trim();
 if(!/^[a-f0-9]{32}$/.test(account)||!token)throw failure('provider_unavailable');
 const text=rows.map(r=>mask(r.text)).join('\n').slice(0,MAX_INPUT);
 if(text.trim().length<2)return [];
 const timeout=AbortSignal.timeout(20000);let response;
 try{response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+MODEL,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'system',content:SYSTEM},{role:'user',content:text}],max_tokens:MAX_TOKENS,temperature:0.2}),signal:signal?AbortSignal.any([signal,timeout]):timeout});}
 catch(_){throw failure('provider_request_failed');}
 if(!response.ok)throw failure('provider_http_'+response.status);
 let json;try{json=await response.json();}catch(_){throw failure('provider_http_error');}
 if(json&&json.success===false)throw failure('provider_http_error');
 return validate(parse(json&&json.result),rows);
}
async function choices({input,read,user,env,signal,fetchImpl}){
 const source=await learnerSource({input,read,user,env});
 let found=await extract({rows:source.rows,env,fetchImpl,signal}),from='learner';
 if(!found.length&&source.partnerRows.length){found=await extract({rows:source.partnerRows,env,fetchImpl,signal});from='partner';}
 return {from:found.length?from:'none',learnerRows:source.rows.length,partnerRows:source.partnerRows.length,version:source.version,choices:found.map(k=>{const token=sign(env,{b:source.booking.id,v:source.version,l:k.label,vis:k.visual});return {id:crypto.createHash('sha256').update(token).digest('hex').slice(0,16),label:k.label,label_en:k.labelEn||k.label,token};})};
}
// Generation accepts only tokens this server signed for the same booking and saved source.
async function pick({input,read,user,env}){
 const tokens=input.keywords;
 if(!Array.isArray(tokens)||tokens.length<1||tokens.length>MAX_PICK||new Set(tokens).size!==tokens.length)return {status:400,error:'invalid_keyword'};
 const source=await learnerSource({input,read,user,env});
 if(input.source_version!==source.version)return {status:409,error:'canonical_revision_changed'};
 const picked=tokens.map(t=>verify(env,t));
 if(picked.some(p=>!p||p.b!==source.booking.id||p.v!==source.version||typeof p.vis!=='string'||!validate([{source:p.l,label:p.l,visual:p.vis}],[{text:p.l}]).length))return {status:400,error:'invalid_keyword'};
 return {status:200,version:source.version,labels:picked.map(p=>p.l),concept:picked.length===1?picked[0].vis:'one calm scene that combines '+picked[0].vis+' and '+picked[1].vis};
}
module.exports={choices,pick,extract,validate,mask,sign,verify,MODEL,MAX_PICK,MAX_RETURNED};
