/* Read-only presentation; report ownership and persistence remain unchanged. */
(function(root,factory){var api=factory(typeof module==='object'&&module.exports?require('./partner-report-contract.js'):root.DayOPartnerReportContract,typeof module==='object'&&module.exports?require('./learner-expressions.js'):root.DayOLearnerExpressions,typeof module==='object'&&module.exports?require('./conversation-recap.js'):root.DayOConversationRecap);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DayOUserConversationReport=api;})(typeof window!=='undefined'?window:globalThis,function(contract,learner,conversationRecap){
'use strict';
var labels={en:{with:'Conversation with ',human:'From Your Conversation Partner',note:'A little note from ',treat:'Today’s Treat',theme:'Today’s conversation',recap:'Your Language Recap',summary:'Conversation recap',said:'You said',natural:'More natural',expressions:'Useful expressions',quiz:'Quiz result',help:'Words you looked up',saved:'Save this report',close:'Close',open:'View recap',record:'Conversation record'},ko:{with:'대화 파트너 · ',human:'파트너가 전하는 이야기',note:'작은 메시지 · ',treat:'오늘의 Treat',theme:'오늘 나눈 이야기',recap:'나의 언어 기록',summary:'대화 돌아보기',said:'내가 한 말',natural:'더 자연스럽게',expressions:'다시 써볼 표현',quiz:'퀴즈 결과',help:'찾아본 단어',saved:'대화 카드 저장',close:'닫기',open:'대화 기록 보기',record:'대화 기록'}};
var icons={americano:'☕',green_tea:'🍵',vanilla_latte:'☕',cookie:'🍪',croissant:'🥐',macaron:'🍬'};
function text(value){return typeof value==='string'?value.trim():'';}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function nickname(r,locale){var s=text(r.partner_name);return s&&!/[@+]|https?:\/\/|www\./i.test(s)?s:(locale==='ko'?'DayO 파트너':'DayO Partner');}
function date(r,locale){if(!r.created_at)return '';var d=new Date(r.created_at);return isNaN(d.getTime())?'':d.toLocaleString(locale==='ko'?'ko-KR':'en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+' KST';}
function language(r){var v=text(r.language);return ({en:'EN · English',english:'EN · English',es:'ES · Spanish',spanish:'ES · Spanish',fr:'FR · French',french:'FR · French',ko:'KO · Korean',korean:'KO · Korean'})[v.toLowerCase()]||v;}
function treat(r){return contract&&contract.treats.find(function(t){return t.code===r.stamp;});}
function normalized(s){return text(s).normalize('NFKC').toLowerCase().replace(/[.,!?“”"']/g,'').replace(/\s+/g,' ');}
function usable(value){var s=text(value),words=s.split(/\s+/);if(s.length<8||s.length>500||/https?:|www\.|@|\[inaudible\]|\[unknown\]|�|<|>/i.test(s))return false;if(/^(?:um|uh|hmm|yeah|okay|yes|no)(?:[ ,.!?]+(?:um|uh|hmm|yeah|okay|yes|no))*[.!?]*$/i.test(s))return false;return /[\uAC00-\uD7A3]/.test(s)?s.length>=10&&words.length>=2:words.length>=3&&/[A-Za-zÀ-ž]/.test(s);}
// Feedback strings are evaluation chips, not corrections. Legacy spoken_sentence
// has mixed ownership. Neither is inferred to be recognized learner speech.
// Only vetted corrections corroborated by the authenticated canonical learner log
// are shown; missing or ambiguous provenance yields zero corrections.
function corrections(r){var rows=Array.isArray(r.__dayoLearnerTranscript)?r.__dayoLearnerTranscript:[],seen={};var speech=rows.filter(function(x){return x&&x.speaker==='learner';}).map(function(x){return text(x.text||x.transcript||x.message);});return (Array.isArray(r.feedback)?r.feedback:[]).filter(function(x){if(!x||typeof x!=='object'||x.source!=='learner_recognized_speech'||x.meaning_preserved!==true||x.correction_needed!==true)return false;if(x.speaker&&x.speaker!=='learner'||x.ambiguous===true||x.asr_confidence!=null&&(!Number.isFinite(Number(x.asr_confidence))||Number(x.asr_confidence)<0.85))return false;var original=text(x.original_text||x.original),improved=text(x.suggested_text||x.corrected),key=normalized(original);if(!usable(original)||!usable(improved)||key===normalized(improved)||seen[key])return false;if(/^(en|english)$/i.test(text(r.language))&&learner&&!learner.isQuizQualityCandidate(original))return false;if(!speech.some(function(s){return normalized(s)===key;}))return false;if(x.source_log_id&&x.source_log_id!==r.__dayoLearnerSourceLogId)return false;if(x.source_utterance_id&&!rows.some(function(row){return row.speaker==='learner'&&row.id===x.source_utterance_id&&normalized(row.text||row.transcript||row.message)===key;}))return false;seen[key]=true;return true;}).slice(0,3).map(function(x){return {original:text(x.original_text||x.original),corrected:text(x.suggested_text||x.corrected),explanation:text(x.short_reason||x.explanation).slice(0,180)};});}
function expressions(r){var seen={};var fixed=corrections(r).flatMap(function(x){return [normalized(x.original),normalized(x.corrected)];});return (Array.isArray(r.key_expressions)?r.key_expressions:[]).map(function(x){return typeof x==='string'?{expression:x,usage:''}:{expression:text(x&&(x.expression||x.text||x.word)),usage:text(x&&(x.usage||x.meaning))};}).filter(function(x){var key=normalized(x.expression);if(!usable(x.expression)||seen[key]||fixed.indexOf(key)!==-1)return false;if(/^(en|english)$/i.test(text(r.language))&&learner&&!learner.isQuizQualityCandidate(x.expression))return false;seen[key]=true;return true;}).slice(0,3);}
function summary(r){var s=text(r.summary);return s?(s.match(/[^.!?。！？]+[.!?。！？]*(?:\s|$)/g)||[s]).slice(0,3).join('').trim():'';}
function quiz(r){var v=r.quiz_score;return v!=null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100?Number(v)+'%':'';}
function imageURL(v){var s=text(v);if(!(/^https?:\/\//i.test(s)||/^\/(?!\/)/.test(s)))return '';var path;try{path=new URL(s,'https://www.dayotalk.com').pathname;}catch(e){return '';}return /\/images\/logo(?:[-_][^/]*)?\.(?:png|jpe?g|webp|svg)$/i.test(path)?'':s;}
function hideIllustration(img){img.hidden=true;img.onerror=null;var block=img.closest('.ucr-block');if(block&&!block.querySelector('.ucr-theme'))block.hidden=true;}
function heading(title,content){return content?'<div class="ucr-block"><h4>'+esc(title)+'</h4>'+content+'</div>':'';}
function memoryData(r,locale){
r=r||{};var recap=conversationRecap.saved(r),topics=[],expressions=[];
if(recap&&recap.booking_id===r.booking_id&&recap.quality_version===3){
 var selected=(recap.topics||[]).filter(t=>t.source_version===recap.story_source_version&&Array.isArray(t.source_utterance_ids)&&t.source_utterance_ids.length).slice(0,2);
 topics=selected.map(t=>locale==='ko'?t.ko:t.en);
 var ids=new Set(selected.flatMap(t=>t.source_utterance_ids));
 expressions=(recap.expressions||[]).filter(e=>e.source_role==='learner'&&e.source_log_id===recap.source.learner_log_id&&e.source_version===recap.story_source_version&&(!ids.size||ids.has(e.source_utterance_id))&&usable(e.text)&&!e.greeting_fallback&&!/\b(?:song|music)\b.{0,50}\bis installed\b/i.test(e.text)).slice(0,2).map(e=>e.text);
}
var title=topics.length?(locale==='ko'?topics.slice(0,2).join('와 ')+' 이야기':topics.slice(0,2).join(' & ')):(locale==='ko'?nickname(r,locale)+'과 나눈 오늘의 대화':'Today’s conversation with '+nickname(r,locale));
return {title:title,kind:'dayo_memory_card_v1',locale:locale==='ko'?'ko':'en',date:date({created_at:r.scheduled_at||r.created_at},locale),language:language(r),partner:nickname(r,locale),image:imageURL(r.illust_url),topics:topics,expressions:expressions,letter:text(r.partner_comment)};
}
function memoryAction(r,locale){var m=memoryData(r,locale);return m.letter||m.image||m.topics.length||m.expressions.length?'<div class="ucr-memory-action"><button class="ucr-primary btn-save-card" type="button"'+memoryAttribute(r,locale)+' onclick="saveInstaCard(event)">'+(locale==='ko'?'대화 카드 저장':'Save conversation card')+'</button></div>':'';}

function memoryAttribute(r,locale){return ' data-memory-card="'+esc(encodeURIComponent(JSON.stringify(memoryData(r,locale))))+'"';}
function renderLetter(r,locale){r=r||{};var name=nickname(r,locale),img=imageURL(r.illust_url),theme=conversationRecap.saved(r)?'':text(r.keyword),note=text(r.partner_comment);
var human=note?'<blockquote>'+esc(note)+'</blockquote>':'<p class="ucr-letter-pending">'+(locale==='ko'?'파트너가 메시지를 준비 중이에요.':'Your partner is preparing a message.')+'</p>';
// Canonical stories already show grounded topics. Keep legacy theme and valid image; stored Treat is untouched.
if(theme||img)human+='<div class="ucr-block ucr-letter-theme">'+(theme?'<p class="ucr-theme">'+esc(theme)+'</p>':'')+(img?'<img class="ucr-illustration" hidden onload="this.hidden=false" src="'+esc(img)+'" alt="" referrerpolicy="no-referrer" onerror="DayOUserConversationReport.hideIllustration(this)">':'')+'</div>';
return '<section id="insta-card-capture" class="ucr-section ucr-human"'+memoryAttribute(r,locale)+'><h3>Letter from '+esc(name)+'</h3>'+human+'</section>';}
function renderLegacy(r,locale){
var l=labels[locale]||labels.en, parts=heading(l.summary,summary(r)?'<p>'+esc(summary(r))+'</p>':'');
parts+=heading(l.expressions,expressions(r).map(function(x){return '<p>'+esc(x.expression)+'</p>';}).join(''));
parts+=heading(l.quiz,quiz(r)?'<p>'+esc(quiz(r))+'</p>':'');
return parts?'<section class="ucr-section ucr-recap" data-legacy-report><h3>'+esc(l.recap)+'</h3>'+parts+'</section>':conversationRecap.render(null,locale);
}
function renderImmediate(r,locale,options){r=r||{};var access=typeof window!=='undefined'&&window.DayORoomAccess;if(access&&access.allowed===true&&access.bookingId===r.booking_id){r=Object.assign({},r);if(!text(r.partner_name))r.partner_name=access.partnerName||'';if(!text(r.created_at))r.created_at=access.scheduledAt||'';if(!text(r.language))r.language=access.language||'';}return conversationRecap.render(conversationRecap.saved(r),locale,Object.assign({wordHelp:r.word_help,hideQuizAction:!!(options&&options.interactive)},options||{}))+renderLetter(r,locale)+memoryAction(r,locale)+(options&&options.interactive&&!options.hideActions?conversationRecap.renderActions(conversationRecap.saved(r),locale):'');}
function sameStoredData(a,b){
function ordered(v){if(Array.isArray(v))return v.map(ordered);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(function(k){return [k,ordered(v[k])];}));return v;}
return JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
}
async function refreshRecapPresentation(db,report,fetchImpl){
var stored=conversationRecap.saved(report);
if(!stored||(stored.quality_version===3&&stored.ratio_quality&&stored.ratio_quality.version===1)||!stored.source.fingerprint||!db.auth.getSession)return report;
try{
 var session=await db.auth.getSession(),token=session.data&&session.data.session&&session.data.session.access_token;
 if(session.error||!token)return report;
 var send=fetchImpl||(typeof fetch==='function'?fetch:null);if(!send)return report;
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},7000);
 try{
  var response=await send('/api/conversation-recap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({booking_id:report.booking_id,learner_version:stored.source.learner_version}),signal:controller.signal});
  if(!response.ok)return report;
  var payload=await response.json(),fresh=payload&&payload.recap;
  if(!fresh||fresh.booking_id!==report.booking_id||fresh.generator!==stored.generator||fresh.schema_version!==stored.schema_version||fresh.quality_version!==3||!fresh.source||fresh.source.fingerprint!==stored.source.fingerprint||!sameStoredData(fresh.questions,stored.questions)||!sameStoredData(fresh.metrics,stored.metrics))return report;
  var display=Object.assign({},stored);['topics','expressions','word_expansion','interpretation','comment','quality_version','story_source_version','ratio_quality'].forEach(function(k){display[k]=fresh[k];});
  // Presentation only: preserve stored progress, source, counts, history and all other report fields.
  return Object.assign({},report,{feedback:conversationRecap.mergeFeedback(report.feedback,display)});
 }finally{clearTimeout(timer);}
}catch(_){return report;}
}
async function fetchLatest(db,bookingId,fetchImpl){
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId||'') || !db)throw Error('report-identity');
var auth=await db.auth.getUser(),user=auth.data&&auth.data.user;if(auth.error||!user)throw Error('report-auth');
var result=await db.from('session_reports').select('*').eq('booking_id',bookingId).eq('learner_id',user.id).maybeSingle();
if(result.error)throw Error('report-unavailable');
if(result.data&&(result.data.booking_id!==bookingId||result.data.learner_id!==user.id))throw Error('report-identity');
return result.data?refreshRecapPresentation(db,result.data,fetchImpl):null;
}
function withLatestContent(cached,latest){
if(!cached||!latest||cached.booking_id!==latest.booking_id)throw Error('report-identity');
var result=Object.assign({},cached);
['id','partner_comment','stamp','keyword','illust_url','summary','key_expressions','quiz_score','word_help','feedback'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(latest,k))result[k]=latest[k];});
if(text(latest.partner_name))result.partner_name=latest.partner_name;
return result;
}
function renderDetail(r,locale){r=r||{};var l=labels[locale]||labels.en,name=nickname(r,locale),t=treat(r),img=imageURL(r.illust_url),note=text(r.partner_comment);
var value=conversationRecap.saved(r);
if(!value&&Array.isArray(r.__dayoLearnerTranscript)&&r.__dayoLearnerSourceLogId){
  value=conversationRecap.build({bookingId:r.booking_id,learnerId:'authenticated-learner',language:r.language,
    learnerLog:{id:r.__dayoLearnerSourceLogId,booking_id:r.booking_id,participant_id:'authenticated-learner',participant_role:'learner',transcript:r.__dayoLearnerTranscript}});
}
var recap=value?conversationRecap.render(value,locale,{wordHelp:r.word_help}):renderLegacy(r,locale);
if(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.booking_id||'') && value.questions && value.questions.length && !(value.progress && value.progress.reason)) {
  recap+='<a class="recap-primary" href="session-recap.html?bookingId='+encodeURIComponent(r.booking_id)+'">'+(locale==='ko'?'단어 퀴즈 이어보기':'Continue the word quiz')+'</a>';
}

return '<article class="ucr-detail" data-booking-id="'+esc(r.booking_id||'')+'"'+memoryAttribute(r,locale)+'><header class="ucr-header"><p class="ucr-eyebrow">DayO · '+esc(l.record)+'</p><h3>'+esc(l.with+name)+'</h3><p class="ucr-meta">'+[date(r,locale),language(r)].filter(Boolean).map(esc).join(' · ')+'</p></header>'+recap+renderLetter(r,locale)+'<footer class="ucr-actions">'+(note||img?'<button id="btn-save-card" class="ucr-primary btn-save-card" type="button" onclick="saveInstaCard(event)">'+(locale==='ko'?'대화 카드 저장':'Save conversation card')+'</button>':'')+'<button type="button" onclick="closeReportDetailModal()">'+esc(l.close)+'</button></footer></article>';}
function renderArchive(r,index,locale){r=r||{};var l=labels[locale]||labels.en,t=treat(r);return '<button class="mypage-report-item ucr-archive" type="button" onclick="openReportDetailModal(\'report-'+(index+1)+'\')"><span class="ucr-archive-content"><strong>'+esc(l.with+nickname(r,locale))+'</strong><span class="ucr-meta">'+[date(r,locale),language(r)].filter(Boolean).map(esc).join(' · ')+'</span>'+(text(r.keyword)?'<span class="ucr-archive-theme">'+esc(r.keyword)+'</span>':'')+'<span class="ucr-archive-badges">'+(conversationRecap.saved(r)&&conversationRecap.saved(r).progress.total?'<span>'+esc(conversationRecap.labels(locale).mini)+' · '+esc(conversationRecap.saved(r).progress.completed+'/'+conversationRecap.saved(r).progress.total)+'</span>':'')+'</span></span><span class="ucr-archive-open">'+esc(l.open)+' →</span></button>';}
return {memoryData:memoryData,refreshRecapPresentation:refreshRecapPresentation,withLatestContent:withLatestContent,renderImmediate:renderImmediate,renderLetter:renderLetter,fetchLatest:fetchLatest,hideIllustration:hideIllustration,renderDetail:renderDetail,renderArchive:renderArchive,corrections:corrections,expressions:expressions,summary:summary,quiz:quiz};
});
