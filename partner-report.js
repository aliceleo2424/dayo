(function(){
 'use strict';
 var contract=window.DayOPartnerReportContract,root,context={},selectedKeyword='',imageUrl=null,request=0,timer=null,initialized=false,selectedTemplate='',noteEdited=false,letterBooking='';
 function el(id){return document.getElementById(id);}
 function selectButtons(container,value){container.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.value===value));});}
 function setImageStatus(text){el('pr-image-status').textContent=text;}
 function requestIllustration(){
  var keyword=contract.safeKeyword(selectedKeyword);if(!keyword)return;
  var run=++request;clearTimeout(timer);imageUrl=null;
  var old=el('pr-illustration'),image=document.createElement('img');image.id='pr-illustration';image.alt='Conversation keepsake illustration';image.referrerPolicy='no-referrer';image.hidden=true;old.replaceWith(image);
  setImageStatus('Creating your illustration… You can submit now.');
  var pending=true,url=contract.illustrationUrl(keyword,Math.floor(Math.random()*1000000));
  function failed(){if(run!==request||!pending)return;pending=false;clearTimeout(timer);imageUrl=null;image.hidden=true;setImageStatus('Illustration unavailable. Your theme will still be saved.');}
  image.onload=function(){if(run!==request||!pending)return;if(!image.naturalWidth){failed();return;}pending=false;clearTimeout(timer);imageUrl=url;image.hidden=false;setImageStatus(keyword);};
  if(!url){failed();setImageStatus('Illustration unavailable for this topic. Your theme will still be saved.');return;}
  image.onerror=failed;timer=setTimeout(failed,12000);image.src=url;
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
  var candidates=contract.suggestions(context);
  el('pr-keyword-hint').textContent=candidates.length?'Short topics supported by your conversation.':'No specific theme found. Write a short topic or phrase.';
  candidates.forEach(function(word){var button=document.createElement('button');button.type='button';button.textContent=word;button.dataset.value=word;button.setAttribute('aria-pressed',String(word===selectedKeyword));button.addEventListener('click',function(){el('pr-custom-keyword-field').hidden=true;chooseKeyword(word,'suggested');});list.append(button);});
  var custom=document.createElement('button');custom.type='button';custom.textContent='Write my own';custom.dataset.value='custom';custom.setAttribute('aria-pressed','false');custom.addEventListener('click',function(){el('pr-custom-keyword-field').hidden=false;el('pr-custom-keyword').focus();});list.append(custom);
 }
 function selectTemplate(id){
  selectedTemplate=id;noteEdited=false;selectButtons(el('pr-note-templates'),id);el('pr-recommendation-field').hidden=id!=='f';
  el('popup-partner-comment').value=contract.note(id,Object.assign({},context,{topic:noteTopic()}),el('pr-recommendation').value);
  if(id==='f')el('pr-recommendation').focus();else if(id==='g')el('popup-partner-comment').focus();
 }
 function mount(){
  if(initialized)return;root=el('partner-report-popup');if(!root)return;
  contract.templates.forEach(function(item){var button=document.createElement('button');button.type='button';button.textContent=item[1];button.dataset.value=item[0];button.setAttribute('aria-pressed','false');button.addEventListener('click',function(){selectTemplate(item[0]);});el('pr-note-templates').append(button);});
  var existingIcons=root.querySelectorAll('[data-pr-treat-icon]');
  contract.treats.forEach(function(treat,index){var label=document.createElement('label');label.className='pr-choice';var input=document.createElement('input');input.type='radio';input.name='popup_stamp';input.value=treat.code;var text=document.createElement('span'),title=document.createElement('strong'),meaning=document.createElement('small');title.textContent=treat.label;meaning.textContent=treat.meaning;text.append(title,meaning);label.append(input);if(existingIcons[index]){var icon=existingIcons[index].cloneNode(true);icon.removeAttribute('data-pr-treat-icon');label.append(icon);}label.append(text);el('pr-treats').append(label);});
  el('popup-partner-comment').addEventListener('input',function(){noteEdited=true;});
  el('pr-recommendation').addEventListener('input',function(){if(selectedTemplate==='f'&&!noteEdited)el('popup-partner-comment').value=contract.note('f',context,el('pr-recommendation').value);});
  el('pr-use-keyword').addEventListener('click',function(){chooseKeyword(el('pr-custom-keyword').value,'custom');});
  el('pr-custom-keyword').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();chooseKeyword(e.target.value,'custom');}});
  el('pr-image-retry').addEventListener('click',requestIllustration);initialized=true;
 }
 function open(data){
  mount();if(!initialized)return;context=data||{};
  syncTopicTemplate();
  if(letterBooking && letterBooking!==context.bookingId){el('popup-partner-comment').value='';selectedTemplate='';noteEdited=false;}
  letterBooking=context.bookingId||'';paintSuggestions();
  var ko=window.DayOI18n&&window.DayOI18n.getLang&&window.DayOI18n.getLang().toLowerCase()==='ko';
  el('pr-title').textContent=ko?'파트너 레터':'Partner Letter';
  root.querySelector('.pr-intro').textContent=ko?'오늘의 대화를 떠올리며 짧은 메시지를 남겨 주세요.':'Leave a short, warm message about today’s conversation.';
  el('btn-final-partner-submit').textContent=ko?'메시지 보내고 마치기':'Send letter and finish';
 }
 window.DayOPartnerReport={open:open,refresh:function(data){context=data||context;if(initialized){syncTopicTemplate();if(!selectedKeyword)paintSuggestions();}},payload:function(){return {partnerComment:el('popup-partner-comment').value,stamp:(root.querySelector('input[name="popup_stamp"]:checked')||{}).value||null,keyword:selectedKeyword||null,illustUrl:imageUrl};}};
})();
