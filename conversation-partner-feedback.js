/* Optional feedback is independent of recap rendering and settlement. */
(function(){
 'use strict';
 var GOOD=["spoke_slowly","waited_for_me","helped_with_words","helped_with_expressions","asked_good_questions","made_me_comfortable","kept_conversation_going"],REQUESTS=["speak_more_slowly","speak_more_quickly","wait_more","correct_more","help_more_with_words","speak_more","listen_more","ask_more_questions"],dialog=null,sequence=0,offered={},partnerRun=0;
 function text(key,partner){var i=window.DayOI18n;var lang=partner?(document.documentElement.lang==='ko'?'KO':'EN'):(i?i.getLang():'KO');return i?i.t('conversationFeedback.'+key,lang):key;}
 function node(tag,value,cls){var n=document.createElement(tag);if(value)n.textContent=value;if(cls)n.className=cls;return n;}
 function button(key,handler,cls,partner){var b=node('button',text(key,partner),cls);b.type='button';b.addEventListener('click',handler);return b;}
 function access(){var a=window.DayORoomAccess;return a&&a.allowed&&!a.observer&&!a.adminTest&&a.role==='user'&&/^[0-9a-f-]{36}$/i.test(a.bookingId||'')?a:null;}
 async function rpc(name,args){var c=window.supabaseClient;if(!c)throw new Error('unavailable');var timer;try{return await Promise.race([Promise.resolve(c.rpc(name,args)).then(function(r){if(r.error)throw new Error('unavailable');return r.data;}),new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error('timeout'));},8000);})]);}finally{clearTimeout(timer);}}
 function close(){sequence++;if(dialog){dialog.close();dialog.remove();dialog=null;}}
 async function open(){var a=access();if(!a||dialog)return;var id=a.bookingId,run=++sequence;
  var d=node('dialog',null,'cpf-dialog');dialog=d;d.setAttribute('aria-labelledby','cpf-title');
  var title=node('h2',text('title'));title.id='cpf-title';d.append(title,node('p',text('hint'),'cpf-hint'));
  var form=node('div',null,'cpf-form');d.append(form);
  function group(key,keys){var f=node('fieldset'),legend=node('legend',text(key));f.append(legend);var chips=node('div',null,'cpf-chips');keys.forEach(function(k){var label=node('label',null,'cpf-chip');var input=node('input');input.type='checkbox';input.name=key;input.value=k;label.append(input,node('span',text(key+'.'+k)));chips.append(label);});f.append(chips);form.append(f);}
  group('good',GOOD);group('requests',REQUESTS);
  var privateBox=node('details',null,'cpf-private'),summary=node('summary',text('private')),note=node('textarea');note.maxLength=1000;note.rows=3;note.setAttribute('aria-label',text('private'));privateBox.append(summary,node('p',text('privateHint')),note);form.append(privateBox);
  var status=node('p',text('loading'),'cpf-status');status.setAttribute('role','status');
  var actions=node('div',null,'cpf-actions'),save=button('save',submit,'cpf-primary'),skip=button('skip',close,'cpf-secondary'),retry=button('retry',load,'cpf-secondary');retry.hidden=true;save.disabled=true;form.querySelectorAll('input,textarea').forEach(function(n){n.disabled=true;});
  actions.append(save,skip);d.append(status,retry,actions);d.addEventListener('cancel',function(e){e.preventDefault();close();});document.body.append(d);d.showModal();
  function active(){return run===sequence&&dialog===d&&access()&&access().bookingId===id;}
  function enable(value){form.querySelectorAll('input,textarea').forEach(function(n){n.disabled=!value;});save.disabled=!value;}
  async function load(){retry.hidden=true;status.textContent=text('loading');enable(false);try{var row=await rpc('get_my_conversation_partner_feedback',{p_booking_id:id});if(!active())return;
    form.querySelectorAll('input').forEach(function(n){n.checked=!!(row&&Array.isArray(row[n.name])&&row[n.name].indexOf(n.value)>=0);});note.value=row&&row.private_admin_note||'';status.textContent='';enable(true);
   }catch(_){if(active()){status.textContent=text('loadError');retry.hidden=false;}}}
  async function submit(){if(save.disabled)return;var g=Array.from(form.querySelectorAll('input[name="good"]:checked')).map(function(n){return n.value;}),r=Array.from(form.querySelectorAll('input[name="requests"]:checked')).map(function(n){return n.value;});if(!g.length&&!r.length&&!note.value.trim()){close();return;}
   enable(false);status.textContent=text('saving');try{await rpc('save_conversation_partner_feedback',{p_booking_id:id,p_good:g,p_requests:r,p_private_admin_note:note.value.trim()||null});if(active())close();}
   catch(_){if(active()){status.textContent=text('saveError');enable(true);}}}
  load();
 }
 function mountRecap(){var box=document.getElementById('quiz-content-box');if(!box||!access()||box.querySelector('.cpf-entry'))return;box.append(button('edit',open,'cpf-entry cpf-secondary'));}
 function offer(e){var a=access();if(!a||a.recapOnly||!e.detail||!e.detail.finalized||offered[a.bookingId])return;offered[a.bookingId]=true;mountRecap();open();}
 async function loadPartner(section){var run=++partnerRun,list=section.querySelector('.cpf-partner-list');list.replaceChildren(node('p',text('loading',true)));try{var rows=await rpc('list_my_partner_conversation_feedback',{});if(run!==partnerRun||!section.isConnected)return;list.replaceChildren();if(!rows||!rows.length)list.append(node('p',text('empty',true)));(rows||[]).forEach(function(row){var item=node('article',null,'cpf-partner-item');var lang=document.documentElement.lang==='ko'?'ko-KR':'en-US';var date=new Date(row.scheduled_at);item.append(node('h4',(isNaN(date)?'':date.toLocaleString(lang))+' · '+row.booking_id.slice(0,8)));['good','requests'].forEach(function(key){if(!Array.isArray(row[key])||!row[key].length)return;item.append(node('strong',text(key,true)));var ul=node('ul');row[key].forEach(function(k){if((key==='good'?GOOD:REQUESTS).indexOf(k)>=0)ul.append(node('li',text(key+'.'+k,true)));});item.append(ul);});list.append(item);});}
  catch(_){if(run===partnerRun&&section.isConnected)list.replaceChildren(node('p',text('partnerError',true)));}}
 function mountPartner(){var list=document.querySelector('.pd-past-list');if(!list||document.getElementById('cpf-partner'))return;var card=node('section',null,'dashboard-card cpf-partner');card.id='cpf-partner';card.append(node('h3',text('partnerTitle',true)),button('refresh',function(){loadPartner(card);},'cpf-secondary',true),node('div',null,'cpf-partner-list'));list.closest('.dashboard-card').after(card);loadPartner(card);}
 function boot(){var box=document.getElementById('quiz-content-box');var observer=new MutationObserver(mountRecap);if(box)observer.observe(box,{childList:true});
  var partnerObserver=null;if(document.getElementById('partner-dashboard-section')){partnerObserver=new MutationObserver(function(){mountPartner();if(document.getElementById('cpf-partner'))partnerObserver.disconnect();});partnerObserver.observe(document.getElementById('partner-dashboard-section'),{childList:true,subtree:true});}
  window.addEventListener('pagehide',function(){observer.disconnect();if(partnerObserver)partnerObserver.disconnect();});
  document.addEventListener('dayo:partner-authorized',function(){mountPartner();var section=document.getElementById('cpf-partner');if(section)loadPartner(section);});mountRecap();mountPartner();
  document.addEventListener('dayo:langchange',function(){var entry=document.querySelector('.cpf-entry');if(entry)entry.textContent=text('edit');var section=document.getElementById('cpf-partner');if(section){section.querySelector('h3').textContent=text('partnerTitle',true);section.querySelector('button').textContent=text('refresh',true);loadPartner(section);}});
 }
 document.addEventListener('dayo:session-ended',offer);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
