/* Private image review is independent of Letter drafts, submission and rewards. */
(function(w){'use strict';
 var panels=new WeakMap(),UUID=/^[a-f0-9-]{36}$/i;
 var copy={en:{title:'Conversation keepsake (optional)',preview:'Preview image',send:'Send this image',reject:"Don't use",checking:'Checking image status…',pending:'Review the exact image for any text, numbers, logos or watermarks before sending.',approved:'Image approved. The customer can see it.',unused:'Image not used. Your Letter can still be sent.',unknown:'Image status could not be confirmed. Check status before trying again.',unavailable:'No reviewable image is available. Your Letter can still be sent.',alt:'Private conversation keepsake for Partner review'},ko:{title:'대화 기념 그림 (선택)',preview:'그림 확인',send:'이 그림 보내기',reject:'사용하지 않기',checking:'그림 상태를 확인하고 있어요…',pending:'글자·숫자·로고·워터마크가 없는지 실제 그림을 확인한 뒤 보내 주세요.',approved:'그림을 승인했어요. 고객이 확인할 수 있어요.',unused:'그림을 사용하지 않아요. 레터는 그대로 보낼 수 있어요.',unknown:'그림 상태를 확인하지 못했어요. 다시 시도하기 전에 상태를 확인해 주세요.',unavailable:'확인할 수 있는 그림이 없어요. 레터는 그대로 보낼 수 있어요.',alt:'파트너 검토용 비공개 대화 그림'}};
 function create(host){
  var section=w.document.createElement('section');section.className='pr-section pr-keepsake-review';section.hidden=true;
  var title=w.document.createElement('h3'),status=w.document.createElement('p'),figure=w.document.createElement('figure'),image=w.document.createElement('img'),tools=w.document.createElement('div');
  status.className='pr-hint';status.setAttribute('role','status');status.setAttribute('aria-live','polite');figure.className='pr-preview';image.hidden=true;tools.className='pr-letter-tools';
  var buttons={};['preview','send','reject'].forEach(function(key){var b=w.document.createElement('button');b.type='button';b.dataset.keepsakeAction=key;buttons[key]=b;tools.append(b);});
  figure.append(image);section.append(title,status,figure,tools);var footer=host.querySelector('.pr-actions');if(footer)footer.before(section);else host.append(section);
  var p={host:host,section:section,title:title,status:status,image:image,buttons:buttons,booking:'',locale:'en',row:null,binding:null,seen:false,busy:false,epoch:0};
  buttons.preview.onclick=function(){void operate(p,'preview');};buttons.send.onclick=function(){void operate(p,'approve');};buttons.reject.onclick=function(){void operate(p,p.row&&p.row.review_state==='approved'?'revoke':'reject');};panels.set(host,p);return p;
 }
 function labels(p){var c=copy[p.locale];p.title.textContent=c.title;p.image.alt=c.alt;Object.keys(p.buttons).forEach(function(k){p.buttons[k].textContent=c[k];});}
 function controls(p){p.buttons.preview.disabled=p.busy;p.buttons.send.disabled=p.busy||!p.seen||!p.binding||!p.row||p.row.review_state!=='pending';p.buttons.reject.disabled=p.busy||!p.seen||!p.binding||!p.row||!['pending','approved'].includes(p.row.review_state);}
 function clear(p){p.seen=false;p.binding=null;p.image.hidden=true;p.image.removeAttribute('src');}
 async function api(p,input){var db=w.supabaseClient;if(!db)throw Error('auth_required');var a=await db.auth.getSession(),jwt=a.data&&a.data.session&&a.data.session.access_token;if(!jwt)throw Error('auth_required');
  var controller=new w.AbortController(),timer=w.setTimeout(function(){controller.abort();},15000);
  try{var r=await w.fetch('/api/conversation-recap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify({action:'keepsake_review',review:Object.assign({booking_id:p.booking},input)}),signal:controller.signal});var data=await r.json();if(!r.ok)throw Error(data.error||'review_unavailable');return data;}finally{w.clearTimeout(timer);}
 }
 function bound(p,result){var a=result&&result.asset;return !!a&&result.booking_id===p.booking&&result.attempt_id===p.row.id&&a.bucket==='dayo-keepsakes'&&a.object_path===p.row.object_path&&a.image_sha256===p.row.image_sha256&&a.storage_version===p.row.storage_version&&result.content_type==='image/png'&&typeof result.data==='string';}
 async function list(p,run){var rows=await api(p,{action:'list'});if(run!==p.epoch)return false;if(!Array.isArray(rows))throw Error('invalid_response');
  var row=rows.find(function(r){return r.booking_id===p.booking&&UUID.test(r.id||'')&&r.image_sha256&&r.storage_version;});p.row=row||null;clear(p);p.section.hidden=!row;p.status.textContent=copy[p.locale][!row?'unavailable':row.review_state==='approved'?'approved':['rejected','revoked'].includes(row.review_state)?'unused':'pending'];return !!row;
 }
 async function operate(p,action){if(p.busy)return;var run=++p.epoch;p.busy=true;p.status.textContent=copy[p.locale].checking;controls(p);
  try{
   if(action==='preview'){if(!await list(p,run)||p.row.state!=='ready'){p.status.textContent=copy[p.locale].unavailable;return;}var result=await api(p,{action:'preview',attempt_id:p.row.id});if(run!==p.epoch)return;if(!bound(p,result))throw Error('image_version_changed');
    p.image.src='data:image/png;base64,'+result.data;await new Promise(function(resolve,reject){p.image.onload=resolve;p.image.onerror=function(){reject(Error('image_load_failed'));};});if(run!==p.epoch)return;if(p.image.naturalWidth!==1024||p.image.naturalHeight!==1024)throw Error('invalid_image');
    p.binding=result.asset;p.seen=true;p.image.hidden=false;p.status.textContent=copy[p.locale][p.row.review_state==='approved'?'approved':'pending'];
   }else{
    if(!p.seen||!p.binding||!p.row)throw Error('preview_required');var binding=p.binding,row=p.row;
    var result=await api(p,{action:action,attempt_id:row.id,image_sha256:binding.image_sha256,object_path:binding.object_path,storage_version:binding.storage_version});if(run!==p.epoch)return;
    if(result.status!==({approve:'approved',reject:'rejected',revoke:'revoked'})[action])throw Error('confirmation_unknown');
    await list(p,run);
   }
  }catch(_){if(run===p.epoch){clear(p);p.status.textContent=copy[p.locale].unknown;}}
  finally{if(run===p.epoch){p.busy=false;controls(p);}}
 }
 async function open(booking,host,locale){if(!host||!UUID.test(booking||''))return;var p=panels.get(host)||create(host);if(p.busy&&p.booking===booking)return;
  p.booking=booking;p.locale=locale==='ko'?'ko':'en';labels(p);var run=++p.epoch;p.busy=true;clear(p);controls(p);
  try{await list(p,run);}catch(_){if(run===p.epoch){p.section.hidden=true;clear(p);}}finally{if(run===p.epoch){p.busy=false;controls(p);}}
 }
 w.DayOKeepsakePartnerReview={open:open};
})(window);
