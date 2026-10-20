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
  var m={attempt_limit:['You have used both drawings for this session. Send the picture above or choose “Send with the DayO picture”.','이 대화의 그림은 두 번까지 그릴 수 있어요. 위 그림을 보내거나 “기본 그림으로 보내기”를 골라 주세요.'],generation_pending:['The illustration is still being drawn. Please wait a moment.','그림을 아직 그리고 있어요. 잠시만 기다려 주세요.'],quality_rejected:['That drawing had visible text or marks, so it can’t be used. Try drawing again.','그림에 글자나 표시가 보여서 사용할 수 없어요. 다시 그리기를 눌러 주세요.'],daily_budget_exhausted:['Today’s illustration limit has been reached. Your Letter can still be sent.','오늘 그릴 수 있는 그림 수를 다 썼어요. 레터는 그대로 보낼 수 있어요.'],canonical_revision_changed:['The saved conversation changed. Choose the words again.','저장된 대화가 바뀌었어요. 단어를 다시 골라 주세요.']}[code];
  return m?m[imageKo()?1:0]:imageCopy('Image could not be confirmed. Check the preview below before retrying. Your Letter can still be sent.','그림 상태를 확인하지 못했어요. 다시 시도하기 전에 아래 미리보기를 확인해 주세요. 레터는 그대로 보낼 수 있어요.');
 }
 // Owner decision 2026-10-17: the Partner must create an image or explicitly choose to send without one.
 // Owner decision 2026-10-17 (later): opening the Letter draws one picture from the user's words automatically;
 // the Partner can draw again or switch to the DayO picture. Never auto-draws over an existing image, and only once per booking on this device.
 var DEFAULT_PICTURE='images/keepsake-default.webp';
 function paintSkip(){var b=el('pr-image-skip');if(!b)return;b.textContent=imageSkipped?imageCopy('Cancel the DayO picture','기본 그림 취소'):imageCopy('Send with the DayO picture','기본 그림으로 보내기');b.setAttribute('aria-pressed',String(imageSkipped));
  var img=el('pr-illustration');if(!img||imageUrl)return;if(imageSkipped){img.src=DEFAULT_PICTURE;img.alt=imageCopy('DayO picture sent with your Letter','레터와 함께 가는 DayO 기본 그림');img.hidden=false;}else if(img.getAttribute('src')===DEFAULT_PICTURE){img.hidden=true;img.removeAttribute('src');}}
 function toggleSkip(){imageSkipped=!imageSkipped;wordsOpen=false;paintSkip();setImageStatus('');paintImageArea();}
 // Owner decision 2026-10-20: one picture area. The drawn picture comes first with two choices only:
 // draw again with other words (once) or send with the DayO picture ("Don't use" is merged into it).
 var wordsOpen=false,baseHint='';
 function paintImageArea(){
  if(!root)return;var area=root.querySelector('.pr-optional');if(!area)return;
  var review=root.querySelector('.pr-keepsake-review'),layout=area.querySelector('.pr-keyword-layout');
  if(review&&layout&&review.nextElementSibling!==layout)area.insertBefore(review,layout);
  var r=window.DayOKeepsakePartnerReview,d=r&&r.decision?r.decision(context.bookingId,root):'none',hasPicture=imageBusy||d==='shown'||d==='approved';
  root.classList.toggle('pr-image-skipped',imageSkipped);
  var words=el('pr-image-words');if(words)words.hidden=!(wordsOpen||(!hasPicture&&!imageSkipped));
  if(words&&el('pr-keyword-value'))el('pr-keyword-value').hidden=words.hidden;
  var redraw=el('pr-image-redraw');if(redraw){redraw.hidden=!hasPicture||imageSkipped||wordsOpen;redraw.disabled=imageBusy;redraw.textContent=imageCopy('Draw again with other words (once)','다른 단어로 다시 그리기 (1번)');}
  var hint=el('pr-keyword-hint'),words2=pickedChoices().map(choiceLabel).join(', ');
  if(hint&&imageSkipped)hint.textContent=imageCopy('Your Letter will go with this DayO picture.','편지와 함께 이 DayO 기본 그림이 전달돼요.');
  else if(hint&&wordsOpen)hint.textContent=imageCopy('Pick 1–2 other words the user said, then press “Create illustration”.','고객이 말한 다른 단어를 1~2개 고른 뒤 “그림 만들기”를 눌러 주세요.');
  else if(hint&&hasPicture&&!imageSkipped)hint.textContent=imageCopy('This picture was drawn from words the user said'+(words2?' ('+words2+')':'')+'. It goes with your Letter.','고객이 말한 단어'+(words2?'('+words2+')':'')+'로 그린 그림이에요. 이 그림이 편지와 함께 가요.');
  else if(hint&&baseHint)hint.textContent=baseHint;
 }
 function imageDecision(){if(contract.illustrationAvailable===false||!el('pr-image-make'))return 'unavailable';if(imageBusy)return 'busy';return imageSkipped?'skip':'none';}
 function imageControls(){var picked=pickedChoices().length;el('pr-image-make').disabled=imageBusy||!picked;el('pr-image-retry').disabled=imageBusy||!picked;el('pr-keyword-more').hidden=imageChoices.length<=IMAGE_DISPLAY;paintImageArea();}
 async function requestIllustration(retry){
  var chosen=pickedChoices();
  if(contract.illustrationAvailable===false||imageBusy||!context.bookingId||!imageVersion||!chosen.length)return;
  var booking=context.bookingId,theme=chosen.map(function(c){return c.id;}).join('+'),version=imageVersion,run=++request,id,key='dayo_keepsake_request:'+booking;
  try{var saved=JSON.parse(sessionStorage.getItem(key)||'null');if(retry!==true&&saved&&saved.theme===theme&&saved.version===version)id=saved.id;}catch(_){}
  id=id||crypto.randomUUID();try{sessionStorage.setItem(key,JSON.stringify({id:id,theme:theme,version:version}));}catch(_){}
  imageBusy=true;imageSkipped=false;wordsOpen=false;paintSkip();imageUrl=null;el('pr-illustration').hidden=true;imageControls();
  setImageStatus(imageCopy('Drawing your illustration… Your Letter can still be sent.','그림을 그리고 있어요. 레터는 그대로 보낼 수 있어요.'));
  var body=chosen[0].token?{keywords:chosen.map(function(c){return c.token;})}:{topic_id:chosen[0].id};
  try{var data=await letterRequest('partner_illustration_generate',Object.assign({booking_id:booking,source_version:version,request_id:id},body));if(run!==request||booking!==context.bookingId)return;
   setImageStatus(data.status==='pending_review'?imageCopy('The picture is ready.','그림이 준비됐어요.'):data.status==='approved'?imageCopy('Image approved.','승인된 그림이에요.'):imageCopy('No usable image is available. Your Letter can still be sent.','사용 가능한 그림이 없어요. 레터는 그대로 보낼 수 있어요.'));
  }catch(e){if(run===request)setImageStatus(imageError(e&&e.message));}
  finally{imageBusy=false;imageControls();if(run===request&&booking===context.bookingId&&window.DayOKeepsakePartnerReview){await window.DayOKeepsakePartnerReview.open(booking,root,imageKo()?'ko':'en',{autoPreview:true});paintImageArea();}}
 }
 var autoTried={},imageMode='';
 async function autoIllustrate(booking){
  if(autoTried[booking]||booking!==context.bookingId||contract.illustrationAvailable===false)return;
  // Owner report 2026-10-20: a general fallback theme ("Food") drew a generic picture. Auto-draw only real words the user said.
  if(imageMode!=='keywords')return;
  if(imageSkipped||imageBusy||imageUrl||imagePicked.length||!imageChoices.length||!imageVersion)return;
  var key='dayo_keepsake_auto:'+booking;try{if(localStorage.getItem(key))return;}catch(_){}
  autoTried[booking]=true;
  var review=window.DayOKeepsakePartnerReview,has=review&&review.hasImage?await review.hasImage(booking,root):null;
  // Only draw when it is confirmed that no image exists yet for this booking.
  if(has!==false||booking!==context.bookingId||imageSkipped||imageBusy||imageUrl||imagePicked.length)return;
  imagePicked=imageChoices.slice(0,imageMaxPick).map(function(c){return c.id;});paintChoiceButtons();
  try{localStorage.setItem(key,String(Date.now()));}catch(_){}
  await requestIllustration();
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
  if(section&&section.querySelector('summary'))section.querySelector('summary').textContent=imageCopy('Picture sent with your Letter','편지와 함께 갈 그림');
  // One text-model call per booking; re-opening the popup reuses the same words.
  if(force!==true&&imageChoicesBooking===booking){paintChoiceButtons();return;}
  var run=++imageChoiceRun;list.replaceChildren();imageChoices=[];imageVersion='';imagePicked=[];imageOffset=0;imageChoicesBooking=booking;imageControls();
  el('pr-keyword-hint').textContent=imageCopy('Finding things the user talked about…','고객이 이야기한 단어를 찾고 있어요…');
  try{var data=await letterRequest('partner_illustration_choices',{booking_id:booking});if(run!==imageChoiceRun||booking!==context.bookingId)return;
   imageChoices=Array.isArray(data.choices)?data.choices.filter(function(c){return c&&typeof c.id==='string'&&typeof c.label==='string'&&(c.label_en==null||typeof c.label_en==='string');}).slice(0,8):[];imageVersion=data.source_version||'';
   imageMaxPick=data.mode==='keywords'&&data.max_pick===2?2:1;imageMode=data.mode==='keywords'?'keywords':'theme';
   el('pr-keyword-hint').textContent=!imageChoices.length?imageCopy('Not enough saved detail for an image. Your Letter works without one.','저장된 대화에서 그릴 만한 단어를 찾지 못했어요. 그림 없이 레터를 보낼 수 있어요.'):imageMaxPick===2?imageCopy('Pick 1–2 words the user said. They become one watercolor illustration with no text.','고객이 말한 단어를 1~2개 고르면 글자 없는 수채화 그림 한 장으로 그려요.'):imageCopy('We couldn’t find words to draw from this conversation, so only a general theme is shown. Create it, or send with the DayO picture.','이 대화에서 그릴 단어를 찾지 못해 일반 주제만 보여요. 그림을 만들거나 기본 그림으로 보내 주세요.');
   baseHint=el('pr-keyword-hint').textContent;
   paintChoiceButtons();
   void autoIllustrate(booking);
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
 // Owner decision 2026-10-20: the AI writes a Letter draft from what the user said; the Partner checks it
 // for anything that was not said, edits it and sends. A failed draft never blocks: the Partner writes it themselves.
 var draftRun=0,draftText='',draftUsed=false,draftLeft=0;
 function draftStatus(en,ko){var n=el('pr-draft-status');if(n)n.textContent=imageCopy(en,ko);}
 function draftKey(booking){return 'dayo_letter_draft:'+booking;}
 function paintDraftEvidence(facts){
  var list=el('pr-draft-evidence');if(!list)return;list.replaceChildren();
  (Array.isArray(facts)?facts:[]).slice(0,4).forEach(function(f){if(!f||typeof f.text!=='string')return;var item=document.createElement('li'),note=document.createElement('strong');note.textContent=f.text;item.append(note);
   (Array.isArray(f.quotes)?f.quotes:[]).slice(0,4).forEach(function(q){if(!q||typeof q.text!=='string')return;var line=document.createElement('span');line.textContent=(q.medium==='chat'?imageCopy('Chat: ','채팅: '):'')+'“'+q.text+'”';item.append(line);});list.append(item);});
 }
 function paintDraftTools(){
  var insert=el('pr-draft-insert'),retry=el('pr-draft-retry'),area=el('popup-partner-comment');if(!insert||!retry)return;
  insert.textContent=imageCopy('Use the AI draft','AI 초안 넣기');retry.textContent=imageCopy('Write the draft again (once)','초안 다시 쓰기 (1번 가능)');
  insert.hidden=!draftText||area.value.trim()===draftText;retry.hidden=!draftText||draftLeft<1;
  el('pr-draft-check').hidden=!draftUsed;
 }
 function useDraft(){var area=el('popup-partner-comment');area.value=draftText;draftUsed=true;el('pr-draft-confirm').checked=false;showSelected();paintDraftTools();
  draftStatus('An AI draft based on what the user said is in your letter below. Edit it in your own words.','고객이 한 말을 바탕으로 AI가 쓴 초안을 아래 편지에 넣었어요. 내 말투로 고쳐 주세요.');}
 function showDraft(data){
  draftText=typeof data.letter==='string'?data.letter:'';draftLeft=Number(data.attempts_left)||0;paintDraftEvidence(data.facts);
  if(!draftText){draftStatus('There isn’t enough saved conversation for a draft. Please write the letter yourself.','초안을 쓸 만큼 저장된 대화가 없어요. 직접 편지를 써 주세요.');paintDraftTools();return;}
  var area=el('popup-partner-comment');
  if(!area.value.trim())useDraft();
  else{draftStatus('An AI draft is ready. Press “Use the AI draft” to replace what you wrote, or keep writing yourself.','AI 초안이 준비됐어요. “AI 초안 넣기”를 누르면 지금 쓴 글이 초안으로 바뀌어요. 직접 계속 써도 좋아요.');paintDraftTools();}
 }
 async function loadDraft(retry){
  var box=el('pr-draft'),booking=context.bookingId;if(!box||!booking)return;box.hidden=false;
  if(retry!==true){try{var cached=JSON.parse(localStorage.getItem(draftKey(booking))||'null');if(cached&&typeof cached.letter==='string'){showDraft(cached);return;}}catch(_){}}
  var run=++draftRun;el('pr-draft-retry').disabled=true;
  draftStatus('AI is writing a letter draft from what the user said…','AI가 고객이 한 말을 바탕으로 편지 초안을 쓰고 있어요…');
  try{var data=await letterRequest(retry===true?'partner_letter_draft_retry':'partner_letter_draft');if(run!==draftRun||booking!==context.bookingId)return;
   if(data&&typeof data.letter==='string'&&data.letter){try{localStorage.setItem(draftKey(booking),JSON.stringify({letter:data.letter,facts:data.facts||[],attempts_left:data.attempts_left||0}));}catch(_){}}
   showDraft(data||{});
  }catch(_){if(run===draftRun){if(!draftText)draftStatus('The AI draft is unavailable right now. Please write the letter yourself — you can still send it.','지금은 AI 초안을 만들 수 없어요. 직접 편지를 써서 보내 주세요.');else draftStatus('The draft could not be written again. Your current letter is unchanged.','초안을 다시 쓰지 못했어요. 지금 쓴 편지는 그대로예요.');paintDraftTools();}}
  finally{if(run===draftRun)el('pr-draft-retry').disabled=false;}
 }
 function retryDraft(){var area=el('popup-partner-comment');if(area.value.trim()&&area.value.trim()!==draftText&&!window.confirm(imageCopy('Replace what you wrote with a new AI draft?','지금 쓴 글을 새 AI 초안으로 바꿀까요?')))return;area.value='';draftUsed=false;showSelected();void loadDraft(true);}
 function draftChecked(){var area=el('popup-partner-comment');if(!draftUsed||!area||!area.value.trim())return true;return !!(el('pr-draft-confirm')&&el('pr-draft-confirm').checked);}
 function sentenceParts(){return el('popup-partner-comment').value.split(/\n+/).map(function(s){return s.trim();}).filter(Boolean);}
 function showSelected(){
  paintLetterCount();
  var host=el('pr-letter-selected');if(!host)return;host.replaceChildren();
  // A draft-based Letter is edited in the box itself; the per-line list would only repeat it.
  var parts=sentenceParts();if(parts.length<2||draftUsed)return;
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
  el('popup-partner-comment').addEventListener('input',function(){showSelected();if(!el('popup-partner-comment').value.trim())draftUsed=false;paintDraftTools();});
  if(el('pr-draft-insert'))el('pr-draft-insert').addEventListener('click',function(){var area=el('popup-partner-comment');if(area.value.trim()&&!window.confirm(imageCopy('Replace what you wrote with the AI draft?','지금 쓴 글을 AI 초안으로 바꿀까요?')))return;useDraft();});
  if(el('pr-draft-retry'))el('pr-draft-retry').addEventListener('click',retryDraft);
  if(el('pr-letter-refresh'))el('pr-letter-refresh').addEventListener('click',loadLetterTopics);
  if(el('pr-letter-generate'))el('pr-letter-generate').addEventListener('click',suggestLetters);
  el('pr-image-make').addEventListener('click',function(){void requestIllustration();});
  if(el('pr-image-skip'))el('pr-image-skip').addEventListener('click',toggleSkip);
  if(el('pr-image-redraw'))el('pr-image-redraw').addEventListener('click',function(){wordsOpen=true;imagePicked=[];imageSkipped=false;paintSkip();paintChoiceButtons();});
  el('pr-keyword-more').addEventListener('click',function(){imageOffset=imageOffset+IMAGE_DISPLAY>=imageChoices.length?0:imageOffset+IMAGE_DISPLAY;paintChoiceButtons();});
  el('pr-image-retry').addEventListener('click',function(){void requestIllustration(true);});initialized=true;
 }
 function open(data){
  mount();if(!initialized)return;context=data||{};
  paintSuggestions();showSelected();
  if(context.bookingId&&letterBooking!==context.bookingId){
    if(letterBooking){el('popup-partner-comment').value='';selectedKeyword='';wordsOpen=false;imagePicked=[];imageSkipped=false;imageUrl=null;request++;clearTimeout(timer);el('pr-illustration').hidden=true;el('pr-illustration').removeAttribute('src');el('pr-keyword-value').textContent='';paintSuggestions();}
    draftRun++;draftText='';draftUsed=false;draftLeft=0;if(el('pr-draft-confirm'))el('pr-draft-confirm').checked=false;paintDraftEvidence([]);
    letterBooking=context.bookingId;loadLetterTopics();void loadDraft();
  }
  var ko=window.partnerLetterLocale ? window.partnerLetterLocale()==='KO' : !!(window.DayOI18n&&window.DayOI18n.getLang&&String(window.DayOI18n.getLang()).toLowerCase()==='ko'&&localStorage.getItem('dayo_lang')==='KO');
  el('pr-title').textContent=ko?'파트너 레터':'Partner Letter';
  if(window.DayOKeepsakePartnerReview)Promise.resolve(window.DayOKeepsakePartnerReview.open(context.bookingId,root,ko?'ko':'en',{autoPreview:true})).then(paintImageArea,paintImageArea);
  localizeStatic(ko);letterKo=ko;paintLetterCount();
  root.querySelector('.pr-intro').textContent=ko?'이 고객에게 직접 말을 거는 짧은 편지를 써 주세요(“you”). 고객이 한 말로 AI가 쓴 초안이 아래에 나와요. 대화에 없던 내용은 고치고, 내 말도 더해 주세요.':'Write a short letter to this user, speaking to them as “you”. An AI draft from what they said appears below: fix anything that wasn’t said and add your own words.';
  paintDraftTools();
  if(!el('btn-final-partner-submit').disabled)el('btn-final-partner-submit').textContent=ko?'메시지 보내고 마치기':'Send letter and finish';
 }
 // Static Letter copy (KO/EN). Image-section copy is set by paintSuggestions.
 function localizeStatic(ko){
  var q=function(s){return root.querySelector(s);},t=function(s,en,kr){var n=q(s);if(n)n.textContent=ko?kr:en;};
  t('.pr-letter-compose h3','A note only this user could receive','이 고객만 받을 수 있는 메시지');
  var steps=q('.pr-letter-steps');if(steps)steps.innerHTML=ko?'고객이 들려준 <strong>실제 이야기 하나</strong>를 떠올리고, <strong>내 진심 어린 반응</strong>을 더한 뒤, 다음에 <strong>더 듣고 싶은 이야기</strong>로 마무리해 주세요.':'Recall <strong>one real detail</strong> they shared. Add <strong>your genuine response</strong>. End with <strong>something specific</strong> you\'d love to hear next time.';
  t('.pr-letter-warning','Please avoid generic lines like “I enjoyed talking to you today.” Never invent a story or pretend the user said something you did not hear.','“오늘 즐거웠어요” 같은 누구에게나 쓸 수 있는 문장은 피해 주세요. 고객이 하지 않은 이야기를 지어내지 마세요.');
  var label=q('label[for="popup-partner-comment"]');if(label&&label.firstChild&&label.firstChild.nodeType===3)label.firstChild.nodeValue=ko?'고객에게 보내는 편지':'Your letter to the user';
  var area=el('popup-partner-comment');if(area)area.placeholder=ko?'Dear …, 로 시작해 고객에게 직접 편지처럼 써 주세요. 예: “I loved hearing about … Next time, tell me about …” — 내 이름':'Dear …, write to them directly, like a letter: “I loved hearing about … Next time, tell me about …” — your name';
  t('.pr-draft-warning','AI wrote this draft, so it can contain mistakes. Please read it carefully and fix anything that is wrong or was not said in your conversation before sending.','AI가 쓴 초안이라 실수가 있을 수 있어요. 보내기 전에 꼭 읽어 보고, 틀리거나 대화에 없던 내용은 고쳐 주세요.');
  t('.pr-draft-evidence summary','What the user said that the draft used','초안이 참고한 고객의 말');
  t('.pr-draft-confirm span','I checked the draft and fixed anything that was not said.','초안을 확인했고, 대화에 없던 내용은 고쳤어요.');
  t('.pr-letter-assist summary','Optional: find details in the saved conversation','선택: 저장된 대화에서 이야기 찾기');
  t('.pr-letter-assist .pr-hint','Only real, verified user speech or chat can generate sentence ideas. If no reliable text was recorded, write from what you actually remember—never guess.','실제로 기록된 고객의 말이나 채팅만으로 문장 아이디어를 만들어요. 기록이 부족하면 기억나는 내용으로 직접 써 주세요. 추측해서 쓰지 마세요.');
  t('#pr-letter-refresh','Check saved conversation','저장된 대화 확인');
  t('#pr-letter-generate','Help phrase this memory','이 이야기로 문장 제안받기');
  t('.pr-transcript summary','View conversation transcript — reference only','대화 기록 보기 — 참고용');
 }
 document.addEventListener('dayo:langchange',function(){if(initialized&&root&&root.style.display!=='none')open(context);});
 window.DayOPartnerReport={letterMin:LETTER_MIN,letterLength:letterLength,imageDecision:imageDecision,draftChecked:draftChecked,open:open,refresh:function(data){context=data||context;if(initialized&&!selectedKeyword)paintSuggestions();},payload:function(){return {stamp:null,partnerComment:el('popup-partner-comment').value,keyword:selectedKeyword||null,illustUrl:imageUrl,illustrationToken:window.DayOPartnerIllustration&&(window.DayOPartnerIllustration.state(context.bookingId)||{}).token};}};
})();
