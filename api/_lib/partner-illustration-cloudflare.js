/* Server-only adapter. Image prompts use either learner keywords signed by keepsake-keywords.js
 * (owner decision 2026-10-14) or the fixed fallback motifs below; raw Letter text never does.
 * Activation requires approved durable quota reservation and image storage.
 * Neither is replaced by browser/session memory or temporary/data URLs. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const letter = require('./partner-letter.js');
const contract = require('../../public/partner-report-contract.js');
const testRuntime = require('./keepsake-test-runtime.js');
const recap = require('../../public/conversation-recap.js');
const {safeQuote} = require('./partner-letter-gemini.js');
const keywords = require('./keepsake-keywords.js');
// Image-only motifs: Letter drafting nouns/categories are not image eligibility.
const CHAT_THEMES = Object.freeze({
 chat_wine:'a single glass of wine as a symbolic topic vignette, not a claim that anybody drank it',
 chat_birthday_wine:'a single glass of wine with abstract celebratory watercolor washes, symbolic celebratory and wine topics, not a depiction of an actual party; no cake, candles, gifts, greeting cards, invitations, printed objects or invented location',
 chat_cafe:'an empty café table corner as a symbolic café topic, no invented food or drink'
});
async function chatTheme({input,read,user}) {
 const bookings=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,partner_user_id:'eq.'+user.id,select:'id,learner_id,partner_user_id,language',limit:'1'}));
 const b=Array.isArray(bookings)&&bookings.find(b=>b.id===input.booking_id&&b.partner_user_id===user.id);
 if(!b||recap.language(b.language)!=='en')return null;
 // Existing participant JWT/RLS only. Full chat never enters the provider prompt.
 const messages=await read('/rest/v1/booking_chat_messages?'+new URLSearchParams({booking_id:'eq.'+b.id,select:'booking_id,id,sender_id,sender_role,text,created_at',order:'created_at.asc,id.asc',limit:'500'}));
 const rows=recap.chatEvidence(messages,b.id,b.learner_id,b.partner_user_id).filter(r=>safeQuote(r.text));
 const wine=rows.some(r=>/\bwine\b/i.test(r.text));
 const birthday=rows.some(r=>/\bbirthday\s+party\b/i.test(r.text));
 if(wine)return birthday?'chat_birthday_wine':'chat_wine';
 return rows.some(r=>/\bcaf[eé]s?(?=$|[^A-Za-zÀ-ž])/i.test(r.text))?'chat_cafe':null;
}
// Owner decision 2026-10-14: a keepsake must be possible for ordinary conversations, not only café talk.
// Only these fixed, allowlisted concepts reach the provider; transcript text never does.
// A theme is chosen only when the exact booking's saved speech/chat mentions it (Korean or English).
const SUBJECT_THEMES = Object.freeze([
 ['travel',/\b(?:travel(?:l?ing)?|trips?|vacation|holiday|airport|flight)\b|여행|휴가|공항|비행기/i,'Travel','a small suitcase and a softly folded map as a symbolic travel motif'],
 ['beach',/\b(?:beach|ocean|sea|surf(?:ing)?)\b|바다|해변|해수욕/i,'The sea','a quiet shoreline with gentle waves and an empty beach'],
 ['mountain',/\b(?:hik(?:e|ing)|mountains?|trekking)\b|등산|산책로|한라산|북한산/i,'Mountains','a mountain trail winding through soft hills'],
 ['coffee',/\b(?:coffee|latte|americano|espresso|caf[eé]s?)\b|커피|카페|라떼|아메리카노/i,'Coffee & cafés','a single cup of coffee on a quiet café table corner'],
 ['tea',/\b(?:tea|matcha)\b|녹차|말차|차 한잔/i,'Tea','a simple teapot and a cup of tea'],
 ['korean_food',/\b(?:kimchi|bibimbap|bulgogi|tteokbokki|ramyeon|ramen|korean\s+(?:food|bbq|barbecue)|samgyeopsal)\b|김치|비빔밥|불고기|떡볶이|라면|삼겹살|한식/i,'Korean food','a few small bowls of Korean side dishes on a wooden table'],
 ['cooking',/\b(?:cook(?:ing|ed)?|recipes?|baking|bake[ds]?|kitchen|pasta)\b|요리|레시피|베이킹|빵|파스타/i,'Cooking','a tidy kitchen counter with simple cooking utensils and fresh vegetables'],
 ['food',/\b(?:food|restaurants?|dinner|lunch|breakfast|delicious|eat(?:ing)?)\b|음식|맛집|식당|저녁|점심|아침밥|맛있/i,'Food','a simple shared plate on a table, symbolic of a favorite meal'],
 ['music',/\b(?:music|songs?|singing|singer|concerts?|k-?pop|guitar|piano|band)\b|음악|노래|콘서트|케이팝|기타|피아노|밴드/i,'Music','musical instruments resting together, a quiet symbolic music motif'],
 ['movies',/\b(?:movies?|films?|cinema|netflix|dramas?|series|tv\s+shows?)\b|영화|드라마|넷플릭스|시리즈/i,'Movies & dramas','a cozy sofa facing a blank screen with a bowl of popcorn'],
 ['books',/\b(?:books?|novels?|reading|library)\b|책|소설|독서|도서관/i,'Books','a small stack of blank-covered books beside a reading lamp'],
 ['sports',/\b(?:soccer|football|baseball|basketball|tennis|golf|gym|workout|exercise|running|jogging|swimming|yoga|sports?)\b|축구|야구|농구|테니스|골프|헬스|운동|달리기|수영|요가/i,'Sports & exercise','a pair of running shoes and a water bottle'],
 ['dog',/\b(?:dogs?|puppy|puppies)\b|강아지|반려견/i,'Dogs','a sleepy dog curled up on a soft rug'],
 ['cat',/\b(?:cats?|kitten)\b|고양이|반려묘/i,'Cats','a cat resting by a sunny window'],
 ['pets',/\b(?:pets?|rabbits?|hamsters?|birds?)\b|반려동물|토끼|햄스터|앵무새/i,'Pets','a small pet bed with a soft blanket'],
 ['rain',/\b(?:rain(?:y|ing)?|umbrella|monsoon)\b|비가|비 오|장마|우산/i,'Rainy days','an umbrella and soft rain on a window'],
 ['weather',/\b(?:weather|sunny|snow(?:y|ing)?|cold|hot|autumn|fall\s+leaves|spring|summer|winter)\b|날씨|맑|눈이|추워|더워|가을|봄|여름|겨울|단풍/i,'Seasons & weather','a single tree with soft seasonal leaves'],
 ['flowers',/\b(?:flowers?|garden(?:ing)?|plants?|cherry\s+blossoms?)\b|꽃|정원|식물|벚꽃/i,'Flowers & plants','a small vase of flowers and potted plants'],
 ['art',/\b(?:art|paint(?:ing)?|drawing|museum|gallery|photograph(?:y)?|camera)\b|그림|미술|전시|박물관|사진|카메라/i,'Art & photos','an easel with a blank canvas and a few brushes'],
 ['games',/\b(?:games?|gaming|board\s+games?)\b|게임|보드게임/i,'Games','a scattered set of board game pieces and dice'],
 ['shopping',/\b(?:shopping|clothes|fashion)\b|쇼핑|옷|패션/i,'Shopping & fashion','a neatly folded sweater and a paper shopping bag with no print'],
 ['work',/\b(?:work(?:ing)?|office|job|company|meeting)\b|회사|직장|사무실|회의|출근/i,'Work life','a tidy desk with a notebook and a warm mug'],
 ['study',/\b(?:study(?:ing)?|school|university|class(?:es)?|exam|homework|learn(?:ing)?)\b|공부|학교|대학|수업|시험|숙제/i,'Study','an open notebook and pencils on a study desk'],
 ['family',/\b(?:family|parents|brother|sister|kids?|children)\b|가족|부모님|형제|자매|동생|아이들/i,'Family','a cozy living room with a warm lamp and cushions'],
 ['city',/\b(?:seoul|busan|jeju|city|subway|street)\b|서울|부산|제주|도시|지하철|거리/i,'City life','a quiet city street corner with soft evening light']
]);
const CONVERSATION_MEMORY = 'two warm cups of tea on a small table by a window, a symbolic memory of a friendly conversation';
function subjectConcept(theme){if(theme==='conversation_memory')return CONVERSATION_MEMORY;const hit=SUBJECT_THEMES.find(t=>'subject_'+t[0]===theme);return hit?hit[3]:'';}
function subjectLabel(theme){if(theme==='conversation_memory')return 'Conversation memory';const hit=SUBJECT_THEMES.find(t=>'subject_'+t[0]===theme);return hit?hit[2]:'';}
// Exact-booking saved speech of BOTH participants plus booking chat (service read after Partner ownership check).
async function bookingTexts({input,read,user,env}){
 const b=(await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,partner_user_id:'eq.'+user.id,select:'id,learner_id,partner_user_id',limit:'1'}))||[]).find(x=>x.id===input.booking_id&&x.partner_user_id===user.id);
 if(!b)return [];
 const key=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();const texts=[];
 if(key){const logs=await read('/rest/v1/session_logs?'+new URLSearchParams({booking_id:'eq.'+b.id,select:'id,booking_id,participant_id,participant_role,transcript',limit:'4'}),{apikey:key,Authorization:'Bearer '+key});
  for(const log of Array.isArray(logs)?logs:[]){const id=log.participant_role==='learner'?b.learner_id:log.participant_role==='partner'?b.partner_user_id:null;if(!id)continue;for(const r of (recap.rows(log,b.id,id,log.participant_role)||[]))texts.push(String(r.text||''));}}
 try{const messages=await read('/rest/v1/booking_chat_messages?'+new URLSearchParams({booking_id:'eq.'+b.id,select:'booking_id,id,sender_id,sender_role,text,created_at',order:'created_at.asc,id.asc',limit:'500'}));for(const r of recap.chatEvidence(messages,b.id,b.learner_id,b.partner_user_id))texts.push(String(r.text||''));}catch(_){}
 return texts;
}
async function verifiedTheme({input,read,user,env,source}){
 let theme=contract.storyIllustrations(source.body.topics)[0]?.theme;if(theme)return theme;
 try{theme=await chatTheme({input,read,user});}catch(_){}if(theme)return theme;
 const texts=(Array.isArray(source.body.topics)?source.body.topics:[]).map(t=>String(t.quote||''));
 try{texts.push(...await bookingTexts({input,read,user,env}));}catch(_){}
 let best=null,score=0;
 for(const [id,re] of SUBJECT_THEMES){const n=texts.filter(t=>re.test(t)).length;if(n>score){best=id;score=n;}}
 if(best)return 'subject_'+best;
 return texts.some(t=>t.trim().length>=2)?'conversation_memory':null;
}
const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const REFERENCE = path.join(__dirname, '../_assets/dayo-watercolor-reference-511.png');
const STYLE = 'Use image 0 only for watercolor and colored-pencil technique, textured ivory paper, muted sage, beige and warm brown. Simple adult editorial vignette, softly fading edges and generous ivory space. Do not copy reference subjects or composition. No people, human faces, text, letters, numbers, glyphs, logos, signatures or visible watermarks. No words or writing. No greeting cards, invitations, signs, posters, menus, labels, packaging, book covers or screens. All surfaces must be blank and unmarked. No photorealism, cartoon mascot, 3D or neon. Subjects from separate topics are symbolic motifs, not events or objects physically together. ';
function failure(code) { const e = Error(code); e.code = code; return e; }
async function generate({theme, concept, env, fetchImpl=fetch, signal}) {
 if (!concept&&!contract.illustrationKey(theme)&&!Object.hasOwn(CHAT_THEMES,theme)&&!subjectConcept(theme)) throw failure('unsupported_concept');
 const account=String(env.CLOUDFLARE_ACCOUNT_ID||'').trim(), token=String(env.CLOUDFLARE_API_TOKEN||'').trim();
 if(!/^[a-f0-9]{32}$/.test(account)||!token)throw failure('provider_unavailable');
 const reference=await fs.readFile(REFERENCE), form=new FormData();
 form.append('prompt',STYLE+(concept||CHAT_THEMES[theme]||subjectConcept(theme)||contract.illustrationConcept(theme)));
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
// A trusted SERVER inspector must assess the actual decoded image, not the prompt.
// No client approval/metadata is accepted. Missing inspection fails closed.
async function checkQuality(image,qualityCheck,signal) {
 if(typeof qualityCheck!=='function')throw failure('quality_check_unavailable');
 const controller=new AbortController();
 const relay=()=>controller.abort();signal?.addEventListener('abort',relay,{once:true});
 let timer;
 try {
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('quality_check_unavailable'));},5000);});
  if(signal?.aborted)throw failure('quality_check_unavailable');
  const result=await Promise.race([Promise.resolve().then(()=>qualityCheck({bytes:image.bytes,contentType:image.contentType,signal:controller.signal})),timeout]);
  const hash=crypto.createHash('sha256').update(image.bytes).digest('hex');
  if(!result||result.reviewed!==true||result.imageHash!==hash||typeof result.visibleText!=='string'
    ||typeof result.logoDetected!=='boolean'||typeof result.watermarkDetected!=='boolean')throw failure('quality_check_unavailable');
  if(/[\p{L}\p{N}]/u.test(result.visibleText)||result.logoDetected||result.watermarkDetected)throw failure('quality_rejected');
  return result;
 }catch(e){throw failure(e.code==='quality_rejected'?'quality_rejected':'quality_check_unavailable');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',relay);}
}
async function handle({input,read,user,env,signal,fetchImpl, enabled=false, testOnly=true, quota, storage,qualityCheck,manualReview=false}) {
 // Only the allowlisted server TEST runtime may enable generation. UI remains disabled.
 if(!enabled)return {status:503,body:{error:'generation_disabled'}};
 if(input.request_id!=null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.request_id))return {status:400,body:{error:'invalid_request'}};
 if(input.action!=='partner_illustration_generate'||Object.keys(input).some(k=>!['action','booking_id','topic_id','source_version','request_id','keywords'].includes(k)))return {status:400,body:{error:'invalid_request'}};
 const denied=await testRuntime.authorize({input,read,user,allowBeta:manualReview});if(denied)return denied;
 const keywordPick=input.keywords!=null;
 const source=keywordPick?null:await letter.handle({input:{action:'partner_letter_topics',booking_id:input.booking_id},read,user,env,signal});
 if(source&&source.status!==200)return source;
 if(testOnly){
  const rows=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,
    partner_user_id:'eq.'+user.id,select:'id,partner_user_id,is_test_session',limit:'1'}));
  if(!Array.isArray(rows)||!rows.some(b=>b.id===input.booking_id&&b.partner_user_id===user.id&&b.is_test_session===true))
    return {status:403,body:{error:'test_booking_required'}};
 }
 let theme=null,concept=null,sourceVersion;
 if(keywordPick){
  // Only keywords this server signed from the same booking's saved learner speech/chat.
  let picked;try{picked=await keywords.pick({input,read,user,env});}catch(_){return {status:503,body:{error:'source_unavailable'}};}
  if(picked.status!==200)return {status:picked.status,body:{error:picked.error}};
  concept=picked.concept;sourceVersion=picked.version;
 }else{
  if(input.source_version!==source.body.source_version)return {status:409,body:{error:'canonical_revision_changed'}};
  // All motifs come from server-verified exact-booking evidence, never client prompt/theme.
  theme=await verifiedTheme({input,read,user,env,source});
  if(manualReview&&input.topic_id!==theme)return {status:400,body:{error:'invalid_verified_topic'}};
  if(!theme)return {status:200,body:{status:'insufficient_evidence',url:null}};
  sourceVersion=source.body.source_version;
 }
 if(typeof qualityCheck!=='function')return {status:503,body:{error:'quality_check_unavailable'}};
 if(!quota||typeof quota.reserve!=='function'||!storage||typeof storage.put!=='function')return {status:503,body:{error:'durable_storage_and_quota_required'}};
 // Required future contract: atomic, persistent per-booking idempotency + at most two
 // attempts, and account-wide free-only budget. A rejected/uncertain claim never calls AI.
 let claim;try {claim=await quota.reserve({bookingId:input.booking_id,actorId:user.id,sourceVersion,model:MODEL,requestId:input.request_id,maxAttempts:2,estimatedNeurons:110,freeOnly:true});}catch(_){return {status:503,body:{error:'quota_unavailable'}};}
 if(claim?.reused===true){
  if(manualReview&&typeof storage.reviewStatus==='function'){try{return {status:200,body:await storage.reviewStatus({bookingId:input.booking_id,actorId:user.id,token:claim.token})};}catch(_){return {status:503,body:{error:'image_access_unavailable'}};}}
  if(claim.state==='ready'&&typeof storage.read==='function'){
   try{const saved=await storage.read(input.booking_id);if(saved)return {status:409,body:{error:'saved_image_quality_unverified'}};}catch(_){}
   return {status:503,body:{error:'image_access_unavailable'}};
  }
  return {status:409,body:{error:claim.state==='reserved'?'generation_pending':'attempt_already_used'}};
 }
 if(claim?.allowed===false&&claim.error)return {status:409,body:{error:['attempt_limit','generation_pending','free_allowance_unverified','daily_budget_exhausted'].includes(claim.error)?claim.error:'generation_not_reserved'}};
 if(!claim||claim.plan!=='workers_free'||claim.allowed!==true||!Number.isInteger(claim.attempt)||claim.attempt<1||claim.attempt>2||typeof claim.token!=='string'||!claim.token)return {status:409,body:{error:'generation_not_reserved'}};
 try {
  const image=await generate({theme,concept,env,signal,fetchImpl});
  const inspected=await checkQuality(image,qualityCheck,signal);
  if(manualReview){
   if(inspected.manualPending!==true||typeof storage.putPending!=='function')throw failure('quality_check_unavailable');
   const saved=await storage.putPending({bookingId:input.booking_id,actorId:user.id,reservationToken:claim.token,...image});
   if(saved?.status!=='pending_review'||saved.booking_id!==input.booking_id)throw failure('save_failed');
   return {status:200,body:{status:'pending_review',booking_id:saved.booking_id,attempt_id:saved.attempt_id,url:null}};
  }
  const saved=await storage.put({bookingId:input.booking_id,actorId:user.id,reservationToken:claim.token,...image});
  // Private durable asset reference and short-lived access URL; never persist the signed URL. Adapter never writes Letter/Recap fields.
  if(!saved||saved.durable!==true||saved.firstParty!==true||typeof saved.url!=='string'||!/^https:\/\//.test(saved.url))throw failure('save_failed');
  return {status:200,body:{status:'ready',...saved,model:MODEL}};
 }catch(e){
  const code=['timeout','provider_unavailable','provider_request_failed','quota_unavailable','provider_http_error','invalid_image','save_failed','quality_rejected','quality_check_unavailable'].includes(e.code)?e.code:'save_failed';
  try{if(typeof quota.fail==='function')await quota.fail({token:claim.token,actorId:user.id,code:code.startsWith('quality_')?'invalid_image':code});}catch(_){/* Reserved attempt remains consumed; cleanup reconciles interrupted saves. */}
  return {status:502,body:{error:code}};
 }
}
async function choices({input,read,user,env,signal,fetchImpl}){
 const denied=await testRuntime.authorize({input,read,user,allowBeta:true});if(denied)return denied;
 // Primary: concrete things the learner said. Fixed motifs remain the fallback if the text model fails.
 try{const found=await keywords.choices({input,read,user,env,signal,fetchImpl});
  if(found.choices.length)return {status:200,body:{mode:'keywords',max_pick:keywords.MAX_PICK,source_version:found.version,choices:found.choices}};}catch(_){}
 const source=await letter.handle({input:{action:'partner_letter_topics',booking_id:input.booking_id},read,user,env,signal});if(source.status!==200)return source;
 const theme=await verifiedTheme({input,read,user,env,source});
 return {status:200,body:{source_version:source.body.source_version,choices:theme?[{id:theme,label:theme==='chat_birthday_wine'?'Wine and celebration':theme==='chat_wine'?'Wine':theme==='chat_cafe'?'Café':subjectLabel(theme)||'Conversation memory'}]:[]}};
}
module.exports={handle,choices,MODEL,REFERENCE,verifiedTheme,subjectConcept};
