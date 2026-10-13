(function(){
 'use strict';
 var contract=window.DayOPartnerReportContract,root,context={},selectedKeyword='',imageUrl=null,request=0,timer=null,initialized=false,letterRun=0,letterTopics=[],letterTopic='',letterVersion='',letterBooking='',imageChoices=[],imageVersion='',imageChoiceRun=0,imageBusy=false;
 function el(id){return document.getElementById(id);}
 function selectButtons(container,value){container.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.value===value));});}
 function setImageStatus(text){el('pr-image-status').textContent=text;}
 function imageState(state){
  if(!state||state.bookingId!==context.bookingId)return;
  var image=el('pr-illustration');imageUrl=state.url||null;
  if(imageUrl){image.src=imageUrl;image.hidden=false;}else{image.hidden=true;image.removeAttribute('src');}
  var messages={generation_disabled:'Illustration generation is currently unavailable. Your letter can still be sent.',unsupported_concept:'Illustration is unavailable for this topic. Your letter can still be sent.',provider_http_error:'The image provider could not create an illustration. Your letter can still be sent.',provider_request_failed:'The image provider is unavailable. Your letter can still be sent.',timeout:'The illustration is taking longer. You can send your letter; it can finish later.',image_load_failed:'The illustration could not be opened. Your letter can still be sent.',save_failed:'Your illustration is ready but could not be saved. Try again.',authorization_failure:'This session could not be verified for image generation.'};
  setImageStatus(state.failure?messages[state.failure]||'Illustration unavailable.':state.status==='saved'?'Illustration saved.':state.status==='ready'?'Illustration ready.':'Creating your illustration… You can send your letter now.');
 }
 function imageKo(){return window.partnerLetterLocale?window.partnerLetterLocale()==='KO':!!(window.DayOI18n&&String(window.DayOI18n.getLang()).toLowerCase()==='ko');}
 function imageCopy(en,ko){return imageKo()?ko:en;}
 async function requestIllustration(retry){
  if(contract.illustrationAvailable===false||imageBusy||!context.bookingId||!imageVersion||!imageChoices.some(function(c){return c.id===selectedKeyword;}))return;
  var booking=context.bookingId,theme=selectedKeyword,version=imageVersion,run=++request,id,key='dayo_keepsake_request:'+booking;
  try{var saved=JSON.parse(sessionStorage.getItem(key)||'null');if(retry!==true&&saved&&saved.theme===theme&&saved.version===version)id=saved.id;}catch(_){}
  id=id||crypto.randomUUID();try{sessionStorage.setItem(key,JSON.stringify({id:id,theme:theme,version:version}));}catch(_){}
  imageBusy=true;imageUrl=null;el('pr-illustration').hidden=true;el('pr-image-retry').disabled=true;
  setImageStatus(imageCopy('Creating your illustration… Your Letter can still be sent.','그림을 만들고 있어요. 레터는 그대로 보낼 수 있어요.'));
  try{var data=await letterRequest('partner_illustration_generate',{booking_id:booking,topic_id:theme,source_version:version,request_id:id});if(run!==request||booking!==context.bookingId)return;
   setImageStatus(data.status==='pending_review'?imageCopy('Image ready. Preview it below before sending.','그림이 준비됐어요. 아래에서 확인한 뒤 보내 주세요.'):data.status==='approved'?imageCopy('Image approved.','승인된 그림이에요.'):imageCopy('No usable image is available. Your Letter can still be sent.','사용 가능한 그림이 없어요. 레터는 그대로 보낼 수 있어요.'));
  }catch(_){if(run===request)setImageStatus(imageCopy('Image could not be confirmed. Check the preview below before retrying. Your Letter can still be sent.','그림 상태를 확인하지 못했어요. 다시 시도하기 전에 아래 미리보기를 확인해 주세요. 레터는 그대로 보낼 수 있어요.'));}
  finally{imageBusy=false;el('pr-image-retry').disabled=false;if(run===request&&booking===context.bookingId&&window.DayOKeepsakePartnerReview)await window.DayOKeepsakePartnerReview.open(booking,root,imageKo()?'ko':'en');}
 }
 function chooseKeyword(value,source){
  var keyword=contract.safeKeyword(value);if(!keyword){setImageStatus('Choose a short topic, without contact details or links.');return;}
  selectedKeyword=keyword;
  el('pr-keyword-value').textContent=imageCopy('Today’s theme: ','오늘의 소재: ')+(imageChoices.find(function(c){return c.id===keyword;})||{}).label;
  selectButtons(el('pr-keyword-options'),source==='suggested'?keyword:'custom');
  requestIllustration();
 }
 async function paintSuggestions(){
  var list=el('pr-keyword-options'),section=list.closest('.pr-optional'),run=++imageChoiceRun,booking=context.bookingId;list.replaceChildren();imageChoices=[];imageVersion='';
  if(section)section.hidden=contract.illustrationAvailable===false;if(contract.illustrationAvailable===false||!booking)return;
  el('pr-custom-keyword-field').hidden=true;el('pr-image-retry').textContent=imageCopy('Try illustration again','그림 다시 만들기');
  el('pr-keyword-hint').textContent=imageCopy('Checking this conversation’s verified themes…','이 대화에서 확인된 소재를 확인하고 있어요…');
  try{var data=await letterRequest('partner_illustration_choices',{booking_id:booking});if(run!==imageChoiceRun||booking!==context.bookingId)return;
   imageChoices=Array.isArray(data.choices)?data.choices.filter(function(c){return c&&typeof c.id==='string'&&typeof c.label==='string';}).slice(0,3):[];imageVersion=data.source_version||'';
   el('pr-keyword-hint').textContent=imageChoices.length?imageCopy('Choose a recorded theme to create an optional keepsake.','실제 대화 소재를 선택해 기념 그림을 만들 수 있어요.'):imageCopy('Not enough verified detail for an image. Your Letter works without one.','확인된 대화 소재가 부족해요. 그림 없이 레터를 보낼 수 있어요.');
   imageChoices.forEach(function(item){var button=document.createElement('button');button.type='button';button.textContent=item.label;button.dataset.value=item.id;button.setAttribute('aria-pressed',String(item.id===selectedKeyword));button.onclick=function(){chooseKeyword(item.id,'suggested');};list.append(button);});
  }catch(_){if(run===imageChoiceRun)el('pr-keyword-hint').textContent=imageCopy('Image themes are unavailable. Your Letter can still be sent.','그림 소재를 불러오지 못했어요. 레터는 그대로 보낼 수 있어요.');}
 }
 function letterStatus(text){if(el('pr-letter-status'))el('pr-letter-status').textContent=text;}
 async function letterRequest(action,extra){
  var db=window.supabaseClient;if(!db||!context.bookingId)throw Error('unavailable');
  var session=await db.auth.getSession(),token=session&&session.data&&session.data.session&&session.data.session.access_token;
  if(!token)throw Error('unavailable');
  var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},48000);
  try{var response=await fetch('/api/conversation-recap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(Object.assign({action:action,booking_id:context.bookingId},extra||{})),signal:controller.signal});
    if(!response.ok)throw Error('unavailable');return await response.json();
  }finally{clearTimeout(timeout);}
 }
 async function loadLetterTopics(){
  if(!el('pr-letter-topics'))return;
  var run=++letterRun;letterTopics=[];letterTopic='';letterVersion='';
  el('pr-letter-topics').replaceChildren();el('pr-letter-words').replaceChildren();el('pr-letter-drafts').replaceChildren();if(!selectedKeyword)paintSuggestions();el('pr-letter-generate').disabled=true;
  letterStatus('Checking this session’s saved speech and chat…');
  try{var data=await letterRequest('partner_letter_topics');if(run!==letterRun)return;
    letterTopics=Array.isArray(data.topics)?data.topics.slice(0,3):[];letterVersion=data.source_version||'';if(!selectedKeyword)paintSuggestions();
    [...new Set(letterTopics.flatMap(function(t){return t.words||t.nouns||[];}))].slice(0,5).forEach(function(word){var chip=document.createElement('span');chip.textContent=word;el('pr-letter-words').append(chip);});
    letterTopics.forEach(function(topic){var button=document.createElement('button');button.type='button';button.textContent=topic.label;button.title=topic.quote;button.dataset.value=topic.id;button.setAttribute('aria-pressed','false');
      button.addEventListener('click',function(){letterRun++;letterTopic=topic.id;selectButtons(el('pr-letter-topics'),topic.id);el('pr-letter-generate').disabled=false;el('pr-letter-drafts').replaceChildren();letterStatus((topic.source_medium==='chat'?'Recorded User chat: “':'Recorded User speech: “')+topic.quote+'”');});el('pr-letter-topics').append(button);});
    letterStatus(letterTopics.length?'Choose a story, then request sentences. You can always write your own.':'No reliable saved conversation detail is available. You can write your own message.');
  }catch(_){if(run===letterRun)letterStatus('Suggestions are unavailable. You can write and send your own message.');}
 }
 function sentenceParts(){return el('popup-partner-comment').value.split(/\n+/).map(function(s){return s.trim();}).filter(Boolean);}
 function showSelected(){
  var host=el('pr-letter-selected');if(!host)return;host.replaceChildren();
  var parts=sentenceParts();if(parts.length<2)return;
  parts.forEach(function(sentence,i){var row=document.createElement('div'),text=document.createElement('p');text.textContent=sentence;row.append(text);
   [['Move up',-1],['Move down',1],['Remove',0]].forEach(function(action){var button=document.createElement('button');button.type='button';button.textContent=action[0];button.disabled=action[1]!==0&&(i+action[1]<0||i+action[1]>=parts.length);button.onclick=function(){var next=sentenceParts();if(action[1]===0)next.splice(i,1);else {var j=i+action[1];[next[i],next[j]]=[next[j],next[i]];}el('popup-partner-comment').value=next.join('\n');showSelected();};row.append(button);});host.append(row);});
 }
 async function suggestLetters(){
  if(!letterTopic)return;var run=++letterRun,topic=letterTopics.find(function(t){return t.id===letterTopic;});
  el('pr-letter-generate').disabled=true;letterStatus('Preparing three sentence ideas for your review…');
  try{var data=await letterRequest('partner_letter_blocks',{topic_id:letterTopic,source_version:letterVersion});if(run!==letterRun)return;
    if(!Array.isArray(data.blocks)||data.blocks.length!==3)throw Error('unavailable');
    var types=new Set();data.blocks.forEach(function(b){if(!b||b.source_utterance_id!==topic.id||!['memory','reaction','next'].includes(b.type)||types.has(b.type)||typeof b.text!=='string'||b.text.length>220)throw Error('invalid');types.add(b.type);});
    el('pr-letter-drafts').replaceChildren();
    data.blocks.forEach(function(block){var card=document.createElement('div'),label=document.createElement('strong'),text=document.createElement('p'),actions=document.createElement('div'),use=document.createElement('button'),copy=document.createElement('button');card.className='pr-letter-draft';label.textContent={memory:'Suggested memory',reaction:'Suggested reaction',next:'Suggested next conversation'}[block.type];text.textContent=block.text;actions.className='pr-letter-block-actions';use.type=copy.type='button';use.textContent='Use this sentence';copy.textContent='Copy';
     use.onclick=function(){var area=el('popup-partner-comment'),parts=sentenceParts();if(parts.includes(block.text)){area.focus();return;}var value=(area.value.trim()?area.value.trim()+'\n':'')+block.text;if(value.length>1000){letterStatus('Your letter is full. Edit or remove a sentence before adding another.');return;}area.value=value;showSelected();area.focus();letterStatus('Sentence added. Choose two or three, edit them in your own voice, then send when ready.');};
     copy.onclick=async function(){try{await navigator.clipboard.writeText(block.text);letterStatus('Sentence copied.');}catch(_){letterStatus('Use this sentence to add it to your letter.');}};actions.append(use,copy);card.append(label,text,actions);el('pr-letter-drafts').append(card);});
    letterStatus('Choose the sentences that fit your conversation. A reaction is only for use if it feels true to you. Nothing has been sent.');
  }catch(_){if(run===letterRun){el('pr-letter-drafts').replaceChildren();letterStatus('Suggestions are unavailable. Your letter is unchanged; you can write and send it yourself.');}}
  finally{if(run===letterRun)el('pr-letter-generate').disabled=!letterTopic;}
 }
 function mount(){
  if(initialized)return;root=el('partner-report-popup');if(!root)return;
  if(window.DayOPartnerIllustration)window.DayOPartnerIllustration.subscribe(imageState);
  el('popup-partner-comment').addEventListener('input',showSelected);
  if(el('pr-letter-refresh'))el('pr-letter-refresh').addEventListener('click',loadLetterTopics);
  if(el('pr-letter-generate'))el('pr-letter-generate').addEventListener('click',suggestLetters);
  el('pr-use-keyword').addEventListener('click',function(){chooseKeyword(el('pr-custom-keyword').value,'custom');});
  el('pr-custom-keyword').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();chooseKeyword(e.target.value,'custom');}});
  el('pr-image-retry').addEventListener('click',function(){void requestIllustration(true);});initialized=true;
 }
 function open(data){
  mount();if(!initialized)return;context=data||{};
  paintSuggestions();showSelected();
  if(context.bookingId&&letterBooking!==context.bookingId){
    if(letterBooking){el('popup-partner-comment').value='';selectedKeyword='';imageUrl=null;request++;clearTimeout(timer);el('pr-illustration').hidden=true;el('pr-illustration').removeAttribute('src');el('pr-keyword-value').textContent='';paintSuggestions();}
    letterBooking=context.bookingId;loadLetterTopics();
  }
  var ko=window.partnerLetterLocale ? window.partnerLetterLocale()==='KO' : !!(window.DayOI18n&&window.DayOI18n.getLang&&String(window.DayOI18n.getLang()).toLowerCase()==='ko'&&localStorage.getItem('dayo_lang')==='KO');
  el('pr-title').textContent=ko?'파트너 레터':'Partner Letter';
  if(window.DayOKeepsakePartnerReview)window.DayOKeepsakePartnerReview.open(context.bookingId,root,ko?'ko':'en');
  root.querySelector('.pr-intro').textContent=ko?'오늘 이 고객과 실제로 나눈 이야기만 담아 주세요. 누구에게나 보낼 수 있는 인사말은 피해주세요.':'Write a personal note about something this learner really shared with you. Only you could write it.';
  if(!el('btn-final-partner-submit').disabled)el('btn-final-partner-submit').textContent=ko?'메시지 보내고 마치기':'Send letter and finish';
 }
 document.addEventListener('dayo:langchange',function(){if(initialized&&root&&root.style.display!=='none')open(context);});
 window.DayOPartnerReport={open:open,refresh:function(data){context=data||context;if(initialized&&!selectedKeyword)paintSuggestions();},payload:function(){return {stamp:null,partnerComment:el('popup-partner-comment').value,keyword:selectedKeyword||null,illustUrl:imageUrl,illustrationToken:window.DayOPartnerIllustration&&(window.DayOPartnerIllustration.state(context.bookingId)||{}).token};}};
})();
