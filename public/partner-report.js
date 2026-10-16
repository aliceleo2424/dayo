(function(){
 'use strict';
 var contract=window.DayOPartnerReportContract,root,context={},selectedKeyword='',imageUrl=null,request=0,timer=null,initialized=false,letterRun=0,letterTopics=[],letterTopic='',letterVersion='',letterBooking='',imageChoices=[],imageVersion='',imageChoiceRun=0,imageBusy=false,imageSkipped=false;
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
 // Owner decision 2026-10-14: show a few concrete words the learner said; the Partner picks 1-2 for one illustration.
 // Owner decision 2026-10-15: a Letter needs at least 400 characters (spaces and punctuation included).
 var LETTER_MIN=400,letterKo=false;
 function letterLength(){var area=el('popup-partner-comment');return area?Array.from(area.value.trim()).length:0;}
 function paintLetterCount(){var n=el('pr-letter-count');if(!n)return;var len=letterLength(),ok=len>=LETTER_MIN;n.textContent=ok?(letterKo?len+'자 · 보낼 수 있어요':len+' characters · ready to send'):(letterKo?len+' / '+LETTER_MIN+'자 (최소 '+LETTER_MIN+'자)':len+' / '+LETTER_MIN+' characters minimum');n.classList.toggle('is-ready',ok);}
 var IMAGE_DISPLAY=4,imageOffset=0,imagePicked=[],imageMaxPick=1,imageChoicesBooking='';
 function choiceLabel(c){return imageKo()?c.label:(c.label_en||c.label);}
 function pickedChoices(){return imagePicked.map(function(id){return imageChoices.find(function(c){return c.id===id;});}).filter(Boolean);}
 function imageError(code){
  var m={attempt_limit:['You have used both drawings for this session. Send the image below or choose “Don’t use”.','이 대화의 그림은 두 번까지 그릴 수 있어요. 아래 그림을 보내거나 “사용하지 않기”를 선택해 주세요.'],generation_pending:['The illustration is still being drawn. Please wait a moment.','그림을 아직 그리고 있어요. 잠시만 기다려 주세요.'],quality_rejected:['That drawing had visible text or marks, so it can’t be used. Try drawing again.','그림에 글자나 표시가 보여서 사용할 수 없어요. 다시 그리기를 눌러 주세요.'],daily_budget_exhausted:['Today’s illustration limit has been reached. Your Letter can still be sent.','오늘 그릴 수 있는 그림 수를 다 썼어요. 레터는 그대로 보낼 수 있어요.'],canonical_revision_changed:['The saved conversation changed. Choose the words again.','저장된 대화가 바뀌었어요. 단어를 다시 골라 주세요.']}[code];
  return m?m[imageKo()?1:0]:imageCopy('Image could not be confirmed. Check the preview below before retrying. Your Letter can still be sent.','그림 상태를 확인하지 못했어요. 다시 시도하기 전에 아래 미리보기를 확인해 주세요. 레터는 그대로 보낼 수 있어요.');
 }
 // Owner decision 2026-10-17: the Partner must create an image or explicitly choose to send without one.
 function paintSkip(){var b=el('pr-image-skip');if(!b)return;b.textContent=imageCopy('Send without a picture','그림 없이 보내기');b.setAttribute('aria-pressed',String(imageSkipped));}
 function toggleSkip(){imageSkipped=!imageSkipped;paintSkip();setImageStatus(imageSkipped?imageCopy('This Letter will go without a new picture. The learner will see the DayO illustration.','이번 레터는 그림 없이 보내요. 고객에게는 DayO 기본 그림이 함께 보여요.'):'');}
 function imageDecision(){if(contract.illustrationAvailable===false||!el('pr-image-make'))return 'unavailable';if(imageBusy)return 'busy';return imageSkipped?'skip':'none';}
 function imageControls(){var picked=pickedChoices().length;el('pr-image-make').disabled=imageBusy||!picked;el('pr-image-retry').disabled=imageBusy||!picked;el('pr-keyword-more').hidden=imageChoices.length<=IMAGE_DISPLAY;}
 async function requestIllustration(retry){
  var chosen=pickedChoices();
  if(contract.illustrationAvailable===false||imageBusy||!context.bookingId||!imageVersion||!chosen.length)return;
  var booking=context.bookingId,theme=chosen.map(function(c){return c.id;}).join('+'),version=imageVersion,run=++request,id,key='dayo_keepsake_request:'+booking;
  try{var saved=JSON.parse(sessionStorage.getItem(key)||'null');if(retry!==true&&saved&&saved.theme===theme&&saved.version===version)id=saved.id;}catch(_){}
  id=id||crypto.randomUUID();try{sessionStorage.setItem(key,JSON.stringify({id:id,theme:theme,version:version}));}catch(_){}
  imageBusy=true;imageSkipped=false;paintSkip();imageUrl=null;el('pr-illustration').hidden=true;imageControls();
  setImageStatus(imageCopy('Drawing your illustration… Your Letter can still be sent.','그림을 그리고 있어요. 레터는 그대로 보낼 수 있어요.'));
  var body=chosen[0].token?{keywords:chosen.map(function(c){return c.token;})}:{topic_id:chosen[0].id};
  try{var data=await letterRequest('partner_illustration_generate',Object.assign({booking_id:booking,source_version:version,request_id:id},body));if(run!==request||booking!==context.bookingId)return;
   setImageStatus(data.status==='pending_review'?imageCopy('Image ready. Check it below, then send it or choose “Don’t use”.','그림이 준비됐어요. 아래에서 확인하고 보내거나 “사용하지 않기”를 골라 주세요.'):data.status==='approved'?imageCopy('Image approved.','승인된 그림이에요.'):imageCopy('No usable image is available. Your Letter can still be sent.','사용 가능한 그림이 없어요. 레터는 그대로 보낼 수 있어요.'));
  }catch(e){if(run===request)setImageStatus(imageError(e&&e.message));}
  finally{imageBusy=false;imageControls();if(run===request&&booking===context.bookingId&&window.DayOKeepsakePartnerReview)await window.DayOKeepsakePartnerReview.open(booking,root,imageKo()?'ko':'en',{autoPreview:true});}
 }
 function toggleKeyword(id){
  var at=imagePicked.indexOf(id);
  if(at>=0)imagePicked.splice(at,1);
  else if(imageMaxPick===1)imagePicked=[id];
  else if(imagePicked.length>=imageMaxPick){setImageStatus(imageCopy('Choose up to '+imageMaxPick+' words for one illustration.','한 그림에는 단어를 '+imageMaxPick+'개까지 고를 수 있어요.'));return;}
  else imagePicked.push(id);
  paintChoiceButtons();
 }
 function paintChoiceButtons(){
  var list=el('pr-keyword-options'),chosen=pickedChoices();list.replaceChildren();
  imageChoices.slice(imageOffset,imageOffset+IMAGE_DISPLAY).forEach(function(item){var button=document.createElement('button');button.type='button';button.textContent=choiceLabel(item);button.dataset.value=item.id;button.setAttribute('aria-pressed',String(imagePicked.includes(item.id)));button.onclick=function(){toggleKeyword(item.id);};list.append(button);});
  selectedKeyword=chosen.map(function(c){return c.label;}).join(', ').slice(0,60);
  el('pr-keyword-value').textContent=chosen.length?imageCopy('Selected: ','고른 단어: ')+chosen.map(choiceLabel).join(', '):'';
  imageControls();
 }
 async function paintSuggestions(force){
  var list=el('pr-keyword-options'),section=list.closest('.pr-optional'),booking=context.bookingId;
  if(section)section.hidden=contract.illustrationAvailable===false;if(contract.illustrationAvailable===false||!booking)return;
  el('pr-custom-keyword-field').hidden=true;el('pr-image-make').textContent=imageCopy('Create illustration','그림 만들기');el('pr-image-retry').textContent=imageCopy('Draw again (once)','다시 그리기 (1번 가능)');el('pr-keyword-more').textContent=imageCopy('Show other words','다른 단어 보기');paintSkip();
  if(section&&section.querySelector('summary'))section.querySelector('summary').textContent=imageCopy('Conversation keepsake illustration · make one or choose “Send without a picture”','대화 기념 그림 · 그림을 만들거나 “그림 없이 보내기”를 골라 주세요');
  // One text-model call per booking; re-opening the popup reuses the same words.
  if(force!==true&&imageChoicesBooking===booking){paintChoiceButtons();return;}
  var run=++imageChoiceRun;list.replaceChildren();imageChoices=[];imageVersion='';imagePicked=[];imageOffset=0;imageChoicesBooking=booking;imageControls();
  el('pr-keyword-hint').textContent=imageCopy('Finding things the learner talked about…','학습자가 이야기한 단어를 찾고 있어요…');
  try{var data=await letterRequest('partner_illustration_choices',{booking_id:booking});if(run!==imageChoiceRun||booking!==context.bookingId)return;
   imageChoices=Array.isArray(data.choices)?data.choices.filter(function(c){return c&&typeof c.id==='string'&&typeof c.label==='string'&&(c.label_en==null||typeof c.label_en==='string');}).slice(0,8):[];imageVersion=data.source_version||'';
   imageMaxPick=data.mode==='keywords'&&data.max_pick===2?2:1;
   el('pr-keyword-hint').textContent=!imageChoices.length?imageCopy('Not enough saved detail for an image. Your Letter works without one.','저장된 대화에서 그릴 만한 단어를 찾지 못했어요. 그림 없이 레터를 보낼 수 있어요.'):imageMaxPick===2?imageCopy('Pick 1–2 words the learner said. They become one watercolor illustration with no text.','학습자가 말한 단어를 1~2개 고르면 글자 없는 수채화 그림 한 장으로 그려요.'):imageCopy('Pick a theme from this conversation to create an optional keepsake.','대화 소재를 골라 기념 그림을 만들 수 있어요.');
   paintChoiceButtons();
  }catch(_){if(run===imageChoiceRun){imageChoicesBooking='';el('pr-keyword-hint').textContent=imageCopy('Image words are unavailable. Your Letter can still be sent.','그림 단어를 불러오지 못했어요. 레터는 그대로 보낼 수 있어요.');}}
 }
 // Letter-help status copy follows the popup locale (KO/EN).
 var LETTER_KO={'Checking this session’s saved speech and chat…':'이 대화의 저장된 말과 채팅을 확인하고 있어요…','Choose a story, then request sentences. You can always write your own.':'이야기를 고른 뒤 문장 제안을 받아 보세요. 직접 써도 좋아요.','No reliable saved conversation detail is available. You can write your own message.':'저장된 대화에서 확실한 이야기를 찾지 못했어요. 직접 메시지를 써 주세요.','Suggestions are unavailable. You can write and send your own message.':'지금은 제안을 받을 수 없어요. 직접 메시지를 써서 보내 주세요.','Preparing three sentence ideas for your review…':'검토할 문장 아이디어 3개를 준비하고 있어요…','Choose the sentences that fit your conversation. A reaction is only for use if it feels true to you. Nothing has been sent.':'대화에 맞는 문장을 골라 주세요. 반응 문장은 진심일 때만 써 주세요. 아직 아무것도 보내지 않았어요.','Suggestions are unavailable. Your letter is unchanged; you can write and send it yourself.':'지금은 제안을 받을 수 없어요. 작성 중인 레터는 그대로예요. 직접 써서 보내 주세요.','Your letter is full. Edit or remove a sentence before adding another.':'레터가 가득 찼어요. 문장을 고치거나 지운 뒤 추가해 주세요.','Sentence added. Choose two or three, edit them in your own voice, then send when ready.':'문장을 추가했어요. 두세 문장을 골라 내 말투로 다듬은 뒤 보내 주세요.','Sentence copied.':'문장을 복사했어요.','Use this sentence to add it to your letter.':'“이 문장 사용”을 눌러 레터에 추가해 주세요.'};
 function letterStatus(text){if(!el('pr-letter-status'))return;if(imageKo()){text=LETTER_KO[text]||String(text).replace(/^Recorded User chat: /,'고객이 채팅으로 쓴 말: ').replace(/^Recorded User speech: /,'고객이 말한 내용: ');}el('pr-letter-status').textContent=text;}
 async function letterRequest(action,extra){
  var db=window.supabaseClient;if(!db||!context.bookingId)throw Error('unavailable');
  var session=await db.auth.getSession(),token=session&&session.data&&session.data.session&&session.data.session.access_token;
  if(!token)throw Error('unavailable');
  var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},48000);
  try{var response=await fetch('/api/conversation-recap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(Object.assign({action:action,booking_id:context.bookingId},extra||{})),signal:controller.signal});
    if(!response.ok){var failed={};try{failed=await response.json();}catch(_){}throw Error(failed&&typeof failed.error==='string'?failed.error:'unavailable');}return await response.json();
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
  paintLetterCount();
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
  el('pr-image-make').addEventListener('click',function(){void requestIllustration();});
  if(el('pr-image-skip'))el('pr-image-skip').addEventListener('click',toggleSkip);
  el('pr-keyword-more').addEventListener('click',function(){imageOffset=imageOffset+IMAGE_DISPLAY>=imageChoices.length?0:imageOffset+IMAGE_DISPLAY;paintChoiceButtons();});
  el('pr-image-retry').addEventListener('click',function(){void requestIllustration(true);});initialized=true;
 }
 function open(data){
  mount();if(!initialized)return;context=data||{};
  paintSuggestions();showSelected();
  if(context.bookingId&&letterBooking!==context.bookingId){
    if(letterBooking){el('popup-partner-comment').value='';selectedKeyword='';imagePicked=[];imageSkipped=false;imageUrl=null;request++;clearTimeout(timer);el('pr-illustration').hidden=true;el('pr-illustration').removeAttribute('src');el('pr-keyword-value').textContent='';paintSuggestions();}
    letterBooking=context.bookingId;loadLetterTopics();
  }
  var ko=window.partnerLetterLocale ? window.partnerLetterLocale()==='KO' : !!(window.DayOI18n&&window.DayOI18n.getLang&&String(window.DayOI18n.getLang()).toLowerCase()==='ko'&&localStorage.getItem('dayo_lang')==='KO');
  el('pr-title').textContent=ko?'파트너 레터':'Partner Letter';
  if(window.DayOKeepsakePartnerReview)window.DayOKeepsakePartnerReview.open(context.bookingId,root,ko?'ko':'en',{autoPreview:true});
  localizeStatic(ko);letterKo=ko;paintLetterCount();
  root.querySelector('.pr-intro').textContent=ko?'오늘 이 고객과 실제로 나눈 이야기만 담아 주세요. 누구에게나 보낼 수 있는 인사말은 피해주세요.':'Write a personal note about something this learner really shared with you. Only you could write it.';
  if(!el('btn-final-partner-submit').disabled)el('btn-final-partner-submit').textContent=ko?'메시지 보내고 마치기':'Send letter and finish';
 }
 // Static Letter copy (KO/EN). Image-section copy is set by paintSuggestions.
 function localizeStatic(ko){
  var q=function(s){return root.querySelector(s);},t=function(s,en,kr){var n=q(s);if(n)n.textContent=ko?kr:en;};
  t('.pr-letter-compose h3','A note only this learner could receive','이 고객만 받을 수 있는 메시지');
  var steps=q('.pr-letter-steps');if(steps)steps.innerHTML=ko?'고객이 들려준 <strong>실제 이야기 하나</strong>를 떠올리고, <strong>내 진심 어린 반응</strong>을 더한 뒤, 다음에 <strong>더 듣고 싶은 이야기</strong>로 마무리해 주세요.':'Recall <strong>one real detail</strong> they shared. Add <strong>your genuine response</strong>. End with <strong>something specific</strong> you\'d love to hear next time.';
  t('.pr-letter-warning','Please avoid generic lines like “I enjoyed talking to you today.” Never invent a story or pretend the learner said something you did not hear.','“오늘 즐거웠어요” 같은 누구에게나 쓸 수 있는 문장은 피해 주세요. 고객이 하지 않은 이야기를 지어내지 마세요.');
  var label=q('label[for="popup-partner-comment"]');if(label&&label.firstChild&&label.firstChild.nodeType===3)label.firstChild.nodeValue=ko?'나의 메시지':'Your personal message';
  t('.pr-letter-assist summary','Optional: find details in the saved conversation','선택: 저장된 대화에서 이야기 찾기');
  t('.pr-letter-assist .pr-hint','Only real, verified learner speech or chat can generate sentence ideas. If no reliable text was recorded, write from what you actually remember—never guess.','실제로 기록된 고객의 말이나 채팅만으로 문장 아이디어를 만들어요. 기록이 부족하면 기억나는 내용으로 직접 써 주세요. 추측해서 쓰지 마세요.');
  t('#pr-letter-refresh','Check saved conversation','저장된 대화 확인');
  t('#pr-letter-generate','Help phrase this memory','이 이야기로 문장 제안받기');
  t('.pr-transcript summary','View conversation transcript — reference only','대화 기록 보기 — 참고용');
 }
 document.addEventListener('dayo:langchange',function(){if(initialized&&root&&root.style.display!=='none')open(context);});
 window.DayOPartnerReport={letterMin:LETTER_MIN,letterLength:letterLength,imageDecision:imageDecision,open:open,refresh:function(data){context=data||context;if(initialized&&!selectedKeyword)paintSuggestions();},payload:function(){return {stamp:null,partnerComment:el('popup-partner-comment').value,keyword:selectedKeyword||null,illustUrl:imageUrl,illustrationToken:window.DayOPartnerIllustration&&(window.DayOPartnerIllustration.state(context.bookingId)||{}).token};}};
})();
