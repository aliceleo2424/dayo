(function(){
 'use strict';
 var contract=window.DayOPartnerReportContract,root,context={},selectedKeyword='',imageUrl=null,request=0,timer=null,initialized=false,selectedTemplate='',noteEdited=false,letterRun=0,letterTopics=[],letterTopic='',letterVersion='',letterBooking='';
 function el(id){return document.getElementById(id);}
 function selectButtons(container,value){container.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.value===value));});}
 function setImageStatus(text){el('pr-image-status').textContent=text;}
 function imageState(state){
  if(!state||state.bookingId!==context.bookingId)return;
  var image=el('pr-illustration');imageUrl=state.url||null;
  if(imageUrl){image.src=imageUrl;image.hidden=false;}else{image.hidden=true;image.removeAttribute('src');}
  var messages={unsupported_concept:'Illustration is unavailable for this topic. Your letter can still be sent.',provider_http_error:'The image provider could not create an illustration. Your letter can still be sent.',provider_request_failed:'The image provider is unavailable. Your letter can still be sent.',timeout:'The illustration is taking longer. You can send your letter; it can finish later.',image_load_failed:'The illustration could not be opened. Your letter can still be sent.',save_failed:'Your illustration is ready but could not be saved. Try again.',authorization_failure:'This session could not be verified for image generation.'};
  setImageStatus(state.failure?messages[state.failure]||'Illustration unavailable.':state.status==='saved'?'Illustration saved.':state.status==='ready'?'Illustration ready.':'Creating your illustration… You can send your letter now.');
 }
 function requestIllustration(){
  var manager=window.DayOPartnerIllustration,keyword=contract.safeKeyword(selectedKeyword);if(!keyword||!manager)return;
  var current=manager.state(context.bookingId);if(current&&current.failure==='save_failed'&&current.theme===keyword){manager.retrySave(context.bookingId);return;}
  var run=++request;imageUrl=null;el('pr-illustration').hidden=true;setImageStatus('Creating your illustration… You can send your letter now.');
  manager.start({bookingId:context.bookingId,actorId:(window.DayORoomAccess||{}).partnerId,theme:keyword,seed:Math.floor(Math.random()*1000000)+1,current:function(){return run===request;}}).then(function(state){if(run===request)imageState(state);}).catch(function(){imageState({bookingId:context.bookingId,failure:'provider_request_failed'});});
 }
 function noteTopic(){return String(context.topic||(context.talkCard&&context.talkCard.topic)||'').trim();}
 function syncTopicTemplate(){
  var topic=noteTopic(),button=el('pr-note-templates').querySelector('[data-value="e"]');
  if(button){button.disabled=!topic;button.title=topic?'':'Available when a session or Talk Card topic is known.';}
  if(selectedTemplate==='e'&&!noteEdited)el('popup-partner-comment').value=contract.note('e',{topic:topic});
 }
 function chooseKeyword(value,source){
  var keyword=contract.safeKeyword(value);if(!keyword){setImageStatus('Choose a short topic, without contact details or links.');return;}
  selectedKeyword=keyword;
  el('pr-keyword-value').textContent='Today’s theme: '+keyword;
  selectButtons(el('pr-keyword-options'),source==='suggested'?keyword:'custom');
  requestIllustration();
 }
 function paintSuggestions(){
  var list=el('pr-keyword-options');list.replaceChildren();
  var candidates=contract.storyIllustrations(letterTopics);
  el('pr-keyword-hint').textContent=candidates.length?'Create a small memory from today’s recorded stories.':'There is not enough recorded story detail for an illustration. Your letter and card work without one.';
  candidates.forEach(function(item){var button=document.createElement('button');button.type='button';button.textContent=item.label;button.dataset.value=item.theme;button.setAttribute('aria-pressed',String(item.theme===selectedKeyword));button.onclick=function(){chooseKeyword(item.theme,'suggested');};list.append(button);});
 }
 function selectTemplate(id){
  selectedTemplate=id;noteEdited=false;selectButtons(el('pr-note-templates'),id);el('pr-recommendation-field').hidden=id!=='f';
  el('popup-partner-comment').value=contract.note(id,Object.assign({},context,{topic:noteTopic()}),el('pr-recommendation').value);
  checkLetter();
  if(id==='f')el('pr-recommendation').focus();else if(id==='g')el('popup-partner-comment').focus();
 }
 function letterStatus(text){if(el('pr-letter-status'))el('pr-letter-status').textContent=text;}
 function checkLetter(){
  var note=el('popup-partner-comment').value.trim(),hint=el('pr-letter-quality');if(!hint)return;
  var generic=contract.templates.slice(0,4).some(function(t){return note===contract.note(t[0],context);});
  hint.hidden=!generic;hint.textContent=generic?'Add one specific story from this conversation. A greeting alone does not tell the user what you remember.':'';
 }
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
  letterStatus('Checking this session’s saved conversation…');
  try{var data=await letterRequest('partner_letter_topics');if(run!==letterRun)return;
    letterTopics=Array.isArray(data.topics)?data.topics.slice(0,3):[];letterVersion=data.source_version||'';if(!selectedKeyword)paintSuggestions();
    [...new Set(letterTopics.flatMap(function(t){return t.words||t.nouns||[];}))].slice(0,5).forEach(function(word){var chip=document.createElement('span');chip.textContent=word;el('pr-letter-words').append(chip);});
    letterTopics.forEach(function(topic){var button=document.createElement('button');button.type='button';button.textContent=topic.label;button.title=topic.quote;button.dataset.value=topic.id;button.setAttribute('aria-pressed','false');
      button.addEventListener('click',function(){letterRun++;letterTopic=topic.id;selectButtons(el('pr-letter-topics'),topic.id);el('pr-letter-generate').disabled=false;el('pr-letter-drafts').replaceChildren();letterStatus('Recorded user speech: “'+topic.quote+'”');});el('pr-letter-topics').append(button);});
    letterStatus(letterTopics.length?'Choose a story, then request sentences. You can always write your own.':'No saved story is available yet. Write your own message, or refresh after the user’s transcript is saved.');
  }catch(_){if(run===letterRun)letterStatus('Suggestions are unavailable. You can write and send your own message.');}
 }
 function sentenceParts(){return el('popup-partner-comment').value.split(/\n+/).map(function(s){return s.trim();}).filter(Boolean);}
 function showSelected(){
  var host=el('pr-letter-selected');if(!host)return;host.replaceChildren();
  var parts=sentenceParts();if(parts.length<2)return;
  parts.forEach(function(sentence,i){var row=document.createElement('div'),text=document.createElement('p');text.textContent=sentence;row.append(text);
   [['Move up',-1],['Move down',1],['Remove',0]].forEach(function(action){var button=document.createElement('button');button.type='button';button.textContent=action[0];button.disabled=action[1]!==0&&(i+action[1]<0||i+action[1]>=parts.length);button.onclick=function(){var next=sentenceParts();if(action[1]===0)next.splice(i,1);else {var j=i+action[1];[next[i],next[j]]=[next[j],next[i]];}el('popup-partner-comment').value=next.join('\n');noteEdited=true;checkLetter();showSelected();};row.append(button);});host.append(row);});
 }
 async function suggestLetters(){
  if(!letterTopic)return;var run=++letterRun,topic=letterTopics.find(function(t){return t.id===letterTopic;});
  el('pr-letter-generate').disabled=true;letterStatus('Preparing three sentence ideas for your review…');
  try{var data=await letterRequest('partner_letter_blocks',{topic_id:letterTopic,source_version:letterVersion});if(run!==letterRun)return;
    if(!Array.isArray(data.blocks)||data.blocks.length!==3)throw Error('unavailable');
    var types=new Set();data.blocks.forEach(function(b){if(!b||b.source_utterance_id!==topic.id||!['memory','reaction','next'].includes(b.type)||types.has(b.type)||typeof b.text!=='string'||b.text.length>220)throw Error('invalid');types.add(b.type);});
    el('pr-letter-drafts').replaceChildren();
    data.blocks.forEach(function(block){var card=document.createElement('div'),label=document.createElement('strong'),text=document.createElement('p'),actions=document.createElement('div'),use=document.createElement('button'),copy=document.createElement('button');card.className='pr-letter-draft';label.textContent={memory:'Memory',reaction:'Personal reaction',next:'Next conversation'}[block.type];text.textContent=block.text;actions.className='pr-letter-block-actions';use.type=copy.type='button';use.textContent='Use this sentence';copy.textContent='Copy';
     use.onclick=function(){var area=el('popup-partner-comment'),parts=sentenceParts();if(parts.includes(block.text)){area.focus();return;}var value=(area.value.trim()?area.value.trim()+'\n':'')+block.text;if(value.length>1000){letterStatus('Your letter is full. Edit or remove a sentence before adding another.');return;}area.value=value;noteEdited=true;selectedTemplate='';checkLetter();showSelected();area.focus();letterStatus('Sentence added. Choose two or three, edit them in your own voice, then send when ready.');};
     copy.onclick=async function(){try{await navigator.clipboard.writeText(block.text);letterStatus('Sentence copied.');}catch(_){letterStatus('Use this sentence to add it to your letter.');}};actions.append(use,copy);card.append(label,text,actions);el('pr-letter-drafts').append(card);});
    letterStatus('Choose the sentences that fit your conversation. A reaction is only for use if it feels true to you. Nothing has been sent.');
  }catch(_){if(run===letterRun){el('pr-letter-drafts').replaceChildren();letterStatus('Suggestions are unavailable. Your letter is unchanged; you can write and send it yourself.');}}
  finally{if(run===letterRun)el('pr-letter-generate').disabled=!letterTopic;}
 }
 function mount(){
  if(initialized)return;root=el('partner-report-popup');if(!root)return;
  contract.templates.forEach(function(item){var button=document.createElement('button');button.type='button';button.textContent=item[1];button.dataset.value=item[0];button.setAttribute('aria-pressed','false');button.addEventListener('click',function(){selectTemplate(item[0]);});el('pr-note-templates').append(button);});
  if(window.DayOPartnerIllustration)window.DayOPartnerIllustration.subscribe(imageState);
  el('popup-partner-comment').addEventListener('input',function(){noteEdited=true;checkLetter();showSelected();});
  if(el('pr-letter-refresh'))el('pr-letter-refresh').addEventListener('click',loadLetterTopics);
  if(el('pr-letter-generate'))el('pr-letter-generate').addEventListener('click',suggestLetters);
  el('pr-recommendation').addEventListener('input',function(){if(selectedTemplate==='f'&&!noteEdited)el('popup-partner-comment').value=contract.note('f',context,el('pr-recommendation').value);});
  el('pr-use-keyword').addEventListener('click',function(){chooseKeyword(el('pr-custom-keyword').value,'custom');});
  el('pr-custom-keyword').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();chooseKeyword(e.target.value,'custom');}});
  el('pr-image-retry').addEventListener('click',requestIllustration);initialized=true;
 }
 function open(data){
  mount();if(!initialized)return;context=data||{};
  syncTopicTemplate();
  paintSuggestions();checkLetter();showSelected();
  if(context.bookingId&&letterBooking!==context.bookingId){
    if(letterBooking){el('popup-partner-comment').value='';selectedTemplate='';noteEdited=false;selectedKeyword='';imageUrl=null;request++;clearTimeout(timer);el('pr-illustration').hidden=true;el('pr-illustration').removeAttribute('src');el('pr-keyword-value').textContent='';paintSuggestions();}
    letterBooking=context.bookingId;loadLetterTopics();
  }
  var ko=window.partnerLetterLocale ? window.partnerLetterLocale()==='KO' : !!(window.DayOI18n&&window.DayOI18n.getLang&&String(window.DayOI18n.getLang()).toLowerCase()==='ko'&&localStorage.getItem('dayo_lang')==='KO');
  el('pr-title').textContent=ko?'파트너 레터':'Partner Letter';
  root.querySelector('.pr-intro').textContent=ko?'오늘의 대화를 떠올리며 짧은 메시지를 남겨 주세요.':'Leave a short, warm message about today’s conversation.';
  if(!el('btn-final-partner-submit').disabled)el('btn-final-partner-submit').textContent=ko?'메시지 보내고 마치기':'Send letter and finish';
 }
 document.addEventListener('dayo:langchange',function(){if(initialized&&root&&root.style.display!=='none')open(context);});
 window.DayOPartnerReport={open:open,refresh:function(data){context=data||context;if(initialized){syncTopicTemplate();if(!selectedKeyword)paintSuggestions();}},payload:function(){return {stamp:null,partnerComment:el('popup-partner-comment').value,keyword:selectedKeyword||null,illustUrl:imageUrl,illustrationToken:window.DayOPartnerIllustration&&(window.DayOPartnerIllustration.state(context.bookingId)||{}).token};}};
})();
